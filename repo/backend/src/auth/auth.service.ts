import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../database/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { EncryptionService } from '../common/encryption/encryption.service';
import { AuditService } from '../audit/audit.service';
import { logger } from '../common/logger/winston.logger';
import { runSeed } from '../database/seed';

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
    private readonly encryption: EncryptionService,
    private readonly auditService: AuditService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await runSeed(this.dataSource);
    } catch (err) {
      logger.error('Seed failed', { error: String(err), context: 'AuthService' });
    }
  }

  async register(dto: RegisterDto): Promise<Omit<User, 'passwordHash'>> {
    const existingUsername = await this.userRepo.findOne({
      where: { username: dto.username },
    });
    if (existingUsername) {
      throw new ConflictException('Username already taken');
    }

    const rounds = parseInt(process.env.BCRYPT_ROUNDS ?? '10', 10);
    const passwordHash = await bcrypt.hash(dto.password, rounds);
    const encryptedEmail = this.encryption.encrypt(dto.email);

    const user = this.userRepo.create({
      username: dto.username,
      email: encryptedEmail,
      passwordHash,
      role: UserRole.SHOPPER,
    });
    const saved = await this.userRepo.save(user);

    await this.auditService.log({
      action: 'user.register',
      actorId: saved.id,
      entityType: 'user',
      entityId: saved.id,
      after: { id: saved.id, username: saved.username, role: saved.role } as unknown as Record<string, unknown>,
    });

    logger.info(`User registered: ${saved.username}`, { context: 'Auth' });

    const { passwordHash: _ph, ...safe } = saved;
    return { ...safe, email: dto.email };
  }

  async login(
    dto: LoginDto,
    ip?: string,
    deviceFingerprint?: string,
  ): Promise<{ token: string; user: Partial<User> }> {
    const user = await this.userRepo.findOne({
      where: { username: dto.username, isActive: true },
    });

    if (!user) {
      logger.warn(`Login failed: unknown user ${dto.username}`, { context: 'Auth', ip, deviceFingerprint });
      await this.auditService.log({
        action: 'auth.login_failed',
        actorId: 'unknown',
        entityType: 'user',
        ip,
        deviceFingerprint,
        after: { username: dto.username, reason: 'unknown_user' } as unknown as Record<string, unknown>,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      logger.warn(`Login failed: bad password for ${dto.username}`, { context: 'Auth', ip, deviceFingerprint });
      await this.auditService.log({
        action: 'auth.login_failed',
        actorId: user.id,
        entityType: 'user',
        entityId: user.id,
        ip,
        deviceFingerprint,
        after: { username: dto.username, reason: 'bad_password' } as unknown as Record<string, unknown>,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const encryptedFP = deviceFingerprint
      ? this.encryption.encrypt(deviceFingerprint)
      : null;

    await this.userRepo.update(user.id, {
      lastIp: ip ?? null,
      deviceFingerprint: encryptedFP,
    });

    const payload = { sub: user.id, username: user.username, role: user.role };
    const token = this.jwtService.sign(payload);

    logger.info(`Login success: ${user.username} role=${user.role}`, {
      context: 'Auth',
      ip,
    });

    await this.auditService.log({
      action: 'auth.login_success',
      actorId: user.id,
      entityType: 'user',
      entityId: user.id,
      ip,
      deviceFingerprint,
    });

    const { passwordHash: _ph, ...safeUser } = user;
    const decryptedEmail = this.encryption.decrypt(safeUser.email);
    return { token, user: { ...safeUser, email: decryptedEmail } };
  }

  sanitizeUserForRole(user: Partial<User>, requesterRole: string): Partial<User> {
    if (requesterRole === 'admin') {
      return {
        ...user,
        email: user.email ? this.encryption.decrypt(user.email) : user.email,
        deviceFingerprint: user.deviceFingerprint
          ? this.encryption.decrypt(user.deviceFingerprint)
          : user.deviceFingerprint,
      };
    }
    const { deviceFingerprint: _df, ...safe } = user;
    return { ...safe, email: '***encrypted***' };
  }
}
