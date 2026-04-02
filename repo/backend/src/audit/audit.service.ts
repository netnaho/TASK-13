import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { AuditLog } from '../database/entities/audit-log.entity';
import { User } from '../database/entities/user.entity';

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

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

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

    const actorIds = [...new Set(items.map((i) => i.actorId).filter(Boolean))];
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

    const enriched = items.map((item) => ({
      ...item,
      actorUsername: userMap[item.actorId] ?? 'unknown',
    }));

    return { items: enriched, total };
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
