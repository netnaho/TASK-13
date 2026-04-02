import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { Listing } from '../database/entities/listing.entity';
import { RateLimitEvent } from '../database/entities/rate-limit-event.entity';
import { AuditService } from '../audit/audit.service';
import { EncryptionService } from '../common/encryption/encryption.service';
import { logger } from '../common/logger/winston.logger';

export interface RiskFlag {
  riskFlag: string;
  detail: string;
}

@Injectable()
export class RiskService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Listing)
    private readonly listingRepo: Repository<Listing>,
    private readonly auditService: AuditService,
    private readonly encryption: EncryptionService,
  ) {}

  async assessListingCreation(
    vendorId: string,
    breed: string,
    deviceFingerprint?: string,
    ip?: string,
  ): Promise<RiskFlag[]> {
    const flags: RiskFlag[] = [];

    if (deviceFingerprint) {
      const multiAccountFlag = await this.checkMultiAccountDevice(
        vendorId,
        deviceFingerprint,
      );
      if (multiAccountFlag) flags.push(multiAccountFlag);
    }

    if (ip) {
      const ipFlag = await this.checkIpRisk(ip);
      if (ipFlag) flags.push(ipFlag);
    }

    const repostFlag = await this.checkFrequentRepost(vendorId, breed);
    if (repostFlag) flags.push(repostFlag);

    for (const flag of flags) {
      await this.auditService.log({
        action: 'RISK_FLAG',
        actorId: vendorId,
        entityType: 'listing',
        deviceFingerprint,
        ip,
        after: { flag: flag.riskFlag, detail: flag.detail } as unknown as Record<string, unknown>,
      });
      logger.warn(`Risk flag: ${flag.riskFlag} for user ${vendorId}`, {
        context: 'RiskService',
      });
    }

    return flags;
  }

  async assessConversationCreation(
    userId: string,
    deviceFingerprint?: string,
    ip?: string,
  ): Promise<RiskFlag[]> {
    const flags: RiskFlag[] = [];

    if (deviceFingerprint) {
      const multiAccountFlag = await this.checkMultiAccountDevice(userId, deviceFingerprint);
      if (multiAccountFlag) flags.push(multiAccountFlag);
    }

    if (ip) {
      const ipFlag = await this.checkIpRisk(ip);
      if (ipFlag) flags.push(ipFlag);
    }

    for (const flag of flags) {
      await this.auditService.log({
        action: 'RISK_FLAG',
        actorId: userId,
        entityType: 'conversation',
        deviceFingerprint,
        ip,
        after: { flag: flag.riskFlag, detail: flag.detail } as unknown as Record<string, unknown>,
      });
    }

    return flags;
  }

  private async checkMultiAccountDevice(
    userId: string,
    deviceFingerprint: string,
  ): Promise<RiskFlag | null> {
    const users = await this.userRepo.find();
    let matchCount = 0;

    for (const user of users) {
      if (user.id === userId) continue;
      if (!user.deviceFingerprint) continue;
      try {
        const decrypted = this.encryption.decrypt(user.deviceFingerprint);
        if (decrypted === deviceFingerprint) matchCount++;
      } catch {
        continue;
      }
    }

    if (matchCount >= 2) {
      return {
        riskFlag: 'multi_account_device',
        detail: `Device fingerprint found on ${matchCount + 1} accounts`,
      };
    }
    return null;
  }

  private async checkIpRisk(ip: string): Promise<RiskFlag | null> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentUsers = await this.userRepo
      .createQueryBuilder('u')
      .where('u.lastIp = :ip', { ip })
      .andWhere('u.createdAt >= :since', { since: oneDayAgo })
      .getCount();

    if (recentUsers > 5) {
      return {
        riskFlag: 'ip_risk',
        detail: `IP ${ip} created ${recentUsers} accounts in last 24h`,
      };
    }
    return null;
  }

  private async checkFrequentRepost(
    vendorId: string,
    breed: string,
  ): Promise<RiskFlag | null> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const count = await this.listingRepo
      .createQueryBuilder('l')
      .where('l.vendorId = :vendorId', { vendorId })
      .andWhere('LOWER(l.breed) = LOWER(:breed)', { breed })
      .andWhere('l.createdAt >= :since', { since: oneHourAgo })
      .andWhere('l.deletedAt IS NULL')
      .getCount();

    if (count > 5) {
      return {
        riskFlag: 'frequent_repost',
        detail: `Vendor posted ${count} listings for breed "${breed}" in last hour`,
      };
    }
    return null;
  }
}
