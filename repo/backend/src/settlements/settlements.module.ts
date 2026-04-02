import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';
import { FreightService } from './freight.service';
import { Settlement } from '../database/entities/settlement.entity';
import { Listing } from '../database/entities/listing.entity';
import { User } from '../database/entities/user.entity';
import { AuditModule } from '../audit/audit.module';
import { EncryptionService } from '../common/encryption/encryption.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Settlement, Listing, User]),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'local_dev_jwt_secret_change_in_prod',
    }),
    AuditModule,
  ],
  controllers: [SettlementsController],
  providers: [SettlementsService, FreightService, EncryptionService],
  exports: [FreightService],
})
export class SettlementsModule {}
