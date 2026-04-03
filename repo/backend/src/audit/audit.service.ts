import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThan } from 'typeorm';
import * as crypto from 'crypto';
import { AuditLog } from '../database/entities/audit-log.entity';
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
   * Tombstone strategy: `deviceFingerprint` and `ip` (PII) are cleared; all
   * fields that form the SHA-256 hash payload (action, actorId, entityType,
   * entityId, before, after, ts/createdAt) are untouched so the chain stays
   * fully verifiable after archival.
   *
   * Idempotent: the WHERE clause includes `archivedAt IS NULL`, so re-running
   * the job never double-processes a record.
   *
   * @param dryRun When true, counts eligible records without modifying them.
   */
  async runRetentionJob(dryRun = false): Promise<RetentionRunResult> {
    const cutoff = retentionCutoff();
    let processed = 0;
    let archived = 0;
    let offset = 0;

    while (true) {
      const batch = await this.auditRepo.find({
        where: {
          archivedAt: IsNull(),
          createdAt: LessThan(cutoff),
        },
        order: { createdAt: 'ASC' },
        take: RETENTION_BATCH_SIZE,
        // In live mode the processed records are marked archivedAt IS NOT NULL,
        // so the query self-shrinks and offset stays 0.  In dry-run mode
        // nothing changes, so we must page forward manually.
        skip: dryRun ? offset : 0,
      });

      if (batch.length === 0) break;

      processed += batch.length;

      if (!dryRun) {
        const ids = batch.map((r: AuditLog) => r.id);
        const now = new Date();
        await this.auditRepo
          .createQueryBuilder()
          .update(AuditLog)
          .set({ deviceFingerprint: null, ip: null, archivedAt: now, archiveReason: ARCHIVE_REASON })
          .whereInIds(ids)
          .andWhere('archivedAt IS NULL') // belt-and-suspenders idempotency guard
          .execute();
        archived += batch.length;
      } else {
        archived += batch.length;
        offset += RETENTION_BATCH_SIZE;
      }

      if (batch.length < RETENTION_BATCH_SIZE) break;
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
