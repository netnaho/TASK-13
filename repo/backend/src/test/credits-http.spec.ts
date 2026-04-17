/**
 * credits-http.spec.ts
 *
 * Closes coverage gaps for the credits controller success flows.
 *
 * Endpoints covered:
 *   GET  /api/credits/me               (any authenticated user — returns own score)
 *   GET  /api/credits/:userId          (admin sees any; non-admin sees only own)
 *   POST /api/credits/compute/:userId  (admin-only — triggers score computation)
 *
 * Negative cases:
 *   - Unauthenticated GET /credits/me → 401.
 *   - Shopper trying to get another user's score → 403.
 *   - Non-admin POST /credits/compute → 403.
 */
import request from 'supertest';
import { createTestApp, makeToken, TestContext } from './test-utils';
import { User } from '../database/entities/user.entity';
import { CreditScore } from '../database/entities/credit-score.entity';
import { createTestUser, cleanup } from './test-fixtures';

describe('Credits controller — success paths', () => {
  let ctx: TestContext;
  let adminUser: User;
  let vendorUser: User;
  let shopperUser: User;

  beforeAll(async () => {
    ctx = await createTestApp();
    adminUser  = await createTestUser(ctx.dataSource, 'admin');
    vendorUser = await createTestUser(ctx.dataSource, 'vendor');
    shopperUser = await createTestUser(ctx.dataSource, 'shopper');
  }, 30000);

  afterAll(async () => {
    // Credit scores are cascade-deleted when user is deleted
    await cleanup(ctx.dataSource, User, adminUser?.id, vendorUser?.id, shopperUser?.id);
    await ctx.app.close();
  });

  // ── Auth gates ─────────────────────────────────────────────────────────────

  it('GET /api/credits/me — unauthenticated → 401', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/credits/me');
    expect(res.body.code).toBe(401);
  });

  // ── GET /credits/me — success ──────────────────────────────────────────────

  it('GET /api/credits/me — vendor receives own credit score (200)', async () => {
    const token = makeToken(ctx.jwtService, vendorUser.id, 'vendor', vendorUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get('/api/credits/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(200);
    expect(res.body.data.userId).toBe(vendorUser.id);
    // TypeORM returns decimal columns as strings from PostgreSQL
    expect(Number(res.body.data.score)).toBeGreaterThanOrEqual(0);
    expect(Number(res.body.data.score)).toBeLessThanOrEqual(1000);
  });

  it('GET /api/credits/me — shopper receives own credit score (200)', async () => {
    const token = makeToken(ctx.jwtService, shopperUser.id, 'shopper', shopperUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get('/api/credits/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(200);
    expect(res.body.data.userId).toBe(shopperUser.id);
    // TypeORM returns decimal columns as strings from PostgreSQL
    expect(Number(res.body.data.score)).toBeGreaterThanOrEqual(0);
    expect(Number(res.body.data.score)).toBeLessThanOrEqual(1000);
  });

  // ── GET /credits/:userId — access control ──────────────────────────────────

  it('GET /api/credits/:userId — admin can view any user score (200)', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/credits/${vendorUser.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(200);
    expect(res.body.data.userId).toBe(vendorUser.id);
  });

  it('GET /api/credits/:userId — vendor can view own score via :userId path (200)', async () => {
    const token = makeToken(ctx.jwtService, vendorUser.id, 'vendor', vendorUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/credits/${vendorUser.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(200);
    expect(res.body.data.userId).toBe(vendorUser.id);
  });

  it('GET /api/credits/:userId — shopper cannot view another user score → 403', async () => {
    const token = makeToken(ctx.jwtService, shopperUser.id, 'shopper', shopperUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/credits/${vendorUser.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(403);
  });

  // ── POST /credits/compute/:userId — admin success ──────────────────────────

  it('POST /api/credits/compute/:userId — admin triggers score computation (200)', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/credits/compute/${vendorUser.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(200);
    expect(res.body.data.userId).toBe(vendorUser.id);
    // TypeORM returns decimal columns as strings from PostgreSQL
    expect(Number(res.body.data.score)).toBeGreaterThanOrEqual(0);
    expect(Number(res.body.data.score)).toBeLessThanOrEqual(1000);
  });

  it('POST /api/credits/compute/:userId — non-admin (vendor) → 403', async () => {
    const token = makeToken(ctx.jwtService, vendorUser.id, 'vendor', vendorUser.username);
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/credits/compute/${shopperUser.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(403);
  });

  it('POST /api/credits/compute/:userId — admin computes score for shopper (200)', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/credits/compute/${shopperUser.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(200);
    expect(res.body.data.userId).toBe(shopperUser.id);
    expect(Number(res.body.data.score)).toBeGreaterThanOrEqual(0);
    expect(Number(res.body.data.score)).toBeLessThanOrEqual(1000);
  });
});
