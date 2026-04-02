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
    const actual = expected;
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

  async generateMonthly(month: string, actorId: string): Promise<Settlement[]> {
    const vendors = await this.userRepo.find({ where: { role: 'vendor' as any, isActive: true } });
    const results: Settlement[] = [];

    for (const vendor of vendors) {
      const existing = await this.settlementRepo.findOne({
        where: { vendorId: vendor.id, month },
      });
      if (existing) continue;

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
      results.push(saved);

      await this.auditService.log({
        action: 'settlement.generate',
        actorId,
        entityType: 'settlement',
        entityId: saved.id,
        after: { vendorId: vendor.id, month, totalCharges, taxAmount } as unknown as Record<string, unknown>,
      });
    }

    return results;
  }

  async approveStep1(id: string, reviewerId: string, role: string): Promise<Settlement> {
    if (role !== 'ops_reviewer' && role !== 'admin') {
      throw new ForbiddenException('Only ops_reviewer can perform step 1 approval');
    }

    const settlement = await this.settlementRepo.findOne({ where: { id } });
    if (!settlement) throw new NotFoundException('Settlement not found');
    if (settlement.status !== SettlementStatus.PENDING) {
      throw new BadRequestException('Settlement must be in pending status for step 1 approval');
    }

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
      after: saved as unknown as Record<string, unknown>,
    });

    return saved;
  }

  async approveStep2(id: string, financeId: string, role: string): Promise<Settlement> {
    if (role !== 'finance_admin' && role !== 'admin') {
      throw new ForbiddenException('Only finance_admin can perform step 2 approval');
    }

    const settlement = await this.settlementRepo.findOne({ where: { id } });
    if (!settlement) throw new NotFoundException('Settlement not found');
    if (settlement.status !== SettlementStatus.REVIEWER_APPROVED) {
      throw new BadRequestException('Step 1 approval must be completed before step 2');
    }

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
      after: saved as unknown as Record<string, unknown>,
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

    const isAdmin = requesterRole === 'admin';
    const vendor = settlement.vendor;

    const phone = vendor?.deviceFingerprint
      ? isAdmin
        ? this.encryption.decrypt(vendor.deviceFingerprint)
        : '****' + this.encryption.decrypt(vendor.deviceFingerprint).slice(-4)
      : 'N/A';

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
