import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { CreditsController } from './credits.controller';
import { CreditsService } from './credits.service';
import { JWT_SECRET } from '../common/config/secrets';
import { CreditScore } from '../database/entities/credit-score.entity';
import { Settlement } from '../database/entities/settlement.entity';
import { Conversation } from '../database/entities/conversation.entity';
import { Listing } from '../database/entities/listing.entity';
import { User } from '../database/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CreditScore, Settlement, Conversation, Listing, User]),
    JwtModule.register({
      secret: JWT_SECRET,
    }),
  ],
  controllers: [CreditsController],
  providers: [CreditsService],
})
export class CreditsModule {}
