import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import {
  CampaignsPublicController,
  AdminCampaignsController,
  AdminSensitiveWordsController,
} from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { Campaign } from '../database/entities/campaign.entity';
import { SensitiveWord } from '../database/entities/sensitive-word.entity';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, SensitiveWord]),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'local_dev_jwt_secret_change_in_prod',
    }),
    AuditModule,
  ],
  controllers: [
    CampaignsPublicController,
    AdminCampaignsController,
    AdminSensitiveWordsController,
  ],
  providers: [CampaignsService],
})
export class CampaignsModule {}
