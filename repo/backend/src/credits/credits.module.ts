import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';
import { CreditScore } from '../database/entities/credit-score.entity';
import { Settlement } from '../database/entities/settlement.entity';
import { Conversation } from '../database/entities/conversation.entity';
import { Listing } from '../database/entities/listing.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CreditScore, Settlement, Conversation, Listing]),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'local_dev_jwt_secret_change_in_prod',
    }),
  ],
  controllers: [CreditsController],
  providers: [CreditsService],
})
export class CreditsModule {}
