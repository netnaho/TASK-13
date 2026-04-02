import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { QueryController } from './query.controller';
import { QueryService } from './query.service';
import { SavedQuery } from '../database/entities/saved-query.entity';
import { EncryptionService } from '../common/encryption/encryption.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SavedQuery]),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'local_dev_jwt_secret_change_in_prod',
    }),
  ],
  controllers: [QueryController],
  providers: [QueryService, EncryptionService],
})
export class QueryModule {}
