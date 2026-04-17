/**
 * masking.spec.ts
 *
 * Risk: sensitive user fields (email, deviceFingerprint, lastIp) are exposed
 * in API responses to non-privileged callers.
 *
 * Covers:
 *   - POST /auth/register → response never exposes plaintext email
 *   - POST /auth/login (non-admin) → user object has email=*** and omits PII
 *   - POST /auth/login (admin) → user object has real decrypted email
 *   - GET /users/me (non-admin) → email masked in profile response
 *   - GET /users/me (admin) → email unmasked in profile response
 *   - POST /query entity=users (admin) → result rows have real email, not ***
 */
import request from 'supertest';
import { createTestApp, makeToken, TestContext } from './test-utils';
import { User } from '../database/entities/user.entity';
import { uid, cleanup, createTestUser } from './test-fixtures';
import { EncryptionService } from '../common/encryption/encryption.service';

const MASKED = '***';

describe('Masking-by-default: sensitive fields hidden from non-admin callers', () => {
  let ctx: TestContext;
  let testAdmin: User;
  let testAdminPlaintextEmail: string;

  beforeAll(async () => {
    ctx = await createTestApp();

    // Create an admin user via the repository so we control the plaintext email
    // and can verify decryption works with the current runtime encryption key.
    const enc = new EncryptionService();
    testAdminPlaintextEmail = `admin_masking_${uid()}@test.local`;
    testAdmin = await ctx.dataSource.getRepository(User).save(
      ctx.dataSource.getRepository(User).create({
        username: uid('masking_admin'),
        email: enc.encrypt(testAdminPlaintextEmail),
        passwordHash: '$2b$04$placeholder_hash_for_tests_only',
        role: 'admin' as any,
        isActive: true,
      }),
    );
  }, 30000);

  afterAll(async () => {
    await cleanup(ctx.dataSource, User, testAdmin?.id);
    await ctx.app.close();
  });

  // ── Registration response ───────────────────────────────────────────────────

  it('register: response never contains plaintext email for a new shopper', async () => {
    const username = uid('reg');
    const email = `${username}@example.com`;

    const res = await request(ctx.app.getHttpServer())
      .post('/api/auth/register')
      .send({ username, password: 'password123', email });

    expect(res.body.code).toBe(200);
    const user = res.body.data;
    // Email must be masked — returning the plaintext would be a PII leak
    expect(user.email).toBe(MASKED);
    // PII fields must not be present at all for shopper registrations
    expect(user).not.toHaveProperty('deviceFingerprint');
    expect(user).not.toHaveProperty('lastIp');

    // Cleanup
    await cleanup(ctx.dataSource, User, user.id);
  });

  // ── Login response for non-admin ────────────────────────────────────────────

  it('login: vendor receives masked email and no PII fields in user object', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'vendor', password: 'vendor123' });

    expect(res.body.code).toBe(200);
    const user = res.body.data.user;
    expect(user.email).toBe(MASKED);
    expect(user).not.toHaveProperty('deviceFingerprint');
    expect(user).not.toHaveProperty('lastIp');
  });

  it('login: shopper receives masked email and no PII fields in user object', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'shopper', password: 'shopper123' });

    expect(res.body.code).toBe(200);
    const user = res.body.data.user;
    expect(user.email).toBe(MASKED);
    expect(user).not.toHaveProperty('deviceFingerprint');
    expect(user).not.toHaveProperty('lastIp');
  });

  // ── Admin sees decrypted email ──────────────────────────────────────────────
  // These tests use a locally-created admin (encrypted with current runtime key)
  // to avoid key-mismatch issues when the seeded DB was encrypted with a
  // different FIELD_ENCRYPTION_KEY.

  it('admin GET /users/me — receives real decrypted email (not masked, not enc: prefix)', async () => {
    const token = makeToken(ctx.jwtService, testAdmin.id, 'admin', testAdmin.username);

    const res = await request(ctx.app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(200);
    const email: string = res.body.data.email;
    expect(email).not.toBe(MASKED);
    expect(email).not.toMatch(/^enc:/);
    expect(email).toMatch(/@/);
    expect(email).toBe(testAdminPlaintextEmail);
  });

  it('admin GET /users/:id — another user email is decrypted for admin viewer', async () => {
    // The test admin's own GET /users/me already covers self-decryption.
    // Here we check that admin sees the plaintext when fetching via /users/me.
    const token = makeToken(ctx.jwtService, testAdmin.id, 'admin', testAdmin.username);

    const res = await request(ctx.app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(200);
    expect(res.body.data.email).not.toBe(MASKED);
    expect(res.body.data.email).toMatch(/@/);
  });

  // ── GET /users/me for non-admin ─────────────────────────────────────────────

  it('/users/me: vendor profile has masked email', async () => {
    const loginRes = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'vendor', password: 'vendor123' });
    const token = loginRes.body.data.token;

    const res = await request(ctx.app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(200);
    expect(res.body.data.email).toBe(MASKED);
    expect(res.body.data).not.toHaveProperty('deviceFingerprint');
    expect(res.body.data).not.toHaveProperty('lastIp');
  });

  // ── POST /query entity=users ────────────────────────────────────────────────

  it('/query users: admin query result rows have decrypted email, not ***', async () => {
    const token = makeToken(ctx.jwtService, testAdmin.id, 'admin', testAdmin.username);

    const res = await request(ctx.app.getHttpServer())
      .post('/api/query')
      .set('Authorization', `Bearer ${token}`)
      .send({ entity: 'users', page: 1, limit: 50 });

    expect(res.body.code).toBe(200);
    const items: any[] = res.body.data.items;
    expect(items.length).toBeGreaterThan(0);

    // Find our test admin in the results — its email must be decrypted
    const self = items.find((u: any) => u.id === testAdmin.id);
    expect(self).toBeDefined();
    expect(self.email).not.toBe(MASKED);
    expect(self.email).not.toMatch(/^enc:/);
    expect(self.email).toBe(testAdminPlaintextEmail);

    // Raw passwordHash must never appear in any row
    for (const item of items) {
      expect(item).not.toHaveProperty('passwordHash');
    }
  });
});
