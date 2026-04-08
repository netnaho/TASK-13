import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ListingsModule } from './listings/listings.module';
import { ConversationsModule } from './conversations/conversations.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { SettlementsModule } from './settlements/settlements.module';
import { CreditsModule } from './credits/credits.module';
import { AuditModule } from './audit/audit.module';
import { ExportsModule } from './exports/exports.module';
import { User } from './database/entities/user.entity';
import { Listing } from './database/entities/listing.entity';
import { Conversation } from './database/entities/conversation.entity';
import { Message } from './database/entities/message.entity';
import { Campaign } from './database/entities/campaign.entity';
import { Settlement } from './database/entities/settlement.entity';
import { CreditScore } from './database/entities/credit-score.entity';
import { AuditLog } from './database/entities/audit-log.entity';
import { AuditArchivalRecord } from './database/entities/audit-archival-record.entity';
import { ExportJob } from './database/entities/export-job.entity';
import { RateLimitEvent } from './database/entities/rate-limit-event.entity';
import { SensitiveWord } from './database/entities/sensitive-word.entity';
import { CannedResponse } from './database/entities/canned-response.entity';
import { SavedQuery } from './database/entities/saved-query.entity';
import { RiskModule } from './risk/risk.module';
import { QueryModule } from './query/query.module';
import { DB_PASSWORD } from './common/config/secrets';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        host: cfg.get<string>('DB_HOST', 'localhost'),
        port: cfg.get<number>('DB_PORT', 5432),
        username: cfg.get<string>('DB_USER', 'petmarket'),
        password: DB_PASSWORD,
        database: cfg.get<string>('DB_NAME', 'petmarket'),
        entities: [
          User,
          Listing,
          Conversation,
          Message,
          Campaign,
          Settlement,
          CreditScore,
          AuditLog,
          AuditArchivalRecord,
          ExportJob,
          RateLimitEvent,
          SensitiveWord,
          CannedResponse,
          SavedQuery,
        ],
        synchronize: process.env.NODE_ENV !== 'production',
        logging: ['error', 'warn'],
      }),
    }),
    AuthModule,
    UsersModule,
    ListingsModule,
    ConversationsModule,
    CampaignsModule,
    SettlementsModule,
    CreditsModule,
    AuditModule,
    ExportsModule,
    RiskModule,
    QueryModule,
  ],
})
export class AppModule {}
