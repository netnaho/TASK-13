/**
 * credit.service.test.ts
 *
 * Tests for the credit scoring system covering:
 *  1. The pure formula (weights, clamping) — role-agnostic, now via exported computeRawScore
 *  2. Vendor scoring path (settlement + listing based)
 *  3. Shopper scoring path (conversation based — no vendor-only fields)
 *  4. Edge cases: no activity, partial activity, disputed activity
 */

import { CreditsService, computeRawScore } from '../backend/src/credits/credits.service';
import { UserRole } from '../backend/src/database/entities/user.entity';
import { SettlementStatus } from '../backend/src/database/entities/settlement.entity';
import { ListingStatus } from '../backend/src/database/entities/listing.entity';

// ── Pure formula ──────────────────────────────────────────────────────────────

describe('computeRawScore — formula', () => {
  it('perfect vendor/shopper scores 500 (100% success, 0 dispute, 0 cancel)', () => {
    expect(computeRawScore(1.0, 0, 0)).toBe(500);
  });

  it('worst case clamps to 0', () => {
    expect(computeRawScore(0, 1.0, 1.0)).toBe(0);
  });

  it('applies 0.5/0.3/0.2 weights correctly', () => {
    const score = computeRawScore(0.8, 0.1, 0.05);
    const expected = Math.round((0.8 * 0.5 - 0.1 * 0.3 - 0.05 * 0.2) * 1000);
    expect(score).toBe(expected);
  });

  it('clamps above 1000', () => {
    expect(computeRawScore(3.0, 0, 0)).toBe(1000);
  });

  it('clamps below 0', () => {
    expect(computeRawScore(0, 2.0, 2.0)).toBe(0);
  });

  it('default score for no history is 1.0 success rate → 500', () => {
    expect(computeRawScore(1.0, 0, 0)).toBe(500);
  });

  it('mixed rates compute correctly', () => {
    const score = computeRawScore(0.92, 0.02, 0.06);
    const expected = Math.round((0.92 * 0.5 - 0.02 * 0.3 - 0.06 * 0.2) * 1000);
    expect(score).toBe(expected);
    expect(score).toBe(442);
  });
});

// ── Service stub helpers ──────────────────────────────────────────────────────

function makeQb(count: number) {
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(count),
  };
  return qb;
}

function makeConvRepoSequence(...counts: number[]) {
  const sequence = counts.map(makeQb);
  let i = 0;
  return {
    createQueryBuilder: jest.fn(() => sequence[i++ % sequence.length]),
  };
}

function makeSettlementRepo(total: number, successful: number) {
  return {
    count: jest.fn()
      .mockResolvedValueOnce(total)
      .mockResolvedValueOnce(successful),
  };
}

function makeListingRepo(total: number, cancelled: number) {
  return {
    count: jest.fn()
      .mockResolvedValueOnce(total)
      .mockResolvedValueOnce(cancelled),
  };
}

function makeCreditRepo() {
  return {
    findOne: jest.fn().mockResolvedValue(null), // no existing record
    create: jest.fn((e: any) => e),
    save: jest.fn((e: any) => Promise.resolve(e)),
  };
}

function makeUserRepo(role: UserRole) {
  return {
    findOne: jest.fn(() => Promise.resolve({ id: 'user-1', role })),
  };
}

// ── Vendor path ───────────────────────────────────────────────────────────────

describe('CreditsService.computeScore — vendor path', () => {
  function buildVendorService(
    settlements: { total: number; successful: number },
    listings: { total: number; cancelled: number },
    dispute: { total: number; disputed: number },
  ) {
    // vendor: 2 calls for settlement count, 2 for listing count, 2 for dispute convs
    const settlementRepo = makeSettlementRepo(settlements.total, settlements.successful);
    const listingRepo = makeListingRepo(listings.total, listings.cancelled);
    const convRepo = makeConvRepoSequence(dispute.total, dispute.disputed);
    const creditRepo = makeCreditRepo();
    const userRepo = makeUserRepo(UserRole.VENDOR);

    const svc = new CreditsService(
      creditRepo as any,
      settlementRepo as any,
      convRepo as any,
      listingRepo as any,
      userRepo as any,
    );
    return { svc, creditRepo, settlementRepo, listingRepo };
  }

  it('vendor with perfect settlement record scores 500', async () => {
    const { svc, creditRepo } = buildVendorService(
      { total: 10, successful: 10 },
      { total: 5, cancelled: 0 },
      { total: 10, disputed: 0 },
    );

    await svc.computeScore('user-1');

    const saved = (creditRepo.save as jest.Mock).mock.calls[0]?.[0];
    expect(saved.transactionSuccessRate).toBe(1.0);
    expect(saved.cancellationRate).toBe(0);
    expect(saved.disputeRate).toBe(0);
    expect(saved.score).toBe(500);
  });

  it('vendor with no settlements defaults to 100% success rate', async () => {
    const { svc, creditRepo } = buildVendorService(
      { total: 0, successful: 0 },
      { total: 0, cancelled: 0 },
      { total: 0, disputed: 0 },
    );

    await svc.computeScore('user-1');

    const saved = (creditRepo.save as jest.Mock).mock.calls[0]?.[0];
    expect(saved.transactionSuccessRate).toBe(1.0);
    expect(saved.score).toBe(500);
  });

  it('vendor with 50% settlement success rate has reduced score', async () => {
    const { svc, creditRepo } = buildVendorService(
      { total: 10, successful: 5 },
      { total: 0, cancelled: 0 },
      { total: 0, disputed: 0 },
    );

    await svc.computeScore('user-1');

    const saved = (creditRepo.save as jest.Mock).mock.calls[0]?.[0];
    expect(saved.transactionSuccessRate).toBe(0.5);
    expect(saved.score).toBe(computeRawScore(0.5, 0, 0));
  });

  it('vendor cancellation rate based on archived listings', async () => {
    const { svc, creditRepo } = buildVendorService(
      { total: 5, successful: 5 },
      { total: 10, cancelled: 2 },
      { total: 0, disputed: 0 },
    );

    await svc.computeScore('user-1');

    const saved = (creditRepo.save as jest.Mock).mock.calls[0]?.[0];
    expect(saved.cancellationRate).toBeCloseTo(0.2);
    expect(saved.score).toBe(computeRawScore(1.0, 0, 0.2));
  });
});

// ── Shopper path ──────────────────────────────────────────────────────────────

describe('CreditsService.computeScore — shopper path (no vendor-only fields)', () => {
  function buildShopperService(
    shopperConvs: { total: number; successful: number; cancelled: number },
    dispute: { total: number; disputed: number },
  ) {
    // shopper: 3 calls for shopper convs + 2 for dispute convs = 5 total
    const convRepo = makeConvRepoSequence(
      shopperConvs.total,
      shopperConvs.successful,
      shopperConvs.cancelled,
      dispute.total,
      dispute.disputed,
    );
    const creditRepo = makeCreditRepo();
    const settlementRepo = makeSettlementRepo(0, 0);
    const listingRepo = makeListingRepo(0, 0);
    const userRepo = makeUserRepo(UserRole.SHOPPER);

    const svc = new CreditsService(
      creditRepo as any,
      settlementRepo as any,
      convRepo as any,
      listingRepo as any,
      userRepo as any,
    );
    return { svc, creditRepo, settlementRepo, listingRepo };
  }

  it('shopper with all active non-disputed conversations scores 500', async () => {
    const { svc, creditRepo } = buildShopperService(
      { total: 10, successful: 10, cancelled: 0 },
      { total: 10, disputed: 0 },
    );

    await svc.computeScore('user-1');

    const saved = (creditRepo.save as jest.Mock).mock.calls[0]?.[0];
    expect(saved.transactionSuccessRate).toBe(1.0);
    expect(saved.cancellationRate).toBe(0);
    expect(saved.disputeRate).toBe(0);
    expect(saved.score).toBe(500);
  });

  it('shopper with no conversation history defaults to max success', async () => {
    const { svc, creditRepo } = buildShopperService(
      { total: 0, successful: 0, cancelled: 0 },
      { total: 0, disputed: 0 },
    );

    await svc.computeScore('user-1');

    const saved = (creditRepo.save as jest.Mock).mock.calls[0]?.[0];
    expect(saved.transactionSuccessRate).toBe(1.0);
    expect(saved.score).toBe(500);
  });

  it('shopper with disputed conversations has reduced score', async () => {
    const { svc, creditRepo } = buildShopperService(
      { total: 10, successful: 8, cancelled: 0 },
      { total: 10, disputed: 2 },
    );

    await svc.computeScore('user-1');

    const saved = (creditRepo.save as jest.Mock).mock.calls[0]?.[0];
    expect(saved.disputeRate).toBeCloseTo(0.2);
    expect(saved.score).toBeLessThan(500);
  });

  it('shopper score is independent of settlement counts (settlementRepo NOT called)', async () => {
    const { svc, settlementRepo } = buildShopperService(
      { total: 5, successful: 5, cancelled: 0 },
      { total: 5, disputed: 0 },
    );

    await svc.computeScore('user-1');

    expect(settlementRepo.count).not.toHaveBeenCalled();
  });

  it('shopper score is independent of listing counts (listingRepo NOT called)', async () => {
    const { svc, listingRepo } = buildShopperService(
      { total: 5, successful: 5, cancelled: 0 },
      { total: 5, disputed: 0 },
    );

    await svc.computeScore('user-1');

    expect(listingRepo.count).not.toHaveBeenCalled();
  });

  it('shopper cancellation rate uses archived conversations (not listings)', async () => {
    const { svc, creditRepo } = buildShopperService(
      { total: 10, successful: 6, cancelled: 2 },
      { total: 10, disputed: 0 },
    );

    await svc.computeScore('user-1');

    const saved = (creditRepo.save as jest.Mock).mock.calls[0]?.[0];
    expect(saved.cancellationRate).toBeCloseTo(0.2);
    expect(saved.score).toBe(computeRawScore(saved.transactionSuccessRate, 0, 0.2));
  });

  it('shopper with 100% cancellations scores 0 after clamping', async () => {
    const { svc, creditRepo } = buildShopperService(
      { total: 5, successful: 0, cancelled: 5 },
      { total: 5, disputed: 5 },
    );

    await svc.computeScore('user-1');

    const saved = (creditRepo.save as jest.Mock).mock.calls[0]?.[0];
    expect(saved.score).toBe(0);
  });
});

// ── Admin uses vendor path ────────────────────────────────────────────────────

describe('CreditsService.computeScore — admin uses vendor path', () => {
  it('admin role triggers settlement-based scoring', async () => {
    const settlementRepo = makeSettlementRepo(4, 4);
    const listingRepo = makeListingRepo(0, 0);
    const convRepo = makeConvRepoSequence(0, 0);
    const creditRepo = makeCreditRepo();
    const userRepo = makeUserRepo(UserRole.ADMIN);

    const svc = new CreditsService(
      creditRepo as any,
      settlementRepo as any,
      convRepo as any,
      listingRepo as any,
      userRepo as any,
    );

    await svc.computeScore('admin-user-1');

    expect(settlementRepo.count).toHaveBeenCalled();
  });
});
