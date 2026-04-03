import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { Settlement, SettlementStatus } from '../database/entities/settlement.entity';

/**
 * Separation-of-duties policy for settlement approvals.
 *
 * Step 1 – ops_reviewer only; settlement must be PENDING.
 * Step 2 – finance_admin only; settlement must be REVIEWER_APPROVED;
 *           the step-2 actor MUST differ from the step-1 actor.
 *
 * Admin is intentionally excluded from both steps: financial dual-control
 * must be technically enforced, not just documented.
 */

export function validateStep1Approval(
  settlement: Pick<Settlement, 'status' | 'reviewerApprovedBy'>,
  actorRole: string,
): void {
  if (actorRole !== 'ops_reviewer') {
    throw new ForbiddenException('Step 1 approval requires ops_reviewer role');
  }
  if (settlement.status !== SettlementStatus.PENDING) {
    throw new BadRequestException(
      `Settlement must be in '${SettlementStatus.PENDING}' status for step 1 (current: ${settlement.status})`,
    );
  }
}

export function validateStep2Approval(
  settlement: Pick<Settlement, 'status' | 'reviewerApprovedBy'>,
  actorId: string,
  actorRole: string,
): void {
  if (actorRole !== 'finance_admin') {
    throw new ForbiddenException('Step 2 approval requires finance_admin role');
  }
  if (settlement.status !== SettlementStatus.REVIEWER_APPROVED) {
    throw new BadRequestException(
      `Settlement must be in '${SettlementStatus.REVIEWER_APPROVED}' status for step 2 (current: ${settlement.status})`,
    );
  }
  if (settlement.reviewerApprovedBy && settlement.reviewerApprovedBy === actorId) {
    throw new ForbiddenException(
      'Separation of duties: step 2 approver must be a different user than step 1 approver',
    );
  }
}
