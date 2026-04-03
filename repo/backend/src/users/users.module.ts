import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JWT_SECRET } from '../common/config/secrets';
import { User } from '../database/entities/user.entity';
import { EncryptionService } from '../common/encryption/encryption.service';
import { UserSanitizerService } from '../common/sanitization/user-sanitizer.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.register({
      secret: JWT_SECRET,
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService, EncryptionService, UserSanitizerService],
})
export class UsersModule {}
