/**
 * export-expiry-scheduled.test.ts
 *
 * Risk: the scheduled expiry path (`expireOldJobs`, called by the poll timer)
 * may expire DB records but skip filesystem deletion, leaving orphaned files
 * on disk that could expose sensitive exported data indefinitely.
 *
 * Covers:
 *   - expireOldJobs iterates DONE+past-expiresAt jobs and calls expireJob
 *   - filesystem deletion happens through the scheduled path (not just direct calls)
 *   - jobs with null filePath are safely handled by the scheduled path
 *   - only DONE+expired jobs are targeted (RUNNING, QUEUED, already-EXPIRED skipped)
 *   - multiple expired jobs in one batch are all processed
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ExportsService } from '../backend/src/exports/exports.service';
import { ExportJobStatus } from '../backend/src/database/entities/export-job.entity';

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpFile(content = 'id,data\n1,2'): string {
  const p = path.join(
    os.tmpdir(),
    `sched-expiry-${Date.now()}-${Math.random().toString(36).slice(2)}.csv`,
  );
  fs.writeFileSync(p, content, 'utf-8');
  return p;
}

function makeJob(id: string, overrides: Record<string, unknown> = {}): any {
  return {
    id,
    requesterId: 'user-1',
    status: ExportJobStatus.DONE,
    filePath: null as string | null,
    params: { type: 'listings' },
    expiresAt: new Date(Date.now() - 1000), // already expired
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/**
 * Build a Repository stub whose find() returns `jobs` and whose
 * createQueryBuilder().execute() records calls.
 */
function makeRepo(jobs: any[]): any {
  let executeCount = 0;
  const qb: any = {
    update: () => qb,
    set: () => qb,
    where: () => qb,
    andWhere: () => qb,
    execute: jest.fn(async () => { executeCount++; return { affected: 1 }; }),
  };
  return {
    find: jest.fn(({ where }: any) => {
      // expireOldJobs queries for DONE + expiresAt < now
      const filtered = jobs.filter(
        j => j.status === ExportJobStatus.DONE && j.expiresAt < new Date(),
      );
      return Promise.resolve(filtered);
    }),
    findOne: jest.fn(({ where }: any) =>
      Promise.resolve(jobs.find(j => j.id === where?.id) ?? null),
    ),
    count: jest.fn(() => Promise.resolve(0)),
    save: jest.fn(async (e: any) => e),
    create: jest.fn((e: any) => e),
    update: jest.fn(async () => ({ affected: 1 })),
    createQueryBuilder: jest.fn(() => qb),
    _getExecuteCount: () => executeCount,
  };
}

function makeService(repo: any): ExportsService {
  return new ExportsService(repo, null as any, null as any);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Scheduled expiry path: expireOldJobs deletes files from disk', () => {
  it('expired DONE job with a file: scheduled path deletes the file', async () => {
    const filePath = tmpFile();
    const job = makeJob('job-1', { filePath });
    const repo = makeRepo([job]);
    const service = makeService(repo);

    // Drive the scheduled path directly
    await (service as any).expireOldJobs();

    // The file must be gone — not just the DB record
    expect(fs.existsSync(filePath)).toBe(false);

    // DB compare-and-set must have executed
    const qb = repo.createQueryBuilder.mock.results[0].value;
    expect(qb.execute).toHaveBeenCalled();
  });

  it('multiple expired jobs are all processed: all files deleted', async () => {
    const file1 = tmpFile();
    const file2 = tmpFile();
    const jobs = [
      makeJob('job-a', { filePath: file1 }),
      makeJob('job-b', { filePath: file2 }),
    ];
    const repo = makeRepo(jobs);
    const service = makeService(repo);

    await (service as any).expireOldJobs();

    expect(fs.existsSync(file1)).toBe(false);
    expect(fs.existsSync(file2)).toBe(false);
    // Two separate execute() calls (one per job via two createQueryBuilder() calls)
    expect(repo.createQueryBuilder).toHaveBeenCalledTimes(2);
  });

  it('expired DONE job with null filePath: scheduled path does not throw', async () => {
    const job = makeJob('job-nullpath', { filePath: null });
    const repo = makeRepo([job]);
    const service = makeService(repo);

    await expect((service as any).expireOldJobs()).resolves.not.toThrow();

    const qb = repo.createQueryBuilder.mock.results[0].value;
    expect(qb.execute).toHaveBeenCalled();
  });

  it('already-EXPIRED jobs are not re-processed by expireOldJobs', async () => {
    const filePath = tmpFile();
    // This job is already EXPIRED in the DB — expireOldJobs queries DONE only
    const job = makeJob('job-already-expired', {
      filePath,
      status: ExportJobStatus.EXPIRED,
    });
    const repo = makeRepo([job]);
    const service = makeService(repo);

    await (service as any).expireOldJobs();

    // File must NOT be deleted — job was not selected
    expect(fs.existsSync(filePath)).toBe(true);
    // createQueryBuilder was not called because no jobs matched
    expect(repo.createQueryBuilder).not.toHaveBeenCalled();

    // Cleanup
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });

  it('RUNNING jobs are not expired by the scheduled path', async () => {
    const filePath = tmpFile();
    const job = makeJob('job-running', {
      filePath,
      status: ExportJobStatus.RUNNING,
    });
    const repo = makeRepo([job]);
    const service = makeService(repo);

    await (service as any).expireOldJobs();

    expect(fs.existsSync(filePath)).toBe(true);
    expect(repo.createQueryBuilder).not.toHaveBeenCalled();

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });

  it('QUEUED jobs are not expired by the scheduled path', async () => {
    const filePath = tmpFile();
    const job = makeJob('job-queued', {
      filePath,
      status: ExportJobStatus.QUEUED,
    });
    const repo = makeRepo([job]);
    const service = makeService(repo);

    await (service as any).expireOldJobs();

    expect(fs.existsSync(filePath)).toBe(true);
    expect(repo.createQueryBuilder).not.toHaveBeenCalled();

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });

  it('not-yet-expired DONE job is left untouched by the scheduled path', async () => {
    const filePath = tmpFile();
    const job = makeJob('job-not-yet-expired', {
      filePath,
      status: ExportJobStatus.DONE,
      expiresAt: new Date(Date.now() + 86_400_000), // 1 day in the future
    });
    const repo = makeRepo([job]);
    const service = makeService(repo);

    await (service as any).expireOldJobs();

    expect(fs.existsSync(filePath)).toBe(true);
    expect(repo.createQueryBuilder).not.toHaveBeenCalled();

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
});
