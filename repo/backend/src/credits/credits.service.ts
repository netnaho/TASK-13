import {
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { CreditScore } from '../database/entities/credit-score.entity';
import { Settlement, SettlementStatus } from '../database/entities/settlement.entity';
import { Conversation } from '../database/entities/conversation.entity';
import { Listing, ListingStatus } from '../database/entities/listing.entity';
import { User, UserRole } from '../database/entities/user.entity';

/**
 * Pure scoring formula shared by both vendor and shopper paths.
 * Exported so unit tests can cover it in isolation.
 */
export function computeRawScore(
  transactionSuccessRate: number,
  disputeRate: number,
  cancellationRate: number,
): number {
  const raw =
    (transactionSuccessRate * 0.5 - disputeRate * 0.3 - cancellationRate * 0.2) * 1000;
  return Math.round(Math.min(1000, Math.max(0, raw)));
}

@Injectable()
export class CreditsService {
  constructor(
    @InjectRepository(CreditScore)
    private readonly creditRepo: Repository<CreditScore>,
    @InjectRepository(Settlement)
    private readonly settlementRepo: Repository<Settlement>,
    @InjectRepository(Conversation)
    private readonly convRepo: Repository<Conversation>,
    @InjectRepository(Listing)
    private readonly listingRepo: Repository<Listing>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async getScore(
    userId: string,
    requesterId: string,
    requesterRole: string,
  ): Promise<CreditScore> {
    if (requesterRole !== 'admin' && requesterId !== userId) {
      throw new ForbiddenException('You can only view your own credit score');
    }

    const score = await this.creditRepo.findOne({
      where: { userId },
      order: { computedAt: 'DESC' },
    });

    if (!score) {
      const defaultScore = this.creditRepo.create({
        userId,
        score: 500,
        transactionSuccessRate: 1.0,
        disputeRate: 0,
        cancellationRate: 0,
      });
      return this.creditRepo.save(defaultScore);
    }

    return score;
  }

  async computeScore(userId: string): Promise<CreditScore> {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Determine the user's role to apply the appropriate scoring path.
    const user = await this.userRepo.findOne({ where: { id: userId } });
    const isVendor =
      !user ||
      user.role === UserRole.VENDOR ||
      user.role === UserRole.ADMIN;

    let transactionSuccessRate: number;
    let cancellationRate: number;

    if (isVendor) {
      // ── Vendor path ───────────────────────────────────────────────────────
      // Transaction success: settlements reaching FINANCE_APPROVED / total settlements
      const totalSettlements = await this.settlementRepo.count({
        where: {
          vendorId: userId,
          createdAt: MoreThanOrEqual(ninetyDaysAgo),
        },
      });

      const successfulSettlements = await this.settlementRepo.count({
        where: {
          vendorId: userId,
          status: SettlementStatus.FINANCE_APPROVED,
          createdAt: MoreThanOrEqual(ninetyDaysAgo),
        },
      });

      transactionSuccessRate =
        totalSettlements > 0 ? successfulSettlements / totalSettlements : 1.0;

      // Cancellation: archived (delisted) listings / total listings
      const totalListings = await this.listingRepo.count({
        where: {
          vendorId: userId,
          createdAt: MoreThanOrEqual(ninetyDaysAgo),
        },
      });

      const cancelledListings = await this.listingRepo.count({
        where: {
          vendorId: userId,
          status: ListingStatus.ARCHIVED,
          createdAt: MoreThanOrEqual(ninetyDaysAgo),
        },
      });

      cancellationRate = totalListings > 0 ? cancelledListings / totalListings : 0;
    } else {
      // ── Shopper path ──────────────────────────────────────────────────────
      // Transaction success: conversations that completed without dispute or
      // premature archival / total shopper conversations.
      const totalShopperConvs = await this.convRepo
        .createQueryBuilder('c')
        .where(':userId = ANY(c.shopperIds)', { userId })
        .andWhere('c.createdAt >= :since', { since: ninetyDaysAgo })
        .getCount();

      // Successful = not disputed AND not archived (active or naturally closed)
      const successfulShopperConvs = await this.convRepo
        .createQueryBuilder('c')
        .where(':userId = ANY(c.shopperIds)', { userId })
        .andWhere('c.isDisputed = false')
        .andWhere('c.isArchived = false')
        .andWhere('c.createdAt >= :since', { since: ninetyDaysAgo })
        .getCount();

      transactionSuccessRate =
        totalShopperConvs > 0 ? successfulShopperConvs / totalShopperConvs : 1.0;

      // Cancellation: shopper-archived (abandoned) conversations that were not
      // flagged as disputes (those count in disputeRate instead).
      const cancelledShopperConvs = await this.convRepo
        .createQueryBuilder('c')
        .where(':userId = ANY(c.shopperIds)', { userId })
        .andWhere('c.isArchived = true')
        .andWhere('c.isDisputed = false')
        .andWhere('c.createdAt >= :since', { since: ninetyDaysAgo })
        .getCount();

      cancellationRate =
        totalShopperConvs > 0 ? cancelledShopperConvs / totalShopperConvs : 0;
    }

    // ── Dispute rate — same formula for all roles ─────────────────────────────
    // Count conversations where the user was a participant and a dispute was raised.
    const totalConversations = await this.convRepo
      .createQueryBuilder('c')
      .where('(c.vendorId = :userId OR :userId = ANY(c.shopperIds))', { userId })
      .andWhere('c.createdAt >= :since', { since: ninetyDaysAgo })
      .getCount();

    const disputedConversations = await this.convRepo
      .createQueryBuilder('c')
      .where('(c.vendorId = :userId OR :userId = ANY(c.shopperIds))', { userId })
      .andWhere('c.isDisputed = true')
      .andWhere('c.createdAt >= :since', { since: ninetyDaysAgo })
      .getCount();

    const disputeRate =
      totalConversations > 0 ? disputedConversations / totalConversations : 0;

    const score = computeRawScore(transactionSuccessRate, disputeRate, cancellationRate);

    const existing = await this.creditRepo.findOne({
      where: { userId },
      order: { computedAt: 'DESC' },
    });

    if (existing) {
      existing.score = score;
      existing.transactionSuccessRate = transactionSuccessRate;
      existing.disputeRate = disputeRate;
      existing.cancellationRate = cancellationRate;
      return this.creditRepo.save(existing);
    }

    const entry = this.creditRepo.create({
      userId,
      score,
      transactionSuccessRate,
      disputeRate,
      cancellationRate,
    });
    return this.creditRepo.save(entry);
  }
}
