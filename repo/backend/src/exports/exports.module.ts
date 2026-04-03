import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';
import { JWT_SECRET } from '../common/config/secrets';
import { ExportJob } from '../database/entities/export-job.entity';
import { EncryptionService } from '../common/encryption/encryption.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExportJob]),
    JwtModule.register({
      secret: JWT_SECRET,
    }),
  ],
  controllers: [ExportsController],
  providers: [ExportsService, EncryptionService],
})
export class ExportsModule {}
