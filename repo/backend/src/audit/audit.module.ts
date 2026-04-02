import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AuditService } from './audit.service';
import { AuditLog } from '../database/entities/audit-log.entity';
import { AuditController, AdminAuditController } from './audit.controller';
import { User } from '../database/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog, User]),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'local_dev_jwt_secret_change_in_prod',
    }),
  ],
  controllers: [AuditController, AdminAuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
