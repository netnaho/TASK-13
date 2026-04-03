import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from '../database/entities/user.entity';
import { AuditModule } from '../audit/audit.module';
import { JWT_SECRET } from '../common/config/secrets';
import { EncryptionService } from '../common/encryption/encryption.service';
import { UserSanitizerService } from '../common/sanitization/user-sanitizer.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.register({
      secret: JWT_SECRET,
      signOptions: { expiresIn: '24h' },
    }),
    AuditModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, EncryptionService, UserSanitizerService],
  exports: [JwtModule, EncryptionService, UserSanitizerService],
})
export class AuthModule {}
