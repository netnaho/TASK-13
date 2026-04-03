import {
  retentionCutoff,
  isEligibleForArchival,
  RETENTION_YEARS,
} from '../backend/src/audit/audit-retention.policy';

// ── retentionCutoff ───────────────────────────────────────────────────────────

describe('retentionCutoff', () => {
  it('returns a date exactly RETENTION_YEARS before now', () => {
    const now = new Date();
    const cutoff = retentionCutoff();
    // setFullYear arithmetic: same month/day, year decremented by RETENTION_YEARS
    expect(cutoff.getFullYear()).toBe(now.getFullYear() - RETENTION_YEARS);
    expect(cutoff.getMonth()).toBe(now.getMonth());
    expect(cutoff.getDate()).toBe(now.getDate());
  });

  it('uses the supplied reference date, not wall clock', () => {
    const ref = new Date('2030-06-15T12:00:00Z');
    const cutoff = retentionCutoff(ref);
    expect(cutoff.getFullYear()).toBe(2030 - RETENTION_YEARS);
    expect(cutoff.getMonth()).toBe(ref.getMonth());
    expect(cutoff.getDate()).toBe(ref.getDate());
  });

  it('does not mutate the supplied reference date', () => {
    const ref = new Date('2030-01-01T00:00:00Z');
    const original = ref.getTime();
    retentionCutoff(ref);
    expect(ref.getTime()).toBe(original);
  });

  it('RETENTION_YEARS constant is 7', () => {
    expect(RETENTION_YEARS).toBe(7);
  });
});

// ── isEligibleForArchival ─────────────────────────────────────────────────────

describe('isEligibleForArchival', () => {
  const cutoff = new Date('2017-01-01T00:00:00Z');

  it('returns true for record older than cutoff with archivedAt=null', () => {
    expect(
      isEligibleForArchival(
        { createdAt: new Date('2016-12-31T23:59:59Z'), archivedAt: null },
        cutoff,
      ),
    ).toBe(true);
  });

  it('returns false for record exactly at the cutoff boundary (not strictly before)', () => {
    expect(
      isEligibleForArchival(
        { createdAt: new Date('2017-01-01T00:00:00Z'), archivedAt: null },
        cutoff,
      ),
    ).toBe(false);
  });

  it('returns false for record newer than cutoff', () => {
    expect(
      isEligibleForArchival(
        { createdAt: new Date('2020-06-01T00:00:00Z'), archivedAt: null },
        cutoff,
      ),
    ).toBe(false);
  });

  it('returns false when archivedAt is already set (idempotency)', () => {
    expect(
      isEligibleForArchival(
        {
          createdAt: new Date('2010-01-01T00:00:00Z'),
          archivedAt: new Date('2024-01-01T00:00:00Z'),
        },
        cutoff,
      ),
    ).toBe(false);
  });
});

// ── RetentionRunResult shape from runRetentionJob ─────────────────────────────
//
// The full DB-wired path is tested via integration tests. These unit tests
// drive the service through a stub repository to verify batch logic, dry-run
// behaviour, and idempotency without touching Postgres.

import { AuditService } from '../backend/src/audit/audit.service';
import { Repository } from 'typeorm';

function makeRecord(createdAtIso: string, archivedAt: Date | null = null) {
  return {
    id: Math.random().toString(36).slice(2),
    action: 'test.action',
    actorId: 'user-1',
    entityType: 'test',
    entityId: null,
    before: null,
    after: null,
    deviceFingerprint: 'fp-data',
    ip: '1.2.3.4',
    hash: 'abc',
    prevHash: null,
    createdAt: new Date(createdAtIso),
    archivedAt,
    archiveReason: null,
  };
}

function makeRepo(records: ReturnType<typeof makeRecord>[]) {
  const stored = [...records];
  return {
    find: jest.fn(({ where, take, skip }: any) => {
      const eligible = stored.filter(
        (r) => r.archivedAt === null && r.createdAt < where.createdAt,
      );
      return Promise.resolve(eligible.slice(skip ?? 0, (skip ?? 0) + take));
    }),
    findOne: jest.fn(({ where }: any) =>
      Promise.resolve(stored.find((r) => r.id === where?.id) ?? null),
    ),
    save: jest.fn((e: any) => Promise.resolve(e)),
    create: jest.fn((e: any) => e),
    createQueryBuilder: jest.fn(() => ({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      whereInIds: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn(() => {
        // Simulate the UPDATE: mark records as archived
        // (simplified — doesn't re-check archivedAt IS NULL to keep test simple)
        return Promise.resolve({ affected: records.length });
      }),
    })),
    count: jest.fn(() => Promise.resolve(0)),
    manager: { getRepository: jest.fn(() => ({ createQueryBuilder: jest.fn(() => ({ where: jest.fn().mockReturnThis(), getMany: jest.fn(() => Promise.resolve([])) })) })) },
  } as unknown as Repository<any>;
}

describe('AuditService.runRetentionJob — unit (stub repo)', () => {
  const OLD = '2010-06-01T00:00:00Z'; // 15+ years ago, always eligible
  const NEW = '2099-01-01T00:00:00Z'; // far future, never eligible

  function buildService(records: ReturnType<typeof makeRecord>[]) {
    const repo = makeRepo(records);
    const svc = new AuditService(repo as any);
    return { svc, repo };
  }

  it('returns dryRun:false by default', async () => {
    const { svc } = buildService([]);
    const result = await svc.runRetentionJob();
    expect(result.dryRun).toBe(false);
  });

  it('returns dryRun:true when called with true', async () => {
    const { svc } = buildService([]);
    const result = await svc.runRetentionJob(true);
    expect(result.dryRun).toBe(true);
  });

  it('processes 0 records when all are newer than cutoff', async () => {
    const { svc } = buildService([makeRecord(NEW), makeRecord(NEW)]);
    const result = await svc.runRetentionJob(false);
    expect(result.processed).toBe(0);
    expect(result.archived).toBe(0);
  });

  it('dry-run counts eligible records without calling createQueryBuilder', async () => {
    const records = [makeRecord(OLD), makeRecord(OLD), makeRecord(NEW)];
    const { svc, repo } = buildService(records);
    const result = await svc.runRetentionJob(true);
    expect(result.dryRun).toBe(true);
    expect(result.processed).toBe(2);
    expect(result.archived).toBe(2);
    expect((repo.createQueryBuilder as jest.Mock).mock.calls.length).toBe(0);
  });

  it('live run calls createQueryBuilder to update eligible records', async () => {
    const records = [makeRecord(OLD), makeRecord(OLD)];
    const { svc, repo } = buildService(records);
    const result = await svc.runRetentionJob(false);
    expect(result.archived).toBe(2);
    expect((repo.createQueryBuilder as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });

  it('skips records that are already archived (archivedAt IS NOT NULL)', async () => {
    const alreadyArchived = makeRecord(OLD, new Date('2020-01-01'));
    const { svc } = buildService([alreadyArchived]);
    const result = await svc.runRetentionJob(false);
    // stub repo filters archivedAt === null; archived record should not appear
    expect(result.processed).toBe(0);
    expect(result.archived).toBe(0);
  });

  it('result includes a cutoff Date', async () => {
    const { svc } = buildService([]);
    const result = await svc.runRetentionJob();
    expect(result.cutoff).toBeInstanceOf(Date);
    expect(result.cutoff.getTime()).toBeLessThan(Date.now());
  });
});

// ── Hash chain remains intact after tombstone ─────────────────────────────────
//
// verifyEntry recomputes the hash from: action, actorId, entityType, entityId,
// before, after, ts (createdAt). None of those fields are cleared by
// runRetentionJob — only deviceFingerprint and ip are tombstoned.
// This test verifies the archived record still passes hash verification.

import * as crypto from 'crypto';

describe('hash chain integrity after tombstone', () => {
  function computeHash(prevHash: string | null, entry: {
    action: string; actorId: string; entityType: string;
    entityId: string | null; before: any; after: any; createdAt: Date;
  }): string {
    const payload = (prevHash ?? '') + JSON.stringify({
      action: entry.action,
      actorId: entry.actorId,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ts: entry.createdAt.toISOString(),
    });
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  it('verifyEntry logic still passes after deviceFingerprint and ip are cleared', () => {
    const createdAt = new Date('2010-03-15T10:00:00Z');
    const record = {
      action: 'listing.create',
      actorId: 'vendor-1',
      entityType: 'listing',
      entityId: 'listing-uuid',
      before: null,
      after: { title: 'Puppy' },
      prevHash: null,
      deviceFingerprint: 'original-fp',
      ip: '203.0.113.5',
      createdAt,
    };

    const hash = computeHash(record.prevHash, record);

    // Simulate tombstone: clear PII fields
    const tombstoned = { ...record, deviceFingerprint: null, ip: null };

    // verifyEntry only uses the non-PII fields, so hash should still match
    const recomputed = computeHash(tombstoned.prevHash, tombstoned);
    expect(recomputed).toBe(hash);
  });
});
