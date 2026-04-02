import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { CreditScore } from '../database/entities/credit-score.entity';
import { Settlement, SettlementStatus } from '../database/entities/settlement.entity';
import { Conversation } from '../database/entities/conversation.entity';
import { Listing, ListingStatus } from '../database/entities/listing.entity';

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

    const transactionSuccessRate =
      totalSettlements > 0 ? successfulSettlements / totalSettlements : 1.0;

    const totalConversations = await this.convRepo
      .createQueryBuilder('c')
      .where(
        '(c.vendorId = :userId OR :userId = ANY(c.shopperIds))',
        { userId },
      )
      .andWhere('c.createdAt >= :since', { since: ninetyDaysAgo })
      .getCount();

    const disputedConversations = await this.convRepo
      .createQueryBuilder('c')
      .where(
        '(c.vendorId = :userId OR :userId = ANY(c.shopperIds))',
        { userId },
      )
      .andWhere('c.isDisputed = true')
      .andWhere('c.createdAt >= :since', { since: ninetyDaysAgo })
      .getCount();

    const disputeRate =
      totalConversations > 0 ? disputedConversations / totalConversations : 0;

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

    const cancellationRate =
      totalListings > 0 ? cancelledListings / totalListings : 0;

    const rawScore =
      (transactionSuccessRate * 0.5 -
        disputeRate * 0.3 -
        cancellationRate * 0.2) *
      1000;
    const score = Math.round(Math.min(1000, Math.max(0, rawScore)));

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
