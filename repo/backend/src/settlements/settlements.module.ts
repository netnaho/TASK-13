import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';
import { JWT_SECRET } from '../common/config/secrets';
import { FreightService } from './freight.service';
import { SettlementSchedulerService } from './settlement-scheduler.service';
import { Settlement } from '../database/entities/settlement.entity';
import { Listing } from '../database/entities/listing.entity';
import { User } from '../database/entities/user.entity';
import { AuditModule } from '../audit/audit.module';
import { EncryptionService } from '../common/encryption/encryption.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Settlement, Listing, User]),
    JwtModule.register({
      secret: JWT_SECRET,
    }),
    AuditModule,
  ],
  controllers: [SettlementsController],
  providers: [SettlementsService, FreightService, EncryptionService, SettlementSchedulerService],
  exports: [FreightService],
})
export class SettlementsModule {}
