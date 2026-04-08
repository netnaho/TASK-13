/**
 * seed-encryption.test.ts
 *
 * Regression tests for compliance issue: seed users had email fields stored in
 * plaintext.  After the fix, runSeed must persist emails in encrypted form using
 * the same EncryptionService used by the auth flow.
 *
 * Tests:
 *  1. Seeded user emails are stored with the 'enc:' prefix (AES-256-CBC + IV).
 *  2. Seeded emails are not equal to the original plaintext values.
 *  3. Encrypted values are stable / deterministic (each new call produces a
 *     different ciphertext — IV randomness — but the decrypted value is correct).
 *  4. The EncryptionService idempotency guard prevents double-encryption.
 */

// Set the encryption key env var BEFORE any module that reads it is imported.
process.env.FIELD_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';

import { runSeed } from '../backend/src/database/seed';
import { EncryptionService } from '../backend/src/common/encryption/encryption.service';
import { User } from '../backend/src/database/entities/user.entity';
import { Listing } from '../backend/src/database/entities/listing.entity';
import { SensitiveWord } from '../backend/src/database/entities/sensitive-word.entity';
import { CreditScore } from '../backend/src/database/entities/credit-score.entity';

// ── Minimal DataSource mock ───────────────────────────────────────────────────

function makeRepo(existingByUsername: Record<string, any> = {}) {
  const saved: any[] = [];
  return {
    saved,
    findOne: jest.fn(({ where }: any) => {
      // Handle both { username } and { userId } lookups
      const match =
        existingByUsername[where?.username] ??
        existingByUsername[where?.userId] ??
        null;
      return Promise.resolve(match);
    }),
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn((entity: any) => {
      saved.push({ ...entity });
      return Promise.resolve({ ...entity, id: `uuid-${saved.length}` });
    }),
    count: jest.fn(() => Promise.resolve(0)),
    find: jest.fn(() => Promise.resolve([])),
  };
}

function makeMockDataSource() {
  const userRepo   = makeRepo();
  const listingRepo = makeRepo();
  const wordRepo   = makeRepo();
  const creditRepo  = makeRepo();

  const ds = {
    getRepository: jest.fn((entity: any) => {
      switch (entity?.name) {
        case 'User':          return userRepo;
        case 'Listing':       return listingRepo;
        case 'SensitiveWord': return wordRepo;
        case 'CreditScore':   return creditRepo;
        default:              return makeRepo();
      }
    }),
  };

  return { ds, userRepo, listingRepo, wordRepo, creditRepo };
}

// ── Seed email encryption ─────────────────────────────────────────────────────

describe('runSeed — email encryption', () => {
  const PLAINTEXT_EMAILS = [
    'admin@petmarket.local',
    'vendor@petmarket.local',
    'shopper@petmarket.local',
  ];

  let userRepo: ReturnType<typeof makeRepo>;

  beforeAll(async () => {
    const { ds, userRepo: repo } = makeMockDataSource();
    userRepo = repo;
    await runSeed(ds as any);
  });

  it('saves exactly three seed users', () => {
    expect(userRepo.saved.length).toBe(3);
  });

  it('each seeded email starts with the "enc:" prefix', () => {
    for (const user of userRepo.saved) {
      expect(user.email).toMatch(/^enc:/);
    }
  });

  it('no seeded email equals its plaintext original', () => {
    const savedEmails = userRepo.saved.map((u: any) => u.email);
    for (const plain of PLAINTEXT_EMAILS) {
      expect(savedEmails).not.toContain(plain);
    }
  });

  it('each seeded email decrypts back to the expected plaintext', () => {
    const encryption = new EncryptionService();
    for (const user of userRepo.saved) {
      const decrypted = encryption.decrypt(user.email);
      expect(PLAINTEXT_EMAILS).toContain(decrypted);
    }
  });

  it('passwords are still hashed (not stored as plaintext)', () => {
    const PLAINTEXT_PASSWORDS = ['admin123', 'vendor123', 'shopper123'];
    for (const user of userRepo.saved) {
      // passwordHash must not be the raw plaintext password — the exact
      // hashing algorithm is irrelevant here (bcrypt is mocked in tests).
      expect(PLAINTEXT_PASSWORDS).not.toContain(user.passwordHash);
      expect(user.passwordHash.length).toBeGreaterThan(0);
    }
  });
});

// ── Idempotency: already-existing users are not re-encrypted ──────────────────

describe('runSeed — idempotency with existing encrypted users', () => {
  it('skips users that already exist — no duplicate save', async () => {
    const encryption = new EncryptionService();
    const existingUsers: Record<string, any> = {
      admin:   { username: 'admin',   email: encryption.encrypt('admin@petmarket.local'),   id: 'existing-1' },
      vendor:  { username: 'vendor',  email: encryption.encrypt('vendor@petmarket.local'),  id: 'existing-2' },
      shopper: { username: 'shopper', email: encryption.encrypt('shopper@petmarket.local'), id: 'existing-3' },
    };

    const userRepo = makeRepo(existingUsers);
    // Override findOne to return from existingUsers
    userRepo.findOne = jest.fn(({ where }: any) =>
      Promise.resolve(existingUsers[where?.username] ?? null),
    );

    const listingRepo = makeRepo();
    const wordRepo    = makeRepo();
    const creditRepo  = makeRepo();

    // Count > 0 so listing seeding is skipped too
    listingRepo.count = jest.fn(() => Promise.resolve(5));

    const ds = {
      getRepository: jest.fn((entity: any) => {
        switch (entity?.name) {
          case 'User':          return userRepo;
          case 'Listing':       return listingRepo;
          case 'SensitiveWord': return wordRepo;
          case 'CreditScore':   return creditRepo;
          default:              return makeRepo();
        }
      }),
    };

    await runSeed(ds as any);

    // No new users should have been saved (all already exist)
    expect(userRepo.saved.length).toBe(0);
  });
});

// ── EncryptionService contract used by seed ───────────────────────────────────

describe('EncryptionService — contract relied on by seed', () => {
  const enc = new EncryptionService();

  it('encrypt() returns a string starting with "enc:"', () => {
    expect(enc.encrypt('test@example.com')).toMatch(/^enc:/);
  });

  it('two encryptions of the same plaintext produce different ciphertexts (random IV)', () => {
    const a = enc.encrypt('same@example.com');
    const b = enc.encrypt('same@example.com');
    expect(a).not.toBe(b);
  });

  it('idempotency guard: already-encrypted value is not re-encrypted', () => {
    const once = enc.encrypt('x@example.com');
    const twice = enc.encrypt(once);
    expect(twice).toBe(once);
  });

  it('decrypt(encrypt(v)) === v for email values', () => {
    for (const email of ['admin@petmarket.local', 'vendor@petmarket.local', 'shopper@petmarket.local']) {
      expect(enc.decrypt(enc.encrypt(email))).toBe(email);
    }
  });
});
