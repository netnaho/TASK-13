/**
 * settlement-variance.test.ts
 *
 * Tests for variance reconciliation in SettlementsService.findOne() and
 * SettlementsService.recordActualCharges():
 *   - Legacy settlements (no actualCharges in data) → zero variance
 *   - Settlements with actualCharges → correct non-zero variance + percent
 *   - variancePercent edge case when totalCharges = 0
 *   - recordActualCharges persists values into data JSONB and audits
 *   - ForbiddenException when vendor accesses another vendor's settlement
 */

import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { SettlementsService } from '../backend/src/settlements/settlements.service';
import { Repository } from 'typeorm';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeSettlement(overrides: Partial<{
  id: string;
  vendorId: string;
  totalCharges: number;
  data: Record<string, unknown>;
}> = {}) {
  return {
    id: 'settlement-1',
    vendorId: 'vendor-1',
    totalCharges: 100,
    taxAmount: 8.5,
    status: 'pending',
    data: {},
    ...overrides,
  };
}

function makeService(settlement: ReturnType<typeof makeSettlement> | null) {
  let stored = settlement ? { ...settlement } : null;

  const saveMock = jest.fn((entity: any) => {
    stored = { ...stored, ...entity };
    return Promise.resolve({ ...stored });
  });

  const settlementRepo = {
    findOne: jest.fn(() => Promise.resolve(stored ? { ...stored } : null)),
    save: saveMock,
  } as unknown as Repository<any>;

  const auditService = { log: jest.fn(() => Promise.resolve({})) };
  const freightService = { calculate: jest.fn(() => ({ total: 0 })) };
  const encryption = { decrypt: jest.fn((v: any) => v), encrypt: jest.fn((v: any) => v) };

  const svc = new SettlementsService(
    settlementRepo,
    {} as any,
    {} as any,
    auditService as any,
    freightService as any,
    encryption as any,
  );

  return { svc, settlementRepo, saveMock, auditService };
}

// ── findOne() variance ────────────────────────────────────────────────────────

describe('SettlementsService.findOne() — variance computation', () => {
  it('legacy settlement with no actualCharges → zero variance', async () => {
    const { svc } = makeService(makeSettlement({ totalCharges: 250, data: {} }));
    const result = await svc.findOne('settlement-1', 'vendor-1', 'vendor');

    expect(result.variance.expected).toBe(250);
    expect(result.variance.actual).toBe(250);
    expect(result.variance.variance).toBe(0);
    expect(result.variance.variancePercent).toBe(0);
  });

  it('legacy settlement with unrelated data fields → zero variance', async () => {
    const { svc } = makeService(
      makeSettlement({ totalCharges: 100, data: { listingCount: 3, rejectedBy: null } }),
    );
    const result = await svc.findOne('settlement-1', 'vendor-1', 'vendor');

    expect(result.variance.variance).toBe(0);
    expect(result.variance.variancePercent).toBe(0);
  });

  it('actualCharges > expected → positive variance', async () => {
    const { svc } = makeService(
      makeSettlement({ totalCharges: 200, data: { actualCharges: 230 } }),
    );
    const result = await svc.findOne('settlement-1', 'vendor-1', 'vendor');

    expect(result.variance.expected).toBe(200);
    expect(result.variance.actual).toBe(230);
    expect(result.variance.variance).toBe(30);
    expect(result.variance.variancePercent).toBe(15);
  });

  it('actualCharges < expected → negative variance', async () => {
    const { svc } = makeService(
      makeSettlement({ totalCharges: 200, data: { actualCharges: 180 } }),
    );
    const result = await svc.findOne('settlement-1', 'vendor-1', 'vendor');

    expect(result.variance.expected).toBe(200);
    expect(result.variance.actual).toBe(180);
    expect(result.variance.variance).toBe(-20);
    expect(result.variance.variancePercent).toBe(-10);
  });

  it('variancePercent rounds to 2 decimal places', async () => {
    // 100/3 → 33.333… expected, actual 34 → variance 0.666…, percent 1.99…
    const { svc } = makeService(
      makeSettlement({ totalCharges: 33.33, data: { actualCharges: 34 } }),
    );
    const result = await svc.findOne('settlement-1', 'vendor-1', 'vendor');

    expect(result.variance.variancePercent).toBe(Math.round(((34 - 33.33) / 33.33) * 100 * 100) / 100);
  });

  it('edge case: expected = 0, variancePercent is 0 (no division)', async () => {
    const { svc } = makeService(
      makeSettlement({ totalCharges: 0, data: { actualCharges: 50 } }),
    );
    const result = await svc.findOne('settlement-1', 'vendor-1', 'vendor');

    expect(result.variance.expected).toBe(0);
    expect(result.variance.actual).toBe(50);
    expect(result.variance.variance).toBe(50);
    expect(result.variance.variancePercent).toBe(0); // guard against division by zero
  });

  it('edge case: expected = 0 and actualCharges = 0 → all zeros', async () => {
    const { svc } = makeService(
      makeSettlement({ totalCharges: 0, data: { actualCharges: 0 } }),
    );
    const result = await svc.findOne('settlement-1', 'vendor-1', 'vendor');

    expect(result.variance.variance).toBe(0);
    expect(result.variance.variancePercent).toBe(0);
  });

  it('actualCharges = 0 is treated as a real value, not a missing value', async () => {
    const { svc } = makeService(
      makeSettlement({ totalCharges: 100, data: { actualCharges: 0 } }),
    );
    const result = await svc.findOne('settlement-1', 'vendor-1', 'vendor');

    // actualCharges=0 is explicitly set; should NOT fall back to expected
    expect(result.variance.actual).toBe(0);
    expect(result.variance.variance).toBe(-100);
  });

  it('throws NotFoundException when settlement does not exist', async () => {
    const { svc } = makeService(null);
    await expect(svc.findOne('missing-id', 'any-user', 'admin')).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when vendor accesses another vendor settlement', async () => {
    const { svc } = makeService(makeSettlement({ vendorId: 'vendor-99' }));
    await expect(svc.findOne('settlement-1', 'vendor-1', 'vendor')).rejects.toThrow(ForbiddenException);
  });

  it('admin can access any settlement regardless of vendorId', async () => {
    const { svc } = makeService(makeSettlement({ vendorId: 'vendor-99' }));
    await expect(svc.findOne('settlement-1', 'admin-1', 'admin')).resolves.toBeDefined();
  });
});

// ── recordActualCharges() ─────────────────────────────────────────────────────

describe('SettlementsService.recordActualCharges()', () => {
  it('persists actualCharges into data JSONB', async () => {
    const { svc, saveMock } = makeService(makeSettlement({ totalCharges: 100, data: { listingCount: 2 } }));
    await svc.recordActualCharges('settlement-1', 115.5, 'admin-1');

    const saved = saveMock.mock.calls[0][0];
    expect(saved.data.actualCharges).toBe(115.5);
  });

  it('rounds actualCharges to 2 decimal places', async () => {
    const { svc, saveMock } = makeService(makeSettlement({ totalCharges: 100 }));
    await svc.recordActualCharges('settlement-1', 115.555, 'admin-1');

    const saved = saveMock.mock.calls[0][0];
    expect(saved.data.actualCharges).toBe(115.56);
  });

  it('preserves existing data fields (no accidental overwrite)', async () => {
    const { svc, saveMock } = makeService(
      makeSettlement({ data: { listingCount: 5, rejectedBy: null } }),
    );
    await svc.recordActualCharges('settlement-1', 90, 'admin-1');

    const saved = saveMock.mock.calls[0][0];
    expect(saved.data.listingCount).toBe(5);
    expect(saved.data.rejectedBy).toBeNull();
    expect(saved.data.actualCharges).toBe(90);
  });

  it('stores optional notes when provided', async () => {
    const { svc, saveMock } = makeService(makeSettlement());
    await svc.recordActualCharges('settlement-1', 90, 'admin-1', 'manual adjustment after audit');

    const saved = saveMock.mock.calls[0][0];
    expect(saved.data.reconciliationNotes).toBe('manual adjustment after audit');
  });

  it('does not set reconciliationNotes when notes is undefined', async () => {
    const { svc, saveMock } = makeService(makeSettlement());
    await svc.recordActualCharges('settlement-1', 90, 'admin-1');

    const saved = saveMock.mock.calls[0][0];
    expect(Object.prototype.hasOwnProperty.call(saved.data, 'reconciliationNotes')).toBe(false);
  });

  it('writes reconciledBy and reconciledAt metadata', async () => {
    const { svc, saveMock } = makeService(makeSettlement());
    await svc.recordActualCharges('settlement-1', 90, 'admin-42');

    const saved = saveMock.mock.calls[0][0];
    expect(saved.data.reconciledBy).toBe('admin-42');
    expect(typeof saved.data.reconciledAt).toBe('string');
  });

  it('emits a settlement.reconcile audit event', async () => {
    const { svc, auditService } = makeService(makeSettlement());
    await svc.recordActualCharges('settlement-1', 90, 'admin-1');

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'settlement.reconcile', actorId: 'admin-1' }),
    );
  });

  it('throws NotFoundException when settlement does not exist', async () => {
    const { svc } = makeService(null);
    await expect(
      svc.recordActualCharges('missing-id', 50, 'admin-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('round-trip: after recordActualCharges the findOne variance reflects new value', async () => {
    // Use a shared in-memory store so save() updates what findOne() returns
    let stored = makeSettlement({ totalCharges: 200, data: {} });
    const settlementRepo = {
      findOne: jest.fn(() => Promise.resolve({ ...stored })),
      save: jest.fn((entity: any) => {
        stored = { ...stored, ...entity };
        return Promise.resolve({ ...stored });
      }),
    } as unknown as Repository<any>;

    const auditService = { log: jest.fn(() => Promise.resolve({})) };
    const svc = new SettlementsService(
      settlementRepo,
      {} as any,
      {} as any,
      auditService as any,
      { calculate: jest.fn(() => ({ total: 0 })) } as any,
      { decrypt: jest.fn((v: any) => v), encrypt: jest.fn((v: any) => v) } as any,
    );

    await svc.recordActualCharges('settlement-1', 240, 'admin-1');
    const result = await svc.findOne('settlement-1', 'admin-1', 'admin');

    expect(result.variance.expected).toBe(200);
    expect(result.variance.actual).toBe(240);
    expect(result.variance.variance).toBe(40);
    expect(result.variance.variancePercent).toBe(20);
  });
});
