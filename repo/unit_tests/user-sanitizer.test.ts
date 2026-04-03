import { UserSanitizerService } from '../backend/src/common/sanitization/user-sanitizer.service';
import { EncryptionService } from '../backend/src/common/encryption/encryption.service';
import { UserRole } from '../backend/src/database/entities/user.entity';

process.env.FIELD_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';

const encryption = new EncryptionService();
const sanitizer = new UserSanitizerService(encryption);

const PLAIN_EMAIL = 'user@example.com';
const PLAIN_FP = 'device-fingerprint-abc';

function makeUser(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'user-uuid-1',
    username: 'testuser',
    email: encryption.encrypt(PLAIN_EMAIL),
    role: UserRole.SHOPPER,
    isActive: true,
    deviceFingerprint: encryption.encrypt(PLAIN_FP),
    lastIp: '192.168.1.1',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('UserSanitizerService', () => {
  describe('shopper role — masked by default', () => {
    const result = sanitizer.sanitize(makeUser({ role: UserRole.SHOPPER }), 'shopper');

    it('email is masked', () => {
      expect(result.email).toBe('***');
    });

    it('deviceFingerprint is not present', () => {
      expect(result.deviceFingerprint).toBeUndefined();
    });

    it('lastIp is not present', () => {
      expect(result.lastIp).toBeUndefined();
    });

    it('non-sensitive fields are preserved', () => {
      expect(result.id).toBe('user-uuid-1');
      expect(result.username).toBe('testuser');
      expect(result.role).toBe(UserRole.SHOPPER);
      expect(result.isActive).toBe(true);
    });
  });

  describe('vendor role — masked by default', () => {
    const result = sanitizer.sanitize(makeUser({ role: UserRole.VENDOR }), 'vendor');

    it('email is masked', () => {
      expect(result.email).toBe('***');
    });

    it('deviceFingerprint is not present', () => {
      expect(result.deviceFingerprint).toBeUndefined();
    });

    it('lastIp is not present', () => {
      expect(result.lastIp).toBeUndefined();
    });
  });

  describe('ops_reviewer role — masked by default', () => {
    const result = sanitizer.sanitize(makeUser(), 'ops_reviewer');

    it('email is masked', () => {
      expect(result.email).toBe('***');
    });

    it('deviceFingerprint is not present', () => {
      expect(result.deviceFingerprint).toBeUndefined();
    });
  });

  describe('finance_admin role — masked by default', () => {
    const result = sanitizer.sanitize(makeUser(), 'finance_admin');

    it('email is masked', () => {
      expect(result.email).toBe('***');
    });
  });

  describe('admin role — unmasked when explicitly privileged', () => {
    const result = sanitizer.sanitize(makeUser({ role: UserRole.ADMIN }), 'admin');

    it('email is decrypted', () => {
      expect(result.email).toBe(PLAIN_EMAIL);
    });

    it('deviceFingerprint is decrypted', () => {
      expect(result.deviceFingerprint).toBe(PLAIN_FP);
    });

    it('lastIp is present', () => {
      expect(result.lastIp).toBe('192.168.1.1');
    });

    it('non-sensitive fields are preserved', () => {
      expect(result.id).toBe('user-uuid-1');
      expect(result.username).toBe('testuser');
    });
  });

  describe('login response uses masked-by-default policy', () => {
    it('shopper login: email is masked', () => {
      const user = makeUser({ role: UserRole.SHOPPER });
      const view = sanitizer.sanitize(user, UserRole.SHOPPER);
      expect(view.email).toBe('***');
      expect(view.deviceFingerprint).toBeUndefined();
      expect(view.lastIp).toBeUndefined();
    });

    it('vendor login: email is masked', () => {
      const user = makeUser({ role: UserRole.VENDOR });
      const view = sanitizer.sanitize(user, UserRole.VENDOR);
      expect(view.email).toBe('***');
    });

    it('admin login: email is unmasked', () => {
      const user = makeUser({ role: UserRole.ADMIN });
      const view = sanitizer.sanitize(user, UserRole.ADMIN);
      expect(view.email).toBe(PLAIN_EMAIL);
    });
  });

  describe('edge cases', () => {
    it('null deviceFingerprint returns null for admin', () => {
      const user = makeUser({ role: UserRole.ADMIN, deviceFingerprint: null });
      const view = sanitizer.sanitize(user, 'admin');
      expect(view.deviceFingerprint).toBeNull();
    });

    it('null email returns *** for non-admin', () => {
      const user = makeUser({ email: null });
      const view = sanitizer.sanitize(user, 'shopper');
      expect(view.email).toBe('***');
    });

    it('null email returns *** for admin (no ciphertext to decrypt)', () => {
      const user = makeUser({ role: UserRole.ADMIN, email: null });
      const view = sanitizer.sanitize(user, 'admin');
      expect(view.email).toBe('***');
    });
  });
});
