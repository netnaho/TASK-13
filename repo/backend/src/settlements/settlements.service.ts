import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Settlement, SettlementStatus } from '../database/entities/settlement.entity';
import { Listing } from '../database/entities/listing.entity';
import { User } from '../database/entities/user.entity';
import { AuditService } from '../audit/audit.service';
import { FreightService } from './freight.service';
import { SettlementFiltersDto } from './dto/settlement.dto';
import { EncryptionService } from '../common/encryption/encryption.service';
import { validateStep1Approval, validateStep2Approval } from './settlement-sod.policy';
import { logger } from '../common/logger/winston.logger';

/** PG unique-violation error code */
const PG_UNIQUE_VIOLATION = '23505';
const SCHEDULER_CONTEXT = 'SettlementScheduler';

export interface GenerationRunResult {
  period: string;
  triggeredBy: 'manual' | 'scheduler';
  generatedCount: number;
  /** Vendors skipped because a statement already existed for the period. */
  skippedCount: number;
  /** Vendors where generation failed with an unexpected error. */
  errorCount: number;
  durationMs: number;
  settlements: Settlement[];
}

@Injectable()
export class SettlementsService {
  constructor(
    @InjectRepository(Settlement)
    private readonly settlementRepo: Repository<Settlement>,
    @InjectRepository(Listing)
    private readonly listingRepo: Repository<Listing>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly auditService: AuditService,
    private readonly freightService: FreightService,
    private readonly encryption: EncryptionService,
  ) {}

  async findAll(
    userId: string,
    role: string,
    filters: SettlementFiltersDto,
  ): Promise<Settlement[]> {
    const qb = this.settlementRepo.createQueryBuilder('s');

    if (role === 'vendor') {
      qb.where('s.vendorId = :userId', { userId });
    }
    if (filters.month) {
      qb.andWhere('s.month = :month', { month: filters.month });
    }
    if (filters.status) {
      qb.andWhere('s.status = :status', { status: filters.status });
    }

    return qb.orderBy('s.createdAt', 'DESC').getMany();
  }

  async findOne(id: string, userId: string, role: string): Promise<{
    settlement: Settlement;
    variance: { expected: number; actual: number; variance: number; variancePercent: number };
  }> {
    const settlement = await this.settlementRepo.findOne({ where: { id } });
    if (!settlement) throw new NotFoundException('Settlement not found');
    if (role === 'vendor' && settlement.vendorId !== userId) {
      throw new ForbiddenException('Access denied to this settlement');
    }

    const expected = Number(settlement.totalCharges);
    const actual = settlement.data?.actualCharges != null
      ? Number(settlement.data.actualCharges)
      : expected;
    const variance = actual - expected;
    const variancePercent = expected > 0 ? (variance / expected) * 100 : 0;

    return {
      settlement,
      variance: {
        expected: round(expected),
        actual: round(actual),
        variance: round(variance),
        variancePercent: round(variancePercent),
      },
    };
  }

  /**
   * Generates monthly settlement statements for all active vendors.
   *
   * Safe under retries and concurrent calls:
   *   1. Soft check: `findOne` skips vendors that already have a record
   *      (fast path, avoids unnecessary work).
   *   2. Hard guard: the DB unique index on `(vendorId, month)` catches any
   *      race window between the check and the insert.  A PG-23505 error is
   *      treated as "already generated" and counted as `skippedCount`.
   *
   * Vendor-level errors are isolated — a failure for one vendor increments
   * `errorCount` but does not abort the rest.
   */
  async generateMonthly(
    month: string,
    actorId: string,
    triggeredBy: 'manual' | 'scheduler' = 'manual',
  ): Promise<GenerationRunResult> {
    const startMs = Date.now();
    logger.info(`Settlement generation started`, {
      context: SCHEDULER_CONTEXT,
      period: month,
      triggeredBy,
    });

    const vendors = await this.userRepo.find({ where: { role: 'vendor' as any, isActive: true } });
    const settlements: Settlement[] = [];
    let skippedCount = 0;
    let errorCount = 0;

    for (const vendor of vendors) {
      // Soft idempotency check — avoids hitting the DB constraint on every retry
      const existing = await this.settlementRepo.findOne({
        where: { vendorId: vendor.id, month },
      });
      if (existing) {
        skippedCount++;
        continue;
      }

      try {
        const saved = await this.generateForVendor(vendor, month, actorId);
        settlements.push(saved);
      } catch (err: any) {
        if (err?.code === PG_UNIQUE_VIOLATION) {
          // Concurrent worker saved first — treat as already generated
          skippedCount++;
        } else {
          errorCount++;
          logger.error(`Settlement generation failed for vendor ${vendor.id}`, {
            context: SCHEDULER_CONTEXT,
            period: month,
            vendorId: vendor.id,
            error: err?.message,
          });
        }
      }
    }

    const durationMs = Date.now() - startMs;
    logger.info(`Settlement generation completed`, {
      context: SCHEDULER_CONTEXT,
      period: month,
      triggeredBy,
      generatedCount: settlements.length,
      skippedCount,
      errorCount,
      durationMs,
    });

    return {
      period: month,
      triggeredBy,
      generatedCount: settlements.length,
      skippedCount,
      errorCount,
      durationMs,
      settlements,
    };
  }

  private async generateForVendor(
    vendor: User,
    month: string,
    actorId: string,
  ): Promise<Settlement> {
    const listings = await this.listingRepo
      .createQueryBuilder('l')
      .where('l.vendorId = :vendorId', { vendorId: vendor.id })
      .andWhere("to_char(l.\"createdAt\", 'YYYY-MM') = :month", { month })
      .getMany();

    let totalCharges = 0;
    for (const listing of listings) {
      const freight = this.freightService.calculate({
        distanceMiles: 150,
        weightLbs: Number(listing.age) * 2 + 5,
        dimWeightLbs: 10,
        isOversized: false,
        isWeekend: false,
      });
      totalCharges += freight.total;
    }

    const taxAmount = round(totalCharges * 0.085);

    const settlement = this.settlementRepo.create({
      vendorId: vendor.id,
      month,
      totalCharges,
      taxAmount,
      status: SettlementStatus.PENDING,
      data: { listingCount: listings.length },
    });
    const saved = await this.settlementRepo.save(settlement);

    await this.auditService.log({
      action: 'settlement.generate',
      actorId,
      entityType: 'settlement',
      entityId: saved.id,
      after: { vendorId: vendor.id, month, totalCharges, taxAmount } as unknown as Record<string, unknown>,
    });

    return saved;
  }

  async approveStep1(id: string, reviewerId: string, role: string): Promise<Settlement> {
    const settlement = await this.settlementRepo.findOne({ where: { id } });
    if (!settlement) throw new NotFoundException('Settlement not found');

    validateStep1Approval(settlement, role);

    const before = { ...settlement } as unknown as Record<string, unknown>;
    settlement.status = SettlementStatus.REVIEWER_APPROVED;
    settlement.reviewerApprovedBy = reviewerId;
    settlement.reviewerApprovedAt = new Date();
    const saved = await this.settlementRepo.save(settlement);

    await this.auditService.log({
      action: 'settlement.approve_step1',
      actorId: reviewerId,
      entityType: 'settlement',
      entityId: id,
      before,
      after: { ...saved, approvedStep1By: reviewerId, approvedStep1At: saved.reviewerApprovedAt } as unknown as Record<string, unknown>,
    });

    return saved;
  }

  async approveStep2(id: string, financeId: string, role: string): Promise<Settlement> {
    const settlement = await this.settlementRepo.findOne({ where: { id } });
    if (!settlement) throw new NotFoundException('Settlement not found');

    validateStep2Approval(settlement, financeId, role);

    const before = { ...settlement } as unknown as Record<string, unknown>;
    settlement.status = SettlementStatus.FINANCE_APPROVED;
    settlement.financeApprovedBy = financeId;
    settlement.financeApprovedAt = new Date();
    const saved = await this.settlementRepo.save(settlement);

    await this.auditService.log({
      action: 'settlement.approve_step2',
      actorId: financeId,
      entityType: 'settlement',
      entityId: id,
      before,
      after: { ...saved, approvedStep2By: financeId, approvedStep2At: saved.financeApprovedAt } as unknown as Record<string, unknown>,
    });

    return saved;
  }

  async reject(id: string, actorId: string, role: string, reason: string): Promise<Settlement> {
    if (role !== 'ops_reviewer' && role !== 'finance_admin' && role !== 'admin') {
      throw new ForbiddenException('Only approver roles can reject settlements');
    }

    const settlement = await this.settlementRepo.findOne({ where: { id } });
    if (!settlement) throw new NotFoundException('Settlement not found');

    const before = { ...settlement } as unknown as Record<string, unknown>;
    settlement.status = SettlementStatus.REJECTED;
    settlement.data = { ...settlement.data, rejectedBy: actorId, rejectedReason: reason };
    const saved = await this.settlementRepo.save(settlement);

    await this.auditService.log({
      action: 'settlement.reject',
      actorId,
      entityType: 'settlement',
      entityId: id,
      before,
      after: saved as unknown as Record<string, unknown>,
    });

    return saved;
  }

  /**
   * Records actual charges for reconciliation against the expected totalCharges.
   * Stores values in the existing `data` JSONB field — no schema migration needed.
   * Safe for legacy rows: settlements without this field fall back to expected in findOne().
   */
  async recordActualCharges(
    id: string,
    actualCharges: number,
    actorId: string,
    notes?: string,
  ): Promise<Settlement> {
    const settlement = await this.settlementRepo.findOne({ where: { id } });
    if (!settlement) throw new NotFoundException('Settlement not found');

    const before = { ...settlement } as unknown as Record<string, unknown>;
    settlement.data = {
      ...settlement.data,
      actualCharges: round(actualCharges),
      reconciledAt: new Date().toISOString(),
      reconciledBy: actorId,
      ...(notes != null ? { reconciliationNotes: notes } : {}),
    };
    const saved = await this.settlementRepo.save(settlement);

    await this.auditService.log({
      action: 'settlement.reconcile',
      actorId,
      entityType: 'settlement',
      entityId: id,
      before,
      after: saved as unknown as Record<string, unknown>,
    });

    return saved;
  }

  async exportCsv(
    id: string,
    requesterId: string,
    requesterRole: string,
    requesterUsername: string,
  ): Promise<string> {
    const settlement = await this.settlementRepo.findOne({
      where: { id },
      relations: ['vendor'],
    });
    if (!settlement) throw new NotFoundException('Settlement not found');
    if (requesterRole === 'vendor' && settlement.vendorId !== requesterId) {
      throw new ForbiddenException('Access denied to this settlement');
    }
    if (settlement.status !== SettlementStatus.FINANCE_APPROVED) {
      throw new BadRequestException(
        `Only fully approved settlements can be exported (current status: ${settlement.status})`,
      );
    }

    const isAdmin = requesterRole === 'admin';
    const vendor = settlement.vendor;

    // Use the dedicated phone field — never the device fingerprint.
    // Empty string when no phone has been provided (not a placeholder like 'N/A'
    // because that could be mistaken for a real value in downstream processing).
    const phone = vendor?.phone
      ? isAdmin
        ? this.encryption.decrypt(vendor.phone)
        : '****' + this.encryption.decrypt(vendor.phone).slice(-4)
      : '';

    const email = vendor?.email
      ? isAdmin
        ? this.encryption.decrypt(vendor.email)
        : '***masked***'
      : 'N/A';

    const timestamp = new Date().toISOString();
    const rows = [
      `"CONFIDENTIAL - ${requesterUsername} - ${timestamp}"`,
      'Vendor ID,Vendor Username,Email,Phone,Month,Total Charges,Tax Amount,Status',
      [
        settlement.vendorId,
        vendor?.username ?? 'N/A',
        email,
        phone,
        settlement.month,
        settlement.totalCharges,
        settlement.taxAmount,
        settlement.status,
      ]
        .map((v) => `"${v}"`)
        .join(','),
    ];

    return rows.join('\n');
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
