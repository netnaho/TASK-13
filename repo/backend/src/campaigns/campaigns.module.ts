import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import {
  CampaignsPublicController,
  AdminCampaignsController,
  AdminSensitiveWordsController,
} from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { JWT_SECRET } from '../common/config/secrets';
import { Campaign } from '../database/entities/campaign.entity';
import { SensitiveWord } from '../database/entities/sensitive-word.entity';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Campaign, SensitiveWord]),
    JwtModule.register({
      secret: JWT_SECRET,
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
