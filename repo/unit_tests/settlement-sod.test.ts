import { validateStep1Approval, validateStep2Approval } from '../backend/src/settlements/settlement-sod.policy';
import { SettlementStatus } from '../backend/src/database/entities/settlement.entity';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pendingSettlement() {
  return { status: SettlementStatus.PENDING, reviewerApprovedBy: null as string | null };
}

function reviewerApprovedSettlement(step1UserId = 'ops-user-1') {
  return { status: SettlementStatus.REVIEWER_APPROVED, reviewerApprovedBy: step1UserId };
}

// ── validateStep1Approval ─────────────────────────────────────────────────────

describe('validateStep1Approval', () => {
  describe('role checks', () => {
    it('ops_reviewer role is allowed', () => {
      expect(() => validateStep1Approval(pendingSettlement(), 'ops_reviewer')).not.toThrow();
    });

    it('finance_admin role is rejected', () => {
      expect(() => validateStep1Approval(pendingSettlement(), 'finance_admin'))
        .toThrow(ForbiddenException);
    });

    it('admin role is rejected — no bypass', () => {
      expect(() => validateStep1Approval(pendingSettlement(), 'admin'))
        .toThrow(ForbiddenException);
    });

    it('vendor role is rejected', () => {
      expect(() => validateStep1Approval(pendingSettlement(), 'vendor'))
        .toThrow(ForbiddenException);
    });

    it('shopper role is rejected', () => {
      expect(() => validateStep1Approval(pendingSettlement(), 'shopper'))
        .toThrow(ForbiddenException);
    });
  });

  describe('state checks', () => {
    it('PENDING status allows step 1', () => {
      expect(() => validateStep1Approval({ status: SettlementStatus.PENDING, reviewerApprovedBy: null }, 'ops_reviewer'))
        .not.toThrow();
    });

    it('REVIEWER_APPROVED status rejects step 1 (already done)', () => {
      expect(() => validateStep1Approval(
        { status: SettlementStatus.REVIEWER_APPROVED, reviewerApprovedBy: 'someone' },
        'ops_reviewer',
      )).toThrow(BadRequestException);
    });

    it('FINANCE_APPROVED status rejects step 1', () => {
      expect(() => validateStep1Approval(
        { status: SettlementStatus.FINANCE_APPROVED, reviewerApprovedBy: 'someone' },
        'ops_reviewer',
      )).toThrow(BadRequestException);
    });

    it('REJECTED status rejects step 1', () => {
      expect(() => validateStep1Approval(
        { status: SettlementStatus.REJECTED, reviewerApprovedBy: null },
        'ops_reviewer',
      )).toThrow(BadRequestException);
    });
  });
});

// ── validateStep2Approval ─────────────────────────────────────────────────────

describe('validateStep2Approval', () => {
  describe('role checks', () => {
    it('finance_admin role is allowed', () => {
      expect(() => validateStep2Approval(reviewerApprovedSettlement(), 'finance-user-1', 'finance_admin'))
        .not.toThrow();
    });

    it('ops_reviewer role is rejected — wrong step', () => {
      expect(() => validateStep2Approval(reviewerApprovedSettlement(), 'ops-user-2', 'ops_reviewer'))
        .toThrow(ForbiddenException);
    });

    it('admin role is rejected — no bypass', () => {
      expect(() => validateStep2Approval(reviewerApprovedSettlement(), 'admin-user-1', 'admin'))
        .toThrow(ForbiddenException);
    });

    it('vendor role is rejected', () => {
      expect(() => validateStep2Approval(reviewerApprovedSettlement(), 'vendor-user-1', 'vendor'))
        .toThrow(ForbiddenException);
    });
  });

  describe('state checks', () => {
    it('REVIEWER_APPROVED status allows step 2', () => {
      expect(() => validateStep2Approval(reviewerApprovedSettlement(), 'finance-user-1', 'finance_admin'))
        .not.toThrow();
    });

    it('PENDING status rejects step 2 (step 1 not done)', () => {
      expect(() => validateStep2Approval(
        { status: SettlementStatus.PENDING, reviewerApprovedBy: null },
        'finance-user-1',
        'finance_admin',
      )).toThrow(BadRequestException);
    });

    it('FINANCE_APPROVED status rejects step 2 (already final)', () => {
      expect(() => validateStep2Approval(
        { status: SettlementStatus.FINANCE_APPROVED, reviewerApprovedBy: 'ops-user-1' },
        'finance-user-1',
        'finance_admin',
      )).toThrow(BadRequestException);
    });
  });

  describe('separation-of-duties: same-user check', () => {
    it('same user who did step 1 cannot do step 2', () => {
      const SHARED_USER = 'dual-hat-user-1';
      const settlement = reviewerApprovedSettlement(SHARED_USER);
      expect(() => validateStep2Approval(settlement, SHARED_USER, 'finance_admin'))
        .toThrow(ForbiddenException);
    });

    it('same user ID with different roles is still blocked', () => {
      // A user who somehow holds both ops_reviewer and finance_admin roles
      // (or an admin acting as both) must be rejected.
      const SAME_USER = 'super-user-1';
      const settlement = reviewerApprovedSettlement(SAME_USER);
      expect(() => validateStep2Approval(settlement, SAME_USER, 'finance_admin'))
        .toThrow(ForbiddenException);
    });

    it('different user can do step 2 after step 1', () => {
      const settlement = reviewerApprovedSettlement('ops-user-1');
      expect(() => validateStep2Approval(settlement, 'finance-user-2', 'finance_admin'))
        .not.toThrow();
    });

    it('null step-1 approver does not block step 2 (no prior approver recorded)', () => {
      const settlement = { status: SettlementStatus.REVIEWER_APPROVED, reviewerApprovedBy: null };
      expect(() => validateStep2Approval(settlement, 'finance-user-1', 'finance_admin'))
        .not.toThrow();
    });
  });

  describe('full happy-path: distinct ops_reviewer → finance_admin', () => {
    it('valid two-step flow with distinct users succeeds at both steps', () => {
      const settlement = pendingSettlement();

      // Step 1
      expect(() => validateStep1Approval(settlement, 'ops_reviewer')).not.toThrow();

      // Simulate state transition
      settlement.status = SettlementStatus.REVIEWER_APPROVED;
      settlement.reviewerApprovedBy = 'ops-user-1';

      // Step 2
      expect(() => validateStep2Approval(settlement, 'finance-user-2', 'finance_admin')).not.toThrow();
    });
  });
});
