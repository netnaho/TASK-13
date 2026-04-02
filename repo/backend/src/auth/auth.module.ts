import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from '../database/entities/user.entity';
import { AuditModule } from '../audit/audit.module';
import { EncryptionService } from '../common/encryption/encryption.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'local_dev_jwt_secret_change_in_prod',
      signOptions: { expiresIn: '24h' },
    }),
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, EncryptionService],
  exports: [JwtModule, EncryptionService],
})
export class AuthModule {}
