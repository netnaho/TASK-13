import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { ExportJob } from '../database/entities/export-job.entity';
import { EncryptionService } from '../common/encryption/encryption.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExportJob]),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'local_dev_jwt_secret_change_in_prod',
    }),
  ],
  controllers: [ExportsController],
  providers: [ExportsService, EncryptionService],
})
export class ExportsModule {}
