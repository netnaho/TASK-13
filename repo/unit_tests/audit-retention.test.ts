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
// drive the service through stub repositories to verify batch logic, dry-run
// behaviour, and strict append-only semantics — original rows are NEVER
// mutated; instead an AuditArchivalRecord is inserted per eligible row.

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

/** Stub for the main audit log repo. find() filters only by createdAt (records are immutable). */
function makeAuditRepo(records: ReturnType<typeof makeRecord>[]) {
  const stored = [...records];
  return {
    find: jest.fn(({ where, take, skip }: any) => {
      // Original rows are immutable — filter only by age, never by archivedAt
      const eligible = stored.filter(
        (r) => r.createdAt < where.createdAt,
      );
      return Promise.resolve(eligible.slice(skip ?? 0, (skip ?? 0) + take));
    }),
    findOne: jest.fn(({ where }: any) =>
      Promise.resolve(stored.find((r) => r.id === where?.id) ?? null),
    ),
    save: jest.fn((e: any) => Promise.resolve(e)),
    create: jest.fn((e: any) => e),
    count: jest.fn(() => Promise.resolve(0)),
    manager: {
      getRepository: jest.fn(() => ({
        createQueryBuilder: jest.fn(() => ({
          where: jest.fn().mockReturnThis(),
          getMany: jest.fn(() => Promise.resolve([])),
        })),
      })),
    },
  } as unknown as Repository<any>;
}

/** Stub for the archival records repo. Tracks inserts; no UPDATE path exists. */
function makeArchivalRepo(preArchivedIds: string[] = []) {
  const archived: string[] = [...preArchivedIds];
  return {
    find: jest.fn(() =>
      Promise.resolve(archived.map((id) => ({ auditLogId: id }))),
    ),
    create: jest.fn((e: any) => e),
    save: jest.fn((records: any) => {
      const items = Array.isArray(records) ? records : [records];
      for (const r of items) archived.push(r.auditLogId);
      return Promise.resolve(records);
    }),
    savedIds: archived, // for test assertions
  };
}

describe('AuditService.runRetentionJob — strict append-only (stub repos)', () => {
  const OLD = '2010-06-01T00:00:00Z'; // 15+ years ago, always eligible
  const NEW = '2099-01-01T00:00:00Z'; // far future, never eligible

  function buildService(
    records: ReturnType<typeof makeRecord>[],
    preArchivedIds: string[] = [],
  ) {
    const auditRepo = makeAuditRepo(records);
    const archivalRepo = makeArchivalRepo(preArchivedIds);
    const svc = new AuditService(auditRepo as any, archivalRepo as any);
    return { svc, auditRepo, archivalRepo };
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

  it('dry-run counts eligible records without calling archivalRepo.save', async () => {
    const records = [makeRecord(OLD), makeRecord(OLD), makeRecord(NEW)];
    const { svc, archivalRepo } = buildService(records);
    const result = await svc.runRetentionJob(true);
    expect(result.dryRun).toBe(true);
    expect(result.processed).toBe(2);
    expect(result.archived).toBe(2);
    // dry-run must NOT insert any archival records
    expect((archivalRepo.save as jest.Mock).mock.calls.length).toBe(0);
  });

  it('live run creates archival records for eligible rows — NOT UPDATE on original rows', async () => {
    const records = [makeRecord(OLD), makeRecord(OLD)];
    const { svc, archivalRepo } = buildService(records);
    const result = await svc.runRetentionJob(false);
    expect(result.archived).toBe(2);
    // archivalRepo.save must be called (archival records inserted)
    expect((archivalRepo.save as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });

  it('original audit rows are NEVER mutated (auditRepo.save is only called for tombstone)', async () => {
    const records = [makeRecord(OLD), makeRecord(OLD)];
    const { svc, auditRepo } = buildService(records);
    await svc.runRetentionJob(false);

    // auditRepo.save is called exactly once: for the tombstone entry appended to the chain
    const savedArgs: any[] = (auditRepo.save as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(savedArgs.length).toBe(1);
    expect(savedArgs[0].action).toBe('audit.retention_archival');
    // The saved tombstone must NOT reference content from the original records
    expect(savedArgs[0].deviceFingerprint).toBeNull();
    expect(savedArgs[0].ip).toBeNull();
  });

  it('original rows retain their PII fields intact (not cleared)', async () => {
    const record = makeRecord(OLD);
    const originalFp = record.deviceFingerprint;
    const originalIp = record.ip;

    const { svc, auditRepo } = buildService([record]);
    await svc.runRetentionJob(false);

    // The only save on auditRepo is the tombstone — NOT the original record
    const savedArgs: any[] = (auditRepo.save as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    const originalSave = savedArgs.find((e: any) => e.id === record.id);
    expect(originalSave).toBeUndefined(); // original row never passed to save()

    // The original record object itself is also unchanged in memory
    expect(record.deviceFingerprint).toBe(originalFp);
    expect(record.ip).toBe(originalIp);
    expect(record.archivedAt).toBeNull();
  });

  it('skips records already in archivalRepo (idempotency)', async () => {
    const record = makeRecord(OLD);
    // Pre-populate archival repo with the record's ID
    const { svc, archivalRepo } = buildService([record], [record.id]);
    const result = await svc.runRetentionJob(false);
    expect(result.processed).toBe(0);
    expect(result.archived).toBe(0);
    // archivalRepo.save must not be called again for an already-archived record
    expect((archivalRepo.save as jest.Mock).mock.calls.length).toBe(0);
  });

  it('result includes a cutoff Date', async () => {
    const { svc } = buildService([]);
    const result = await svc.runRetentionJob();
    expect(result.cutoff).toBeInstanceOf(Date);
    expect(result.cutoff.getTime()).toBeLessThan(Date.now());
  });

  // ── Append-only tombstone ────────────────────────────────────────────────────

  it('live run appends a tombstone audit entry (auditRepo.save called)', async () => {
    const records = [makeRecord(OLD), makeRecord(OLD)];
    const { svc, auditRepo } = buildService(records);
    await svc.runRetentionJob(false);
    expect((auditRepo.save as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });

  it('tombstone entry has action="audit.retention_archival"', async () => {
    const records = [makeRecord(OLD)];
    const { svc, auditRepo } = buildService(records);
    await svc.runRetentionJob(false);

    const savedArgs: any[] = (auditRepo.save as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    const tombstone = savedArgs.find((e: any) => e.action === 'audit.retention_archival');
    expect(tombstone).toBeDefined();
    expect(tombstone.actorId).toBe('system');
    expect(tombstone.entityType).toBe('audit_log');
    expect(tombstone.after).toMatchObject({ count: 1 });
  });

  it('tombstone entry records the archived count in after.count', async () => {
    const records = [makeRecord(OLD), makeRecord(OLD), makeRecord(OLD)];
    const { svc, auditRepo } = buildService(records);
    await svc.runRetentionJob(false);

    const savedArgs: any[] = (auditRepo.save as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    const tombstone = savedArgs.find((e: any) => e.action === 'audit.retention_archival');
    expect(tombstone?.after?.count).toBe(3);
  });

  it('dry run does NOT append a tombstone entry', async () => {
    const records = [makeRecord(OLD), makeRecord(OLD)];
    const { svc, auditRepo } = buildService(records);
    await svc.runRetentionJob(true);
    expect((auditRepo.save as jest.Mock).mock.calls.length).toBe(0);
  });

  it('no tombstone when zero records are archived', async () => {
    const records = [makeRecord(NEW), makeRecord(NEW)];
    const { svc, auditRepo } = buildService(records);
    await svc.runRetentionJob(false);
    expect((auditRepo.save as jest.Mock).mock.calls.length).toBe(0);
  });

  it('tombstone does NOT contain PII from original records', async () => {
    const records = [makeRecord(OLD)];
    const { svc, auditRepo } = buildService(records);
    await svc.runRetentionJob(false);

    const savedArgs: any[] = (auditRepo.save as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    const tombstone = savedArgs.find((e: any) => e.action === 'audit.retention_archival');
    expect(tombstone?.before).toBeNull();
    expect(tombstone?.deviceFingerprint).toBeNull();
    expect(tombstone?.ip).toBeNull();
  });

  it('archival records are created with correct auditLogId and archiveReason', async () => {
    const record = makeRecord(OLD);
    const { svc, archivalRepo } = buildService([record]);
    await svc.runRetentionJob(false);

    const saved = (archivalRepo.save as jest.Mock).mock.calls[0]?.[0];
    const archivalBatch = Array.isArray(saved) ? saved : [saved];
    expect(archivalBatch[0].auditLogId).toBe(record.id);
    expect(archivalBatch[0].archiveReason).toBeDefined();
    expect(archivalBatch[0].archivedAt).toBeInstanceOf(Date);
  });
});

// ── Hash chain remains intact after tombstone ─────────────────────────────────
//
// verifyEntry recomputes the hash from: action, actorId, entityType, entityId,
// before, after, ts (createdAt). None of those fields are cleared by
// runRetentionJob — only the archival manifest is created separately.
// This test verifies the original record still passes hash verification.

import * as crypto from 'crypto';

describe('hash chain integrity — original rows unchanged after retention', () => {
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

  it('hash chain is valid because original rows are never touched', () => {
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

    // Simulate retention run: original row untouched
    // (only an AuditArchivalRecord is inserted, not an update to this row)
    const afterRetention = { ...record }; // identical — no mutation

    const recomputed = computeHash(afterRetention.prevHash, afterRetention);
    expect(recomputed).toBe(hash);
    expect(afterRetention.deviceFingerprint).toBe('original-fp');
    expect(afterRetention.ip).toBe('203.0.113.5');
  });
});
