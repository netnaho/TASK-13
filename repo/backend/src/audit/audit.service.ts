import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import * as crypto from 'crypto';
import { AuditLog } from '../database/entities/audit-log.entity';
import { AuditArchivalRecord } from '../database/entities/audit-archival-record.entity';
import { User } from '../database/entities/user.entity';
import {
  RETENTION_BATCH_SIZE,
  ARCHIVE_REASON,
  retentionCutoff,
} from './audit-retention.policy';

export interface AuditLogInput {
  action: string;
  actorId: string;
  entityType: string;
  entityId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  deviceFingerprint?: string;
  ip?: string;
}

export interface RetentionRunResult {
  dryRun: boolean;
  processed: number;
  archived: number;
  cutoff: Date;
}

export interface AuditFilters {
  actorId?: string;
  entityType?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  keyword?: string;
  page?: number;
  limit?: number;
}

const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily

@Injectable()
export class AuditService implements OnModuleInit, OnModuleDestroy {
  private retentionTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
    @InjectRepository(AuditArchivalRecord)
    private readonly archivalRepo: Repository<AuditArchivalRecord>,
  ) {}

  onModuleInit(): void {
    this.retentionTimer = setInterval(() => {
      this.runRetentionJob(false).catch(() => {
        // swallow — retention failures must not crash the service
      });
    }, RETENTION_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.retentionTimer) {
      clearInterval(this.retentionTimer);
      this.retentionTimer = null;
    }
  }

  async log(input: AuditLogInput): Promise<AuditLog> {
    const latest = await this.auditRepo.findOne({
      where: {},
      order: { createdAt: 'DESC' },
    });

    const prevHash = latest?.hash ?? null;
    const ts = new Date().toISOString();
    const hashPayload = (prevHash ?? '') + JSON.stringify({
      action: input.action,
      actorId: input.actorId,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      ts,
    });
    const hash = crypto.createHash('sha256').update(hashPayload).digest('hex');

    const entry = this.auditRepo.create({
      action: input.action,
      actorId: input.actorId,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      deviceFingerprint: input.deviceFingerprint ?? null,
      ip: input.ip ?? null,
      hash,
      prevHash,
      createdAt: new Date(ts),
    });

    return this.auditRepo.save(entry);
  }

  async findAll(
    page = 1,
    limit = 50,
  ): Promise<{ items: AuditLog[]; total: number }> {
    const [items, total] = await this.auditRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }

  async findAllFiltered(
    filters: AuditFilters,
  ): Promise<{ items: (AuditLog & { actorUsername?: string })[]; total: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));

    const qb = this.auditRepo
      .createQueryBuilder('a')
      .orderBy('a.createdAt', 'DESC');

    if (filters.actorId) {
      qb.andWhere('a.actorId = :actorId', { actorId: filters.actorId });
    }
    if (filters.entityType) {
      qb.andWhere('a.entityType = :entityType', { entityType: filters.entityType });
    }
    if (filters.action) {
      qb.andWhere('a.action ILIKE :action', { action: `%${filters.action}%` });
    }
    if (filters.startDate) {
      qb.andWhere('a.createdAt >= :startDate', { startDate: new Date(filters.startDate) });
    }
    if (filters.endDate) {
      qb.andWhere('a.createdAt <= :endDate', { endDate: new Date(filters.endDate) });
    }
    if (filters.keyword) {
      qb.andWhere(
        '(CAST(a.before AS text) ILIKE :kw OR CAST(a.after AS text) ILIKE :kw)',
        { kw: `%${filters.keyword}%` },
      );
    }

    qb.skip((page - 1) * limit).take(limit);

    const [items, total] = await qb.getManyAndCount();

    const actorIds = [...new Set(items.map((i: AuditLog) => i.actorId).filter(Boolean))];
    const userMap: Record<string, string> = {};
    if (actorIds.length > 0) {
      const userRepo = this.auditRepo.manager.getRepository(User);
      const users = await userRepo
        .createQueryBuilder('u')
        .where('u.id IN (:...ids)', { ids: actorIds })
        .getMany();
      for (const u of users) {
        userMap[u.id] = u.username;
      }
    }

    const enriched = items.map((item: AuditLog) => ({
      ...item,
      actorUsername: userMap[item.actorId] ?? 'unknown',
    }));

    return { items: enriched, total };
  }

  /**
   * Archives audit records older than the 7-year retention boundary.
   *
   * Strict append-only semantics: original AuditLog rows are NEVER mutated
   * after creation.  Instead, each eligible record gets a corresponding row
   * inserted into `audit_archival_records`, and a single tombstone entry is
   * appended to the audit chain documenting the run.
   *
   * Idempotency: the unique constraint on audit_archival_records.auditLogId
   * ensures the same record cannot be processed twice.
   *
   * @param dryRun When true, counts eligible records without creating any rows.
   */
  async runRetentionJob(dryRun = false): Promise<RetentionRunResult> {
    const cutoff = retentionCutoff();

    // Load the set of already-archived audit log IDs for efficient in-loop
    // idempotency checks without mutating the original rows.
    const alreadyArchivedIds = new Set<string>(
      (await this.archivalRepo.find({ select: ['auditLogId'] } as any))
        .map((r: AuditArchivalRecord) => r.auditLogId),
    );

    let processed = 0;
    let archived = 0;
    let offset = 0;

    while (true) {
      // Fetch all records older than cutoff, page forward on each iteration.
      // We cannot rely on archivedAt IS NULL on the original rows (they are
      // immutable), so we page manually and filter via alreadyArchivedIds.
      const batch = await this.auditRepo.find({
        where: { createdAt: LessThan(cutoff) },
        order: { createdAt: 'ASC' },
        take: RETENTION_BATCH_SIZE,
        skip: offset,
      });

      if (batch.length === 0) break;

      const newBatch = batch.filter((r: AuditLog) => !alreadyArchivedIds.has(r.id));

      if (newBatch.length > 0) {
        processed += newBatch.length;

        if (!dryRun) {
          const now = new Date();
          const archivalRecords = newBatch.map((r: AuditLog) =>
            this.archivalRepo.create({
              auditLogId: r.id,
              archivedAt: now,
              archiveReason: ARCHIVE_REASON,
            }),
          );
          await this.archivalRepo.save(archivalRecords);
          archived += newBatch.length;

          // Track locally so subsequent batches in the same run see them.
          for (const r of newBatch) alreadyArchivedIds.add(r.id);
        } else {
          archived += newBatch.length;
        }
      }

      offset += batch.length;

      if (batch.length < RETENTION_BATCH_SIZE) break;
    }

    // Append an immutable tombstone documenting this retention run.
    // Preserves append-only semantics: the archival decision is a new,
    // unforgeable entry in the hash chain rather than an implicit mutation.
    if (!dryRun && archived > 0) {
      await this.log({
        action: 'audit.retention_archival',
        actorId: 'system',
        entityType: 'audit_log',
        after: {
          count: archived,
          cutoff: cutoff.toISOString(),
          reason: ARCHIVE_REASON,
        },
      });
    }

    return { dryRun, processed, archived, cutoff };
  }

  async verifyEntry(id: string): Promise<{ valid: boolean; entry: AuditLog }> {
    const entry = await this.auditRepo.findOne({ where: { id } });
    if (!entry) {
      throw new Error('Audit entry not found');
    }

    const recomputedPayload = (entry.prevHash ?? '') + JSON.stringify({
      action: entry.action,
      actorId: entry.actorId,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ts: entry.createdAt.toISOString(),
    });
    const recomputedHash = crypto
      .createHash('sha256')
      .update(recomputedPayload)
      .digest('hex');

    return {
      valid: recomputedHash === entry.hash,
      entry,
    };
  }
}
