import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AuditService } from './audit.service';
import { JWT_SECRET } from '../common/config/secrets';
import { AuditLog } from '../database/entities/audit-log.entity';
import { AuditController, AdminAuditController } from './audit.controller';
import { User } from '../database/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([AuditLog, User]),
    JwtModule.register({
      secret: JWT_SECRET,
    }),
  ],
  controllers: [AuditController, AdminAuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
