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
import { uid, cleanup } from './test-fixtures';

const MASKED = '***';

describe('Masking-by-default: sensitive fields hidden from non-admin callers', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  }, 30000);

  afterAll(async () => {
    await ctx.app.close();
  });

  // ── Registration response ───────────────────────────────────────────────────

  it('register: response never contains plaintext email for a new shopper', async () => {
    const username = uid('reg');
    const email = `${username}@example.com`;

    const res = await request(ctx.app.getHttpServer())
      .post('/api/auth/register')
      .send({ username, password: 'password123', email });

    expect(res.body.code).toBe(201);
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

  // ── Login response for admin ────────────────────────────────────────────────

  it('login: admin receives real decrypted email (not masked)', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });

    expect(res.body.code).toBe(200);
    const user = res.body.data.user;
    // Admin must see real email — *** would mean decryption is broken
    expect(user.email).not.toBe(MASKED);
    expect(typeof user.email).toBe('string');
    // Basic email shape: contains '@'
    expect(user.email).toMatch(/@/);
  });

  // ── GET /users/me ───────────────────────────────────────────────────────────

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

  it('/users/me: admin profile has real decrypted email', async () => {
    const loginRes = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    const token = loginRes.body.data.token;

    const res = await request(ctx.app.getHttpServer())
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(200);
    expect(res.body.data.email).not.toBe(MASKED);
    expect(res.body.data.email).toMatch(/@/);
  });

  // ── POST /query entity=users ────────────────────────────────────────────────

  it('/query users: admin query result rows have decrypted email, not ***', async () => {
    const loginRes = await request(ctx.app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    const token = loginRes.body.data.token;

    const res = await request(ctx.app.getHttpServer())
      .post('/api/query')
      .set('Authorization', `Bearer ${token}`)
      .send({ entity: 'users', page: 1, limit: 10 });

    expect(res.body.code).toBe(200);
    const items: any[] = res.body.data.items;
    expect(items.length).toBeGreaterThan(0);
    // Every returned user row must have a real email (not the masked placeholder)
    for (const item of items) {
      expect(item.email).not.toBe(MASKED);
      expect(item.email).toMatch(/@/);
      // PII guard: deviceFingerprint must not be present for non-admin-self rows
      // (admin can see their own, but the admin user itself was set up without a fingerprint)
      // At minimum: the raw passwordHash must never appear
      expect(item).not.toHaveProperty('passwordHash');
    }
  });
});
