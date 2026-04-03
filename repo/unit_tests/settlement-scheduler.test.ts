/**
 * settlement-scheduler.test.ts
 *
 * Tests for:
 *   - previousMonthPeriod / isFirstDayOfMonthUTC (pure period utilities)
 *   - SettlementSchedulerService.tick() — scheduling logic and deduplication
 *   - SettlementsService.generateMonthly() — idempotency under retries,
 *     concurrent duplicate handling, and GenerationRunResult shape
 */

import {
  previousMonthPeriod,
  isFirstDayOfMonthUTC,
} from '../backend/src/settlements/settlement-period';

import { SettlementSchedulerService, SCHEDULER_ACTOR_ID } from '../backend/src/settlements/settlement-scheduler.service';
import { SettlementsService, GenerationRunResult } from '../backend/src/settlements/settlements.service';
import { Repository } from 'typeorm';

// ── previousMonthPeriod ───────────────────────────────────────────────────────

describe('previousMonthPeriod', () => {
  it('February 1st → January of the same year', () => {
    expect(previousMonthPeriod(new Date('2024-02-01T00:00:00Z'))).toBe('2024-01');
  });

  it('January 1st → December of the previous year (year rollover)', () => {
    expect(previousMonthPeriod(new Date('2024-01-01T00:00:00Z'))).toBe('2023-12');
  });

  it('March 1st → February', () => {
    expect(previousMonthPeriod(new Date('2024-03-01T12:00:00Z'))).toBe('2024-02');
  });

  it('December 1st → November', () => {
    expect(previousMonthPeriod(new Date('2024-12-01T00:00:00Z'))).toBe('2024-11');
  });

  it('result is always zero-padded YYYY-MM format', () => {
    // September: month 9 → 09
    expect(previousMonthPeriod(new Date('2024-10-01T00:00:00Z'))).toMatch(/^\d{4}-\d{2}$/);
    expect(previousMonthPeriod(new Date('2024-10-01T00:00:00Z'))).toBe('2024-09');
  });

  it('uses UTC date, not local time (no TZ ambiguity)', () => {
    // Exactly midnight UTC on Feb 1 — should still be Feb 1 in UTC → Jan period
    const utcMidnight = new Date('2024-02-01T00:00:00.000Z');
    expect(previousMonthPeriod(utcMidnight)).toBe('2024-01');
  });
});

// ── isFirstDayOfMonthUTC ──────────────────────────────────────────────────────

describe('isFirstDayOfMonthUTC', () => {
  it('returns true on the 1st at midnight UTC', () => {
    expect(isFirstDayOfMonthUTC(new Date('2024-03-01T00:00:00Z'))).toBe(true);
  });

  it('returns true on the 1st at end of day UTC', () => {
    expect(isFirstDayOfMonthUTC(new Date('2024-03-01T23:59:59Z'))).toBe(true);
  });

  it('returns false on the 2nd', () => {
    expect(isFirstDayOfMonthUTC(new Date('2024-03-02T00:00:00Z'))).toBe(false);
  });

  it('returns false on the last day of a month', () => {
    expect(isFirstDayOfMonthUTC(new Date('2024-02-29T12:00:00Z'))).toBe(false);
  });
});

// ── SettlementSchedulerService.tick() ────────────────────────────────────────

function makeGenerateMonthlyMock() {
  return jest.fn(async (period: string, _actorId: string, triggeredBy: string): Promise<GenerationRunResult> => ({
    period,
    triggeredBy: triggeredBy as any,
    generatedCount: 1,
    skippedCount: 0,
    errorCount: 0,
    durationMs: 5,
    settlements: [],
  }));
}

function makeScheduler(generateMonthlyFn: jest.Mock) {
  const fakeService = { generateMonthly: generateMonthlyFn } as unknown as SettlementsService;
  return new SettlementSchedulerService(fakeService);
}

// tick() accepts an injected `now` date to avoid mocking global.Date
const MAR_1 = new Date('2024-03-01T00:00:00Z');
const MAR_1_NOON = new Date('2024-03-01T12:00:00Z');
const APR_1 = new Date('2024-04-01T00:00:00Z');
const JUN_15 = new Date('2024-06-15T10:00:00Z');

describe('SettlementSchedulerService.tick()', () => {
  it('does not call generateMonthly when today is not the 1st', async () => {
    const generate = makeGenerateMonthlyMock();
    const sched = makeScheduler(generate);
    await sched.tick(JUN_15);
    expect(generate).not.toHaveBeenCalled();
  });

  it('calls generateMonthly with the previous month period when it is the 1st', async () => {
    const generate = makeGenerateMonthlyMock();
    const sched = makeScheduler(generate);
    await sched.tick(MAR_1);
    expect(generate).toHaveBeenCalledWith('2024-02', SCHEDULER_ACTOR_ID, 'scheduler');
  });

  it('passes triggeredBy=scheduler to distinguish from manual calls', async () => {
    const generate = makeGenerateMonthlyMock();
    const sched = makeScheduler(generate);
    await sched.tick(MAR_1);
    expect(generate.mock.calls[0][2]).toBe('scheduler');
  });

  it('does not call generateMonthly a second time for the same period (in-memory dedup)', async () => {
    const generate = makeGenerateMonthlyMock();
    const sched = makeScheduler(generate);
    await sched.tick(MAR_1);       // first tick on the 1st
    await sched.tick(MAR_1_NOON);  // second tick, same day same period
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('triggers again for a new month after a previous month was already generated', async () => {
    const generate = makeGenerateMonthlyMock();
    const sched = makeScheduler(generate);

    await sched.tick(MAR_1); // March 1st → generates Feb
    await sched.tick(APR_1); // April 1st → generates March

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0][0]).toBe('2024-02');
    expect(generate.mock.calls[1][0]).toBe('2024-03');
  });

  it('does not throw when generateMonthly rejects — errors are swallowed', async () => {
    const generate = jest.fn().mockRejectedValue(new Error('DB down'));
    const sched = makeScheduler(generate);
    await expect(sched.tick(MAR_1)).resolves.not.toThrow();
  });
});

// ── SettlementsService.generateMonthly() — idempotency ───────────────────────

function makeVendor(id: string) {
  return { id, username: `vendor-${id}`, role: 'vendor', isActive: true };
}

interface SavedRecord {
  vendorId: string;
  month: string;
  id: string;
  status: string;
  data: any;
}

function makeSettlementsService(
  vendors: ReturnType<typeof makeVendor>[],
  existingRecords: SavedRecord[] = [],
) {
  const db: SavedRecord[] = [...existingRecords];
  let idCounter = 1;

  const settlementRepo = {
    findOne: jest.fn(({ where }: any) => {
      const record = db.find(r => r.vendorId === where.vendorId && r.month === where.month);
      return Promise.resolve(record ?? null);
    }),
    save: jest.fn((entity: any) => {
      // Simulate unique constraint violation if duplicate exists
      const duplicate = db.find(r => r.vendorId === entity.vendorId && r.month === entity.month);
      if (duplicate) {
        const err = new Error('duplicate key value violates unique constraint');
        (err as any).code = '23505';
        return Promise.reject(err);
      }
      const saved = { ...entity, id: `settlement-${idCounter++}` };
      db.push(saved);
      return Promise.resolve(saved);
    }),
    create: jest.fn((e: any) => e),
  } as unknown as Repository<any>;

  const userRepo = {
    find: jest.fn(() => Promise.resolve(vendors)),
  } as unknown as Repository<any>;

  const listingRepo = {
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn(() => Promise.resolve([])),
    })),
  } as unknown as Repository<any>;

  const rateLimitRepo = {} as unknown as Repository<any>;
  const auditService = { log: jest.fn(() => Promise.resolve({})) };
  const freightService = { calculate: jest.fn(() => ({ total: 25.0 })) };
  const encryption = { decrypt: jest.fn((v: any) => v), encrypt: jest.fn((v: any) => v) };

  return new SettlementsService(
    settlementRepo,
    listingRepo,
    userRepo,
    auditService as any,
    freightService as any,
    encryption as any,
  );
}

describe('SettlementsService.generateMonthly() — idempotency', () => {
  it('generates one settlement per vendor on first call', async () => {
    const svc = makeSettlementsService([makeVendor('v1'), makeVendor('v2')]);
    const result = await svc.generateMonthly('2024-01', 'admin-1', 'manual');
    expect(result.generatedCount).toBe(2);
    expect(result.skippedCount).toBe(0);
  });

  it('returns GenerationRunResult with correct shape', async () => {
    const svc = makeSettlementsService([makeVendor('v1')]);
    const result = await svc.generateMonthly('2024-01', 'admin-1', 'manual');
    expect(result).toMatchObject({
      period: '2024-01',
      triggeredBy: 'manual',
      generatedCount: expect.any(Number),
      skippedCount: expect.any(Number),
      errorCount: expect.any(Number),
      durationMs: expect.any(Number),
      settlements: expect.any(Array),
    });
  });

  it('skips vendors that already have a record (soft idempotency check)', async () => {
    const existing: SavedRecord[] = [
      { vendorId: 'v1', month: '2024-01', id: 'existing-1', status: 'pending', data: {} },
    ];
    const svc = makeSettlementsService([makeVendor('v1'), makeVendor('v2')], existing);
    const result = await svc.generateMonthly('2024-01', 'admin-1', 'manual');
    expect(result.generatedCount).toBe(1); // only v2 was new
    expect(result.skippedCount).toBe(1);   // v1 was skipped
  });

  it('repeated calls for the same period do not produce duplicate settlements', async () => {
    const vendors = [makeVendor('v1')];
    const svc = makeSettlementsService(vendors);
    const r1 = await svc.generateMonthly('2024-01', 'admin-1', 'manual');
    const r2 = await svc.generateMonthly('2024-01', 'admin-1', 'manual');
    expect(r1.generatedCount).toBe(1);
    expect(r2.generatedCount).toBe(0);
    expect(r2.skippedCount).toBe(1);
  });

  it('treats a PG-23505 unique violation as skipped (hard idempotency guard)', async () => {
    // Simulate race: findOne returns null but save throws 23505
    const settlementRepo = {
      findOne: jest.fn(() => Promise.resolve(null)), // always says "not found"
      save: jest.fn(() => {
        const err = new Error('duplicate key');
        (err as any).code = '23505';
        return Promise.reject(err);
      }),
      create: jest.fn((e: any) => e),
    } as unknown as Repository<any>;

    const userRepo = {
      find: jest.fn(() => Promise.resolve([makeVendor('v1')])),
    } as unknown as Repository<any>;

    const listingRepo = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn(() => Promise.resolve([])),
      })),
    } as unknown as Repository<any>;

    const svc = new SettlementsService(
      settlementRepo,
      listingRepo,
      userRepo,
      { log: jest.fn(() => Promise.resolve({})) } as any,
      { calculate: jest.fn(() => ({ total: 0 })) } as any,
      { decrypt: jest.fn((v: any) => v), encrypt: jest.fn((v: any) => v) } as any,
    );

    const result = await svc.generateMonthly('2024-01', 'admin-1', 'manual');
    expect(result.generatedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.errorCount).toBe(0);
  });

  it('manual trigger and scheduler for same period both resolve safely', async () => {
    const vendors = [makeVendor('v1')];
    const svc = makeSettlementsService(vendors);

    // Simulate manual trigger first, scheduler second
    const [manualResult, schedulerResult] = await Promise.all([
      svc.generateMonthly('2024-01', 'admin-1', 'manual'),
      svc.generateMonthly('2024-01', SCHEDULER_ACTOR_ID, 'scheduler'),
    ]);

    const totalGenerated = manualResult.generatedCount + schedulerResult.generatedCount;
    const totalSkipped = manualResult.skippedCount + schedulerResult.skippedCount;

    // Exactly one settlement must have been created, the other call must have skipped
    expect(totalGenerated).toBe(1);
    expect(totalSkipped).toBe(1);
  });

  it('isolates vendor-level errors — other vendors still get processed', async () => {
    let callCount = 0;
    const settlementRepo = {
      findOne: jest.fn(() => Promise.resolve(null)),
      save: jest.fn(() => {
        callCount++;
        if (callCount === 1) {
          // First vendor fails with a non-unique error
          return Promise.reject(new Error('unexpected DB error'));
        }
        return Promise.resolve({ id: 'new-id', vendorId: 'v2', month: '2024-01' });
      }),
      create: jest.fn((e: any) => e),
    } as unknown as Repository<any>;

    const userRepo = {
      find: jest.fn(() => Promise.resolve([makeVendor('v1'), makeVendor('v2')])),
    } as unknown as Repository<any>;

    const listingRepo = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn(() => Promise.resolve([])),
      })),
    } as unknown as Repository<any>;

    const svc = new SettlementsService(
      settlementRepo,
      listingRepo,
      userRepo,
      { log: jest.fn(() => Promise.resolve({})) } as any,
      { calculate: jest.fn(() => ({ total: 0 })) } as any,
      { decrypt: jest.fn((v: any) => v), encrypt: jest.fn((v: any) => v) } as any,
    );

    const result = await svc.generateMonthly('2024-01', 'admin-1', 'manual');
    expect(result.errorCount).toBe(1);     // v1 failed
    expect(result.generatedCount).toBe(1); // v2 succeeded
  });

  it('generates settlements in different months independently', async () => {
    const svc = makeSettlementsService([makeVendor('v1')]);
    const jan = await svc.generateMonthly('2024-01', 'admin-1', 'manual');
    const feb = await svc.generateMonthly('2024-02', 'admin-1', 'manual');
    expect(jan.generatedCount).toBe(1);
    expect(feb.generatedCount).toBe(1);
    expect(jan.period).toBe('2024-01');
    expect(feb.period).toBe('2024-02');
  });
});

// ── period boundary: year rollover ────────────────────────────────────────────

describe('period boundary: year rollover', () => {
  it('Jan 1 scheduler generates Dec of previous year', async () => {
    const generate = makeGenerateMonthlyMock();
    const sched = makeScheduler(generate);
    await sched.tick(new Date('2025-01-01T00:00:00Z'));
    expect(generate).toHaveBeenCalledWith('2024-12', SCHEDULER_ACTOR_ID, 'scheduler');
  });

  it('previousMonthPeriod handles leap year boundary (Mar 1 2024 → Feb 2024)', () => {
    // 2024 is a leap year; Feb has 29 days — should not affect period labelling
    expect(previousMonthPeriod(new Date('2024-03-01T00:00:00Z'))).toBe('2024-02');
  });
});
