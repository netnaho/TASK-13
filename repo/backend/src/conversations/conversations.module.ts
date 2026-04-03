import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import {
  ConversationsController,
  AdminCannedResponsesController,
} from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { Conversation } from '../database/entities/conversation.entity';
import { Message } from '../database/entities/message.entity';
import { Listing } from '../database/entities/listing.entity';
import { RateLimitEvent } from '../database/entities/rate-limit-event.entity';
import { CannedResponse } from '../database/entities/canned-response.entity';
import { AuditModule } from '../audit/audit.module';
import { JWT_SECRET } from '../common/config/secrets';
import { RiskModule } from '../risk/risk.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Conversation,
      Message,
      Listing,
      RateLimitEvent,
      CannedResponse,
    ]),
    JwtModule.register({
      secret: JWT_SECRET,
    }),
    AuditModule,
    RiskModule,
  ],
  controllers: [ConversationsController, AdminCannedResponsesController],
  providers: [ConversationsService],
})
export class ConversationsModule {}
