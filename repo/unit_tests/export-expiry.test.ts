import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { safeDeleteFile } from '../backend/src/exports/export-file.util';
import { ExportsService } from '../backend/src/exports/exports.service';
import { ExportJobStatus } from '../backend/src/database/entities/export-job.entity';

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpFile(content = 'csv,data\n1,2'): string {
  const p = path.join(os.tmpdir(), `export-test-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`);
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

function makeJob(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'job-uuid-1',
    requesterId: 'user-uuid-1',
    status: ExportJobStatus.DONE,
    filePath: null as string | null,
    params: { type: 'listings' },
    expiresAt: new Date(Date.now() - 1000), // already expired
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeQb(affected = 1): any {
  const qb: any = {
    update: () => qb,
    set: () => qb,
    where: () => qb,
    andWhere: () => qb,
    execute: jest.fn().mockResolvedValue({ affected }),
  };
  return qb;
}

function makeRepo(job: any, affected = 1) {
  return {
    find: jest.fn().mockResolvedValue([job]),
    findOne: jest.fn().mockResolvedValue(job),
    update: jest.fn().mockResolvedValue({ affected }),
    createQueryBuilder: jest.fn(() => makeQb(affected)),
    count: jest.fn().mockResolvedValue(0),
    save: jest.fn().mockImplementation(async (e: any) => e),
    create: jest.fn().mockImplementation((e: any) => e),
  };
}

function makeService(repo: any): ExportsService {
  return new ExportsService(repo, null as any, null as any);
}

// ── safeDeleteFile ────────────────────────────────────────────────────────────

describe('safeDeleteFile', () => {
  it('deletes an existing file and reports deleted=true', () => {
    const p = tmpFile();
    const result = safeDeleteFile(p);
    expect(result.deleted).toBe(true);
    expect(result.error).toBeUndefined();
    expect(fs.existsSync(p)).toBe(false);
  });

  it('returns deleted=false with "file_not_found" for a missing file', () => {
    const p = path.join(os.tmpdir(), `nonexistent-${Date.now()}.csv`);
    const result = safeDeleteFile(p);
    expect(result.deleted).toBe(false);
    expect(result.error).toBe('file_not_found');
  });

  it('is idempotent — calling twice on the same path does not throw', () => {
    const p = tmpFile();
    safeDeleteFile(p);                   // first call — deletes
    const second = safeDeleteFile(p);    // second call — file already gone
    expect(second.deleted).toBe(false);
    expect(second.error).toBe('file_not_found');
  });
});

// ── ExportsService.expireJob ──────────────────────────────────────────────────

describe('ExportsService.expireJob', () => {
  it('deletes physical file and clears filePath in DB', async () => {
    const filePath = tmpFile();
    const job = makeJob({ filePath });
    const repo = makeRepo(job);
    const service = makeService(repo);

    await service.expireJob(job);

    expect(fs.existsSync(filePath)).toBe(false);

    const qb = repo.createQueryBuilder.mock.results[0].value;
    expect(qb.execute).toHaveBeenCalled();
  });

  it('still clears DB metadata when the file is already missing', async () => {
    const missingPath = path.join(os.tmpdir(), `missing-${Date.now()}.csv`);
    const job = makeJob({ filePath: missingPath });
    const repo = makeRepo(job);
    const service = makeService(repo);

    // Must not throw even though the file doesn't exist
    await expect(service.expireJob(job)).resolves.toBeUndefined();

    const qb = repo.createQueryBuilder.mock.results[0].value;
    expect(qb.execute).toHaveBeenCalled();
  });

  it('is idempotent — second call (affected=0) does not throw', async () => {
    const job = makeJob({ filePath: null });
    const repo = makeRepo(job, 0); // simulate concurrent worker already won
    const service = makeService(repo);

    await expect(service.expireJob(job)).resolves.toBeUndefined();
  });

  it('does not attempt file deletion when filePath is null', async () => {
    const job = makeJob({ filePath: null });
    const repo = makeRepo(job);
    const service = makeService(repo);

    // Would throw if it tried to unlink a null path
    await expect(service.expireJob(job)).resolves.toBeUndefined();
  });
});

// ── ExportsService.downloadFile ───────────────────────────────────────────────

describe('ExportsService.downloadFile — expiry at download time', () => {
  it('throws 404 when status is already EXPIRED', async () => {
    const job = makeJob({ status: ExportJobStatus.EXPIRED, filePath: null });
    const repo = makeRepo(job);
    const service = makeService(repo);

    await expect(service.downloadFile('job-uuid-1', 'user-uuid-1', 'admin'))
      .rejects.toMatchObject({ status: 404 });
  });

  it('triggers expiry (deletes file + DB) and throws 404 when expiresAt is past', async () => {
    const filePath = tmpFile();
    const job = makeJob({
      filePath,
      status: ExportJobStatus.DONE,
      expiresAt: new Date(Date.now() - 5000), // 5s in the past
    });
    const repo = makeRepo(job);
    const service = makeService(repo);

    await expect(service.downloadFile('job-uuid-1', 'user-uuid-1', 'admin'))
      .rejects.toMatchObject({ status: 404 });

    // File must be gone
    expect(fs.existsSync(filePath)).toBe(false);

    // DB compare-and-set was executed
    const qb = repo.createQueryBuilder.mock.results[0].value;
    expect(qb.execute).toHaveBeenCalled();
  });

  it('returns file path when job is DONE and not yet expired', async () => {
    const filePath = tmpFile();
    const job = makeJob({
      filePath,
      status: ExportJobStatus.DONE,
      expiresAt: new Date(Date.now() + 86400_000), // 1 day in the future
    });
    const repo = makeRepo(job);
    const service = makeService(repo);

    const result = await service.downloadFile('job-uuid-1', 'user-uuid-1', 'admin');
    expect(result.filePath).toBe(filePath);
    expect(result.fileName).toBe('export-job-uuid-1.csv');

    // Cleanup
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });

  it('throws 202 when job is still RUNNING', async () => {
    const job = makeJob({ status: ExportJobStatus.RUNNING, filePath: null });
    const repo = makeRepo(job);
    const service = makeService(repo);

    await expect(service.downloadFile('job-uuid-1', 'user-uuid-1', 'admin'))
      .rejects.toMatchObject({ status: 202 });
  });
});

// ── Role-based export access controls ────────────────────────────────────────

describe('ExportsService.createJob — role-based type restrictions', () => {
  it('admin can create audit export', async () => {
    const repo = makeRepo(makeJob());
    const service = makeService(repo);
    await expect(
      service.createJob('admin-1', 'admin', { type: 'audit', filters: {} } as any),
    ).resolves.toBeDefined();
  });

  it('vendor cannot create audit export', async () => {
    const repo = makeRepo(makeJob());
    const service = makeService(repo);
    await expect(
      service.createJob('vendor-1', 'vendor', { type: 'audit', filters: {} } as any),
    ).rejects.toThrow('Audit exports are restricted to admins');
  });

  it('ops_reviewer cannot create audit export', async () => {
    const repo = makeRepo(makeJob());
    const service = makeService(repo);
    await expect(
      service.createJob('ops-1', 'ops_reviewer', { type: 'audit', filters: {} } as any),
    ).rejects.toThrow('Audit exports are restricted to admins');
  });

  it('vendor can create listings export', async () => {
    const repo = makeRepo(makeJob());
    const service = makeService(repo);
    await expect(
      service.createJob('vendor-1', 'vendor', { type: 'listings', filters: {} } as any),
    ).resolves.toBeDefined();
  });

  it('vendor can create conversations export', async () => {
    const repo = makeRepo(makeJob());
    const service = makeService(repo);
    await expect(
      service.createJob('vendor-1', 'vendor', { type: 'conversations', filters: {} } as any),
    ).resolves.toBeDefined();
  });

  it('vendor can create settlements export', async () => {
    const repo = makeRepo(makeJob());
    const service = makeService(repo);
    await expect(
      service.createJob('vendor-1', 'vendor', { type: 'settlements', filters: {} } as any),
    ).resolves.toBeDefined();
  });

  it('ops_reviewer can only create settlements export', async () => {
    const repo = makeRepo(makeJob());
    const service = makeService(repo);
    await expect(
      service.createJob('ops-1', 'ops_reviewer', { type: 'settlements', filters: {} } as any),
    ).resolves.toBeDefined();
    await expect(
      service.createJob('ops-1', 'ops_reviewer', { type: 'listings', filters: {} } as any),
    ).rejects.toThrow('may only export settlements');
  });

  it('finance_admin can only create settlements export', async () => {
    const repo = makeRepo(makeJob());
    const service = makeService(repo);
    await expect(
      service.createJob('fin-1', 'finance_admin', { type: 'settlements', filters: {} } as any),
    ).resolves.toBeDefined();
    await expect(
      service.createJob('fin-1', 'finance_admin', { type: 'conversations', filters: {} } as any),
    ).rejects.toThrow('may only export settlements');
  });
});

// ── Concurrent expiry/download determinism ────────────────────────────────────

describe('concurrent expiry/download race conditions', () => {
  it('concurrent expireJob calls are idempotent — only one wins the compare-and-set', async () => {
    const filePath = tmpFile();
    const job = makeJob({ filePath });

    let executeCallCount = 0;
    const qb: any = {
      update: () => qb,
      set: () => qb,
      where: () => qb,
      andWhere: () => qb,
      execute: jest.fn().mockImplementation(async () => {
        executeCallCount++;
        // Simulate first call wins (affected=1), subsequent calls lose (affected=0)
        return { affected: executeCallCount === 1 ? 1 : 0 };
      }),
    };
    const repo = {
      createQueryBuilder: jest.fn(() => qb),
      find: jest.fn().mockResolvedValue([job]),
      findOne: jest.fn().mockResolvedValue(job),
    };
    const service = makeService(repo as any);

    // Fire two concurrent expiry calls
    await Promise.all([service.expireJob(job), service.expireJob(job)]);

    // Both resolved without error
    expect(executeCallCount).toBe(2);
    // File is gone (one of the calls deleted it, the other got ENOENT)
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
