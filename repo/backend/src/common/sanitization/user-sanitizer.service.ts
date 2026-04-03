import { Injectable } from '@nestjs/common';
import { User } from '../../database/entities/user.entity';
import { EncryptionService } from '../encryption/encryption.service';
import { UserView } from './user-view.model';

const PRIVILEGED_ROLES = new Set(['admin']);

@Injectable()
export class UserSanitizerService {
  constructor(private readonly encryption: EncryptionService) {}

  /**
   * Returns a sanitized UserView.
   * Default (non-privileged): email masked as '***', deviceFingerprint and lastIp omitted.
   * Privileged (admin): email and deviceFingerprint decrypted, lastIp included.
   */
  sanitize(user: Partial<User>, requesterRole: string): UserView {
    const base: UserView = {
      id: user.id!,
      username: user.username!,
      email: '***',
      role: user.role!,
      isActive: user.isActive ?? true,
      createdAt: user.createdAt!,
      updatedAt: user.updatedAt!,
    };

    if (PRIVILEGED_ROLES.has(requesterRole)) {
      return {
        ...base,
        email: user.email ? this.encryption.decrypt(user.email) : '***',
        deviceFingerprint: user.deviceFingerprint
          ? this.encryption.decrypt(user.deviceFingerprint)
          : user.deviceFingerprint ?? null,
        lastIp: user.lastIp ?? null,
      };
    }

    return base;
  }
}
