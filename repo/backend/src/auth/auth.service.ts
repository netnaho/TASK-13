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
import { createHash } from 'crypto';
import { User, UserRole } from '../database/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { EncryptionService } from '../common/encryption/encryption.service';
import { AuditService } from '../audit/audit.service';
import { UserSanitizerService } from '../common/sanitization/user-sanitizer.service';
import { UserView } from '../common/sanitization/user-view.model';
import { logger } from '../common/logger/winston.logger';
import { runSeed } from '../database/seed';

/**
 * Masks an IPv4 address to its /24 subnet (last octet replaced with *).
 * For IPv6 or non-standard formats, returns a short SHA-256 prefix so the
 * value is correlatable across events without exposing the raw address.
 * Exported for unit testing.
 */
export function maskIp(ip?: string): string {
  if (!ip) return 'unknown';
  const v4 = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.*`;
  return createHash('sha256').update(ip).digest('hex').slice(0, 8);
}

/**
 * Returns a short (8-hex-char) SHA-256 prefix of a device fingerprint so log
 * entries can be correlated across events without leaking the raw value.
 * Returns undefined when no fingerprint is present.
 * Exported for unit testing.
 */
export function hashFp(fp?: string): string | undefined {
  if (!fp) return undefined;
  return 'fp:' + createHash('sha256').update(fp).digest('hex').slice(0, 8);
}

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly dataSource: DataSource,
    private readonly encryption: EncryptionService,
    private readonly auditService: AuditService,
    private readonly sanitizer: UserSanitizerService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await runSeed(this.dataSource);
    } catch (err) {
      logger.error('Seed failed', { error: String(err), context: 'AuthService' });
    }
  }

  async register(dto: RegisterDto): Promise<UserView> {
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

    return this.sanitizer.sanitize(saved, saved.role);
  }

  async login(
    dto: LoginDto,
    ip?: string,
    deviceFingerprint?: string,
  ): Promise<{ token: string; user: UserView }> {
    const user = await this.userRepo.findOne({
      where: { username: dto.username, isActive: true },
      select: {
        id: true,
        username: true,
        email: true,
        passwordHash: true,
        role: true,
        isActive: true,
        deviceFingerprint: true,
        lastIp: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      logger.warn(`Login failed: unknown user ${dto.username}`, { context: 'Auth', ip: maskIp(ip), fpHash: hashFp(deviceFingerprint) });
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
      logger.warn(`Login failed: bad password for ${dto.username}`, { context: 'Auth', ip: maskIp(ip), fpHash: hashFp(deviceFingerprint) });
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
      ip: maskIp(ip),
    });

    await this.auditService.log({
      action: 'auth.login_success',
      actorId: user.id,
      entityType: 'user',
      entityId: user.id,
      ip,
      deviceFingerprint,
    });

    return { token, user: this.sanitizer.sanitize(user, user.role) };
  }
}
