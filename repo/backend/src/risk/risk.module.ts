import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RiskService } from './risk.service';
import { User } from '../database/entities/user.entity';
import { Listing } from '../database/entities/listing.entity';
import { RateLimitEvent } from '../database/entities/rate-limit-event.entity';
import { AuditModule } from '../audit/audit.module';
import { EncryptionService } from '../common/encryption/encryption.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Listing, RateLimitEvent]),
    AuditModule,
  ],
  providers: [RiskService, EncryptionService],
  exports: [RiskService],
})
export class RiskModule {}
