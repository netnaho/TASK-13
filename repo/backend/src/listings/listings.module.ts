import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ListingsController } from './listings.controller';
import { ListingsService } from './listings.service';
import { Listing } from '../database/entities/listing.entity';
import { SensitiveWord } from '../database/entities/sensitive-word.entity';
import { RateLimitEvent } from '../database/entities/rate-limit-event.entity';
import { AuditModule } from '../audit/audit.module';
import { RiskModule } from '../risk/risk.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Listing, SensitiveWord, RateLimitEvent]),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'local_dev_jwt_secret_change_in_prod',
    }),
    AuditModule,
    RiskModule,
  ],
  controllers: [ListingsController],
  providers: [ListingsService],
})
export class ListingsModule {}
