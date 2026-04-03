import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { QueryController } from './query.controller';
import { QueryService } from './query.service';
import { JWT_SECRET } from '../common/config/secrets';
import { SavedQuery } from '../database/entities/saved-query.entity';
import { EncryptionService } from '../common/encryption/encryption.service';
import { UserSanitizerService } from '../common/sanitization/user-sanitizer.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SavedQuery]),
    JwtModule.register({
      secret: JWT_SECRET,
    }),
  ],
  controllers: [QueryController],
  providers: [QueryService, EncryptionService, UserSanitizerService],
})
export class QueryModule {}
