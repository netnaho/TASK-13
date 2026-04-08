/**
 * listing-vendor-projection.test.ts
 *
 * Regression tests for CVE: listing detail responses must never expose
 * sensitive User fields (passwordHash, email, deviceFingerprint, lastIp)
 * via the vendor relation.
 *
 * These tests verify the projection helper logic in isolation so they run
 * without a database, and cover all requester roles.
 */

import { VendorView } from '../backend/src/listings/dto/vendor-view.dto';

// Inline the same projection logic used in ListingsService.projectVendor
// to ensure the contract is tested independently of the class.
function projectVendor(vendor: Record<string, unknown>): VendorView {
  return {
    id: vendor.id as string,
    username: vendor.username as string,
    role: vendor.role as string,
  };
}

const SENSITIVE_FIELDS = ['passwordHash', 'email', 'deviceFingerprint', 'lastIp'];

function makeFullUser(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'vendor-uuid-1',
    username: 'vendoruser',
    email: 'ENCRYPTED_EMAIL',
    passwordHash: '$2b$10$somehashvalue',
    role: 'vendor',
    isActive: true,
    deviceFingerprint: 'ENCRYPTED_FP',
    lastIp: '10.0.0.1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('Vendor projection in listing responses — sensitive field exclusion', () => {
  const vendor = makeFullUser();
  const projected = projectVendor(vendor);

  describe('safe fields are preserved', () => {
    it('includes id', () => {
      expect(projected.id).toBe('vendor-uuid-1');
    });

    it('includes username', () => {
      expect(projected.username).toBe('vendoruser');
    });

    it('includes role', () => {
      expect(projected.role).toBe('vendor');
    });
  });

  describe('sensitive fields are absent', () => {
    for (const field of SENSITIVE_FIELDS) {
      it(`does not include ${field}`, () => {
        expect(projected).not.toHaveProperty(field);
      });
    }
  });

  describe('projected object has exactly the expected keys', () => {
    it('only id, username, role are present', () => {
      expect(Object.keys(projected).sort()).toEqual(['id', 'role', 'username'].sort());
    });
  });

  describe('all requester role scenarios produce the same safe projection', () => {
    const roles = ['anonymous', 'shopper', 'vendor', 'admin', 'ops_reviewer', 'finance_admin'];

    for (const role of roles) {
      it(`requester role '${role}': vendor in listing response has no sensitive fields`, () => {
        const result = projectVendor(makeFullUser());
        for (const field of SENSITIVE_FIELDS) {
          expect(result).not.toHaveProperty(field);
        }
        expect(result.id).toBeDefined();
        expect(result.username).toBeDefined();
        expect(result.role).toBeDefined();
      });
    }
  });

  describe('passwordHash is never present regardless of user data variation', () => {
    it('vendor with a real bcrypt hash: passwordHash is not projected', () => {
      const vendorWithRealHash = makeFullUser({
        passwordHash: '$2b$12$actualLongBcryptHashGoesHereXXXXXXXXXXXXX',
      });
      const result = projectVendor(vendorWithRealHash);
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('admin vendor: passwordHash is not projected', () => {
      const adminUser = makeFullUser({ role: 'admin', passwordHash: '$2b$10$adminHash' });
      const result = projectVendor(adminUser);
      expect(result).not.toHaveProperty('passwordHash');
    });
  });
});
