/**
 * export-progress.test.ts
 *
 * Tests for export job progress tracking:
 *
 *   Backend — ExportsService
 *     - createJob() sets progressPercent=0
 *     - processJob() emits the correct sequence of update() calls
 *     - failure path preserves last progressPercent (only status is written)
 *     - progressPercent values are clamped within valid bounds
 *
 *   Frontend utility — getProgressBarState / shouldShowProgressBar
 *     - done → 100 %, not indeterminate
 *     - running + real value → exact percentage, not indeterminate
 *     - running + null → 60 % fallback, indeterminate
 *     - running + out-of-bound values → clamped
 *     - queued → uses progressPercent or 0
 *     - failed → uses last progressPercent or 0
 *     - shouldShowProgressBar returns true only for queued/running
 */

import { ExportsService } from '../backend/src/exports/exports.service';
import { ExportJobStatus } from '../backend/src/database/entities/export-job.entity';
import { getProgressBarState, shouldShowProgressBar } from '../frontend/src/lib/export-progress';

// ── Backend helpers ───────────────────────────────────────────────────────────

function makeJob(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'job-1',
    requesterId: 'user-1',
    status: ExportJobStatus.QUEUED,
    filePath: null,
    params: { type: 'listings', filters: {} },
    expiresAt: new Date(Date.now() + 86_400_000),
    progressPercent: 0,
    progressStage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Build a repo mock that records every `update()` call in order. */
function makeRepo(job: any = makeJob()) {
  const updateCalls: Array<[string, Record<string, unknown>]> = [];

  const repo: any = {
    find: jest.fn().mockResolvedValue([job]),
    findOne: jest.fn().mockResolvedValue(job),
    count: jest.fn().mockResolvedValue(0),
    save: jest.fn().mockImplementation(async (e: any) => e),
    create: jest.fn().mockImplementation((e: any) => e),
    createQueryBuilder: jest.fn(() => ({
      update: () => repo._qb,
      set: () => repo._qb,
      where: () => repo._qb,
      andWhere: () => repo._qb,
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    })),
    update: jest.fn().mockImplementation(async (id: string, fields: Record<string, unknown>) => {
      updateCalls.push([id, fields]);
      return { affected: 1 };
    }),
    _updateCalls: updateCalls,
  };

  return repo;
}

/** Minimal DataSource mock — returns a user with the given role. */
function makeDataSource(role = 'vendor') {
  return {
    getRepository: jest.fn().mockReturnValue({
      findOne: jest.fn().mockResolvedValue({ id: 'user-1', role }),
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    }),
  };
}

function makeEncryption() {
  return { decrypt: jest.fn((v: any) => v), encrypt: jest.fn((v: any) => v) };
}

function makeService(repo: any, dataSource?: any, encryption?: any): ExportsService {
  return new ExportsService(
    repo,
    dataSource ?? (null as any),
    encryption ?? makeEncryption(),
  );
}

// ── createJob() — initial progress ───────────────────────────────────────────

describe('ExportsService.createJob() — initial progress', () => {
  it('sets progressPercent=0 when creating a new export job', async () => {
    const repo = makeRepo();
    const svc = makeService(repo);

    await svc.createJob('user-1', 'admin', { type: 'listings' });

    const createArg = repo.create.mock.calls[0][0];
    expect(createArg.progressPercent).toBe(0);
  });

  it('sets progressStage=null on creation', async () => {
    const repo = makeRepo();
    const svc = makeService(repo);

    await svc.createJob('user-1', 'admin', { type: 'listings' });

    const createArg = repo.create.mock.calls[0][0];
    expect(createArg.progressStage).toBeNull();
  });

  it('status is QUEUED on creation', async () => {
    const repo = makeRepo();
    const svc = makeService(repo);

    await svc.createJob('user-1', 'admin', { type: 'listings' });

    const createArg = repo.create.mock.calls[0][0];
    expect(createArg.status).toBe(ExportJobStatus.QUEUED);
  });
});

// ── processJob() — progress sequence ─────────────────────────────────────────

describe('ExportsService.processJob() — progress sequence', () => {
  async function runProcessJob(jobOverrides: Record<string, unknown> = {}) {
    const job = makeJob(jobOverrides);
    const repo = makeRepo(job);
    const ds = makeDataSource('vendor');
    const svc = makeService(repo, ds);

    // Access private method via cast — standard Jest unit-test pattern
    await (svc as any).processJob(job);

    return repo._updateCalls as Array<[string, Record<string, unknown>]>;
  }

  it('first update sets status=running, progressPercent=10, progressStage=starting', async () => {
    const calls = await runProcessJob();
    const first = calls[0][1];
    expect(first.status).toBe(ExportJobStatus.RUNNING);
    expect(first.progressPercent).toBe(10);
    expect(first.progressStage).toBe('starting');
  });

  it('second update sets progressPercent=50, progressStage=data_fetched (no status change)', async () => {
    const calls = await runProcessJob();
    const dataFetched = calls.find((c) => c[1].progressStage === 'data_fetched');
    expect(dataFetched).toBeDefined();
    expect(dataFetched![1].progressPercent).toBe(50);
    expect(dataFetched![1].status).toBeUndefined();
  });

  it('third update sets progressPercent=90, progressStage=file_written (no status change)', async () => {
    const calls = await runProcessJob();
    const fileWritten = calls.find((c) => c[1].progressStage === 'file_written');
    expect(fileWritten).toBeDefined();
    expect(fileWritten![1].progressPercent).toBe(90);
    expect(fileWritten![1].status).toBeUndefined();
  });

  it('final update sets status=done, progressPercent=100, progressStage=done', async () => {
    const calls = await runProcessJob();
    const done = calls.find((c) => c[1].status === ExportJobStatus.DONE);
    expect(done).toBeDefined();
    expect(done![1].progressPercent).toBe(100);
    expect(done![1].progressStage).toBe('done');
  });

  it('progress values are in strictly ascending order: 10 → 50 → 90 → 100', async () => {
    const calls = await runProcessJob();
    const percents = calls
      .filter((c) => c[1].progressPercent != null)
      .map((c) => c[1].progressPercent as number);

    for (let i = 1; i < percents.length; i++) {
      expect(percents[i]).toBeGreaterThan(percents[i - 1]);
    }
    expect(percents[percents.length - 1]).toBe(100);
  });

  it('all progress values are within [0, 100]', async () => {
    const calls = await runProcessJob();
    const percents = calls
      .filter((c) => c[1].progressPercent != null)
      .map((c) => c[1].progressPercent as number);

    for (const p of percents) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    }
  });
});

// ── processJob() — failure preserves last progress ───────────────────────────

describe('ExportsService.processJob() — failure path', () => {
  it('on error, only status=FAILED is written — progressPercent is not overwritten', async () => {
    const job = makeJob({ params: { type: 'listings', filters: {} } });
    const repo = makeRepo(job);

    // Simulate a DB/processing error after the export functions run
    const ds = makeDataSource('vendor');
    // Make fs.writeFileSync-equivalent blow up by corrupting the csv export:
    // easier to trigger at the DataSource level
    ds.getRepository.mockReturnValueOnce({
      findOne: jest.fn().mockResolvedValue({ id: 'user-1', role: 'vendor' }),
    }).mockReturnValueOnce({
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockRejectedValue(new Error('DB explosion')),
      }),
    });

    const svc = makeService(repo, ds);

    await expect((svc as any).processJob(job)).rejects.toThrow('DB explosion');

    // The failure update should only set status, not touch progressPercent
    const failureUpdate = repo._updateCalls.find(
      (c: [string, Record<string, unknown>]) => c[1].status === ExportJobStatus.FAILED,
    );
    expect(failureUpdate).toBeDefined();
    expect(failureUpdate![1].progressPercent).toBeUndefined();
    expect(failureUpdate![1].progressStage).toBeUndefined();
  });

  it('progress set before the failure point is preserved in DB (no rollback)', async () => {
    const job = makeJob({ params: { type: 'listings', filters: {} } });
    const repo = makeRepo(job);

    const ds = makeDataSource('vendor');
    ds.getRepository.mockReturnValueOnce({
      findOne: jest.fn().mockResolvedValue({ id: 'user-1', role: 'vendor' }),
    }).mockReturnValueOnce({
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockRejectedValue(new Error('fetch failed')),
      }),
    });

    const svc = makeService(repo, ds);
    await expect((svc as any).processJob(job)).rejects.toThrow();

    // The 'starting' update (10 %) must have been committed before the failure
    const startingUpdate = repo._updateCalls.find(
      (c: [string, Record<string, unknown>]) => c[1].progressStage === 'starting',
    );
    expect(startingUpdate).toBeDefined();
    expect(startingUpdate![1].progressPercent).toBe(10);
  });
});

// ── Frontend utility — getProgressBarState ────────────────────────────────────

describe('getProgressBarState()', () => {
  it('done → width 100%, not indeterminate', () => {
    const s = getProgressBarState('done');
    expect(s.width).toBe('100%');
    expect(s.indeterminate).toBe(false);
  });

  it('done ignores any progressPercent passed in', () => {
    expect(getProgressBarState('done', 42).width).toBe('100%');
  });

  it('running with real value → exact width, not indeterminate', () => {
    const s = getProgressBarState('running', 75);
    expect(s.width).toBe('75%');
    expect(s.indeterminate).toBe(false);
  });

  it('running with 0 → 0% width, not indeterminate', () => {
    const s = getProgressBarState('running', 0);
    expect(s.width).toBe('0%');
    expect(s.indeterminate).toBe(false);
  });

  it('running with null → 60% fallback, indeterminate (legacy / pre-progress row)', () => {
    const s = getProgressBarState('running', null);
    expect(s.width).toBe('60%');
    expect(s.indeterminate).toBe(true);
  });

  it('running with undefined → 60% fallback, indeterminate', () => {
    const s = getProgressBarState('running', undefined);
    expect(s.width).toBe('60%');
    expect(s.indeterminate).toBe(true);
  });

  it('running with progressPercent > 100 is clamped to 100%', () => {
    const s = getProgressBarState('running', 150);
    expect(s.width).toBe('100%');
    expect(s.indeterminate).toBe(false);
  });

  it('running with negative progressPercent is clamped to 0%', () => {
    const s = getProgressBarState('running', -10);
    expect(s.width).toBe('0%');
    expect(s.indeterminate).toBe(false);
  });

  it('queued with progressPercent=0 → 0%', () => {
    const s = getProgressBarState('queued', 0);
    expect(s.width).toBe('0%');
    expect(s.indeterminate).toBe(false);
  });

  it('queued with null progressPercent → 0%', () => {
    const s = getProgressBarState('queued', null);
    expect(s.width).toBe('0%');
    expect(s.indeterminate).toBe(false);
  });

  it('failed with last-known progressPercent → preserves that value', () => {
    const s = getProgressBarState('failed', 50);
    expect(s.width).toBe('50%');
    expect(s.indeterminate).toBe(false);
  });

  it('failed with null progressPercent → 0%', () => {
    const s = getProgressBarState('failed', null);
    expect(s.width).toBe('0%');
    expect(s.indeterminate).toBe(false);
  });

  it('expired → 0%', () => {
    const s = getProgressBarState('expired');
    expect(s.width).toBe('0%');
    expect(s.indeterminate).toBe(false);
  });
});

// ── Frontend utility — shouldShowProgressBar ──────────────────────────────────

describe('shouldShowProgressBar()', () => {
  it.each(['queued', 'running'])('returns true for %s', (status) => {
    expect(shouldShowProgressBar(status)).toBe(true);
  });

  it.each(['done', 'failed', 'expired'])('returns false for %s', (status) => {
    expect(shouldShowProgressBar(status)).toBe(false);
  });
});
