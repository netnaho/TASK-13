/**
 * protected-routes-401.spec.ts
 *
 * Gap closed: the existing suite had no 401 coverage outside of voice-access.spec.ts.
 * Every other module's protected endpoints were untested for unauthenticated and
 * invalid-token scenarios.
 *
 * Scenario matrix (no DB fixtures required — auth guards fire before service logic):
 *
 *   A. No Authorization header             → 401  (all protected modules)
 *   B. Malformed / invalid JWT             → 401  (all protected modules)
 *   C. Well-formed JWT with wrong signature → 401  (all protected modules)
 *   D. Correct JWT but wrong role          → 403  (admin-only + role-restricted endpoints)
 *
 * The FAKE_UUID is a syntactically valid UUID that matches no real record.
 * Route params must be UUID-shaped for ParseUUIDPipe to pass; without a token the
 * UUID is never reached by the service, so no DB row is required.
 *
 * Risk closed:
 *   - Confirms JwtAuthGuard is wired on every module (not accidentally removed).
 *   - Confirms tampered-signature JWTs are rejected (not just malformed strings).
 *   - Confirms RolesGuard rejects callers with insufficient roles before any DB I/O.
 *   - Catches future accidental public annotation of currently-protected routes.
 */

import request from 'supertest';
import { createTestApp, makeToken, TestContext } from './test-utils';

const FAKE_UUID = '00000000-0000-4000-a000-000000000001';
const INVALID_TOKEN = 'Bearer totally.invalid.jwt';

// A syntactically valid JWT (header.payload.signature) but signed with the wrong key.
// JwtAuthGuard must reject it even though the structure is well-formed.
const TAMPERED_TOKEN =
  'Bearer eyJhbGciOiJIUzI1NiJ9' +
  '.eyJzdWIiOiJ0ZXN0Iiwicm9sZSI6InNob3BwZXIiLCJ1c2VybmFtZSI6InRlc3QifQ' +
  '.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/** Shared token for role-mismatch (403) tests — signed but wrong role. */
let shopperToken: string;
let vendorToken: string;

describe('Protected routes: missing / invalid token → 401', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    shopperToken = makeToken(ctx.jwtService, FAKE_UUID, 'shopper', 'test_shopper');
    vendorToken  = makeToken(ctx.jwtService, FAKE_UUID, 'vendor',  'test_vendor');
  }, 30000);

  afterAll(async () => {
    await ctx.app.close();
  });

  // ── helpers ───────────────────────────────────────────────────────────────

  /**
   * Asserts that a protected endpoint returns 401 for missing/invalid tokens.
   * Also validates the full error envelope: code, msg (string), timestamp (ISO string).
   */
  async function expectUnauthenticated(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    path: string,
  ): Promise<void> {
    // (a) no token
    const noToken = await (request(ctx.app.getHttpServer()) as any)[method](path);
    expect(noToken.body.code).toBe(401);
    expect(typeof noToken.body.msg).toBe('string');
    expect(noToken.body.msg.length).toBeGreaterThan(0);
    expect(noToken.body.timestamp).toBeDefined();

    // (b) malformed token (not a valid JWT shape)
    const badToken = await (request(ctx.app.getHttpServer()) as any)[method](path)
      .set('Authorization', INVALID_TOKEN);
    expect(badToken.body.code).toBe(401);
    expect(typeof badToken.body.msg).toBe('string');

    // (c) well-formed JWT with a tampered/wrong signature
    const tamperedToken = await (request(ctx.app.getHttpServer()) as any)[method](path)
      .set('Authorization', TAMPERED_TOKEN);
    expect(tamperedToken.body.code).toBe(401);
    expect(typeof tamperedToken.body.msg).toBe('string');
  }

  /**
   * Asserts that a correctly-authenticated but wrong-role request returns 403
   * with a complete error envelope.
   */
  async function expectForbidden(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    path: string,
    token: string,
    body?: Record<string, unknown>,
  ): Promise<void> {
    let req = (request(ctx.app.getHttpServer()) as any)[method](path)
      .set('Authorization', `Bearer ${token}`);
    if (body) req = req.send(body);
    const res = await req;
    expect(res.body.code).toBe(403);
    expect(typeof res.body.msg).toBe('string');
    expect(res.body.msg.length).toBeGreaterThan(0);
    expect(res.body.timestamp).toBeDefined();
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  it('GET /users/me — no token or invalid token → 401', async () => {
    await expectUnauthenticated('get', '/api/users/me');
  });

  it('GET /users — no token or invalid token → 401', async () => {
    await expectUnauthenticated('get', '/api/users');
  });

  it('PATCH /users/:id/role — no token or invalid token → 401', async () => {
    await expectUnauthenticated('patch', `/api/users/${FAKE_UUID}/role`);
  });

  it('PATCH /users/:id/active — no token or invalid token → 401', async () => {
    await expectUnauthenticated('patch', `/api/users/${FAKE_UUID}/active`);
  });

  // ── Settlements ───────────────────────────────────────────────────────────

  it('GET /settlements — no token or invalid token → 401', async () => {
    await expectUnauthenticated('get', '/api/settlements');
  });

  it('GET /settlements/:id — no token or invalid token → 401', async () => {
    await expectUnauthenticated('get', `/api/settlements/${FAKE_UUID}`);
  });

  it('POST /settlements/generate-monthly — no token or invalid token → 401', async () => {
    await expectUnauthenticated('post', '/api/settlements/generate-monthly');
  });

  it('POST /settlements/freight/calculate — no token or invalid token → 401', async () => {
    await expectUnauthenticated('post', '/api/settlements/freight/calculate');
  });

  it('POST /settlements/:id/approve-step1 — no token or invalid token → 401', async () => {
    await expectUnauthenticated('post', `/api/settlements/${FAKE_UUID}/approve-step1`);
  });

  it('POST /settlements/:id/approve-step2 — no token or invalid token → 401', async () => {
    await expectUnauthenticated('post', `/api/settlements/${FAKE_UUID}/approve-step2`);
  });

  it('POST /settlements/:id/reject — no token or invalid token → 401', async () => {
    await expectUnauthenticated('post', `/api/settlements/${FAKE_UUID}/reject`);
  });

  // ── Conversations ─────────────────────────────────────────────────────────

  it('GET /conversations — no token or invalid token → 401', async () => {
    await expectUnauthenticated('get', '/api/conversations');
  });

  it('GET /conversations/:id — no token or invalid token → 401', async () => {
    await expectUnauthenticated('get', `/api/conversations/${FAKE_UUID}`);
  });

  it('POST /conversations/:id/messages — no token or invalid token → 401', async () => {
    await expectUnauthenticated('post', `/api/conversations/${FAKE_UUID}/messages`);
  });

  it('POST /conversations/:id/archive — no token or invalid token → 401', async () => {
    await expectUnauthenticated('post', `/api/conversations/${FAKE_UUID}/archive`);
  });

  it('GET /conversations/voice/:fileName — no token or invalid token → 401', async () => {
    await expectUnauthenticated('get', '/api/conversations/voice/somefile.ogg');
  });

  // ── Credits ───────────────────────────────────────────────────────────────

  it('GET /credits/me — no token or invalid token → 401', async () => {
    await expectUnauthenticated('get', '/api/credits/me');
  });

  it('GET /credits/:userId — no token or invalid token → 401', async () => {
    await expectUnauthenticated('get', `/api/credits/${FAKE_UUID}`);
  });

  it('POST /credits/compute/:userId — no token or invalid token → 401', async () => {
    await expectUnauthenticated('post', `/api/credits/compute/${FAKE_UUID}`);
  });

  // ── Audit ────────────────────────────────────────────────────────────────

  it('GET /admin/audit — no token or invalid token → 401', async () => {
    await expectUnauthenticated('get', '/api/admin/audit');
  });

  it('GET /admin/audit/:id/verify — no token or invalid token → 401', async () => {
    await expectUnauthenticated('get', `/api/admin/audit/${FAKE_UUID}/verify`);
  });

  // ── Exports ───────────────────────────────────────────────────────────────

  it('POST /exports/jobs — no token or invalid token → 401', async () => {
    await expectUnauthenticated('post', '/api/exports/jobs');
  });

  it('GET /exports/jobs — no token or invalid token → 401', async () => {
    await expectUnauthenticated('get', '/api/exports/jobs');
  });

  it('GET /exports/jobs/:id — no token or invalid token → 401', async () => {
    await expectUnauthenticated('get', `/api/exports/jobs/${FAKE_UUID}`);
  });

  it('GET /exports/jobs/:id/download — no token or invalid token → 401', async () => {
    await expectUnauthenticated('get', `/api/exports/jobs/${FAKE_UUID}/download`);
  });

  // ── Query ────────────────────────────────────────────────────────────────

  it('POST /query — no token or invalid token → 401', async () => {
    await expectUnauthenticated('post', '/api/query');
  });

  it('GET /query/saved — no token or invalid token → 401', async () => {
    await expectUnauthenticated('get', '/api/query/saved');
  });

  it('POST /query/save — no token or invalid token → 401', async () => {
    await expectUnauthenticated('post', '/api/query/save');
  });

  it('DELETE /query/saved/:id — no token or invalid token → 401', async () => {
    await expectUnauthenticated('delete', `/api/query/saved/${FAKE_UUID}`);
  });

  // ── Listings (write operations require authentication) ──────────────────────

  it('POST /listings — no token or invalid token → 401', async () => {
    await expectUnauthenticated('post', '/api/listings');
  });

  it('PUT /listings/:id — no token or invalid token → 401', async () => {
    await expectUnauthenticated('put', `/api/listings/${FAKE_UUID}`);
  });

  it('DELETE /listings/:id — no token or invalid token → 401', async () => {
    await expectUnauthenticated('delete', `/api/listings/${FAKE_UUID}`);
  });

  // ── Admin Campaigns ───────────────────────────────────────────────────────

  it('GET /admin/campaigns — no token or invalid token → 401', async () => {
    await expectUnauthenticated('get', '/api/admin/campaigns');
  });

  it('POST /admin/campaigns — no token or invalid token → 401', async () => {
    await expectUnauthenticated('post', '/api/admin/campaigns');
  });

  it('PUT /admin/campaigns/:id — no token or invalid token → 401', async () => {
    await expectUnauthenticated('put', `/api/admin/campaigns/${FAKE_UUID}`);
  });

  it('DELETE /admin/campaigns/:id — no token or invalid token → 401', async () => {
    await expectUnauthenticated('delete', `/api/admin/campaigns/${FAKE_UUID}`);
  });

  // ── Admin Sensitive Words ─────────────────────────────────────────────────

  it('GET /admin/sensitive-words — no token or invalid token → 401', async () => {
    await expectUnauthenticated('get', '/api/admin/sensitive-words');
  });

  it('POST /admin/sensitive-words — no token or invalid token → 401', async () => {
    await expectUnauthenticated('post', '/api/admin/sensitive-words');
  });

  it('DELETE /admin/sensitive-words/:id — no token or invalid token → 401', async () => {
    await expectUnauthenticated('delete', `/api/admin/sensitive-words/${FAKE_UUID}`);
  });

  // ── Audit (simple read endpoint) ──────────────────────────────────────────

  it('GET /audit — no token or invalid token → 401', async () => {
    await expectUnauthenticated('get', '/api/audit');
  });

  // ── Audit admin extras ────────────────────────────────────────────────────

  it('POST /admin/audit/retention — no token or invalid token → 401', async () => {
    await expectUnauthenticated('post', '/api/admin/audit/retention');
  });

  it('POST /admin/audit/export — no token or invalid token → 401', async () => {
    await expectUnauthenticated('post', '/api/admin/audit/export');
  });

  // ── Conversations: canned responses + voice upload ────────────────────────

  it('GET /conversations/canned-responses — no token or invalid token → 401', async () => {
    await expectUnauthenticated('get', '/api/conversations/canned-responses');
  });

  it('POST /conversations/:id/voice — no token or invalid token → 401', async () => {
    await expectUnauthenticated('post', `/api/conversations/${FAKE_UUID}/voice`);
  });

  // ── Admin canned responses ────────────────────────────────────────────────

  it('POST /admin/canned-responses — no token or invalid token → 401', async () => {
    await expectUnauthenticated('post', '/api/admin/canned-responses');
  });

  // ── Settlements export ────────────────────────────────────────────────────

  it('GET /settlements/export/:id — no token or invalid token → 401', async () => {
    await expectUnauthenticated('get', `/api/settlements/export/${FAKE_UUID}`);
  });
});

// ── Role mismatch → 403 ────────────────────────────────────────────────────────
//
// These tests use a correctly-signed token but with a role that is not permitted
// by the endpoint's @Roles() decorator.  The auth guard succeeds but the roles
// guard returns 403 before any service or database call.

describe('Protected routes: authenticated but wrong role → 403', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    shopperToken = makeToken(ctx.jwtService, FAKE_UUID, 'shopper', 'test_shopper_role');
    vendorToken  = makeToken(ctx.jwtService, FAKE_UUID, 'vendor',  'test_vendor_role');
  }, 30000);

  afterAll(async () => {
    await ctx.app.close();
  });

  // Admin-only routes — shopper and vendor should both get 403

  it('GET /users — shopper → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${shopperToken}`);
    expect(res.body.code).toBe(403);
  });

  it('PATCH /users/:id/role — shopper → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/users/${FAKE_UUID}/role`)
      .set('Authorization', `Bearer ${shopperToken}`)
      .send({ role: 'vendor' });
    expect(res.body.code).toBe(403);
  });

  it('PATCH /users/:id/active — vendor → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/users/${FAKE_UUID}/active`)
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ isActive: false });
    expect(res.body.code).toBe(403);
  });

  it('POST /settlements/generate-monthly — shopper → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/settlements/generate-monthly')
      .set('Authorization', `Bearer ${shopperToken}`)
      .send({ month: '2099-01' });
    expect(res.body.code).toBe(403);
  });

  it('POST /settlements/generate-monthly — vendor → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/settlements/generate-monthly')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ month: '2099-01' });
    expect(res.body.code).toBe(403);
  });

  it('POST /settlements/:id/approve-step1 — vendor (not ops_reviewer) → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/settlements/${FAKE_UUID}/approve-step1`)
      .set('Authorization', `Bearer ${vendorToken}`);
    expect(res.body.code).toBe(403);
  });

  it('POST /settlements/:id/approve-step2 — shopper (not finance_admin) → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/settlements/${FAKE_UUID}/approve-step2`)
      .set('Authorization', `Bearer ${shopperToken}`);
    expect(res.body.code).toBe(403);
  });

  // Shopper is NOT in the allowed roles for settlements entirely
  it('GET /settlements — shopper → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/settlements')
      .set('Authorization', `Bearer ${shopperToken}`);
    expect(res.body.code).toBe(403);
  });

  it('POST /credits/compute/:userId — shopper → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/credits/compute/${FAKE_UUID}`)
      .set('Authorization', `Bearer ${shopperToken}`);
    expect(res.body.code).toBe(403);
  });

  it('POST /credits/compute/:userId — vendor → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/credits/compute/${FAKE_UUID}`)
      .set('Authorization', `Bearer ${vendorToken}`);
    expect(res.body.code).toBe(403);
  });

  it('GET /admin/audit — shopper → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/admin/audit')
      .set('Authorization', `Bearer ${shopperToken}`);
    expect(res.body.code).toBe(403);
  });

  it('GET /admin/audit — vendor → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/admin/audit')
      .set('Authorization', `Bearer ${vendorToken}`);
    expect(res.body.code).toBe(403);
  });

  it('GET /admin/audit/:id/verify — shopper → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/admin/audit/${FAKE_UUID}/verify`)
      .set('Authorization', `Bearer ${shopperToken}`);
    expect(res.body.code).toBe(403);
  });

  it('POST /query — shopper → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/query')
      .set('Authorization', `Bearer ${shopperToken}`)
      .send({ entity: 'listings', page: 1, limit: 10 });
    expect(res.body.code).toBe(403);
  });

  it('POST /query — vendor querying restricted entity (users) → 403', async () => {
    // Vendors may query their own listings (200) but are forbidden from querying
    // cross-tenant entities like users and conversations.
    const res = await request(ctx.app.getHttpServer())
      .post('/api/query')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ entity: 'users', page: 1, limit: 10 });
    expect(res.body.code).toBe(403);
  });

  // Shopper is excluded from exports
  it('POST /exports/jobs — shopper → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/exports/jobs')
      .set('Authorization', `Bearer ${shopperToken}`)
      .send({ type: 'listings' });
    expect(res.body.code).toBe(403);
  });

  it('GET /exports/jobs — shopper → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/exports/jobs')
      .set('Authorization', `Bearer ${shopperToken}`);
    expect(res.body.code).toBe(403);
  });

  // Listings: shopper cannot create/update/delete (vendor/admin only)
  it('POST /listings — shopper → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/listings')
      .set('Authorization', `Bearer ${shopperToken}`)
      .send({ title: 'x', price: 1, category: 'dog' });
    expect(res.body.code).toBe(403);
  });

  it('DELETE /listings/:id — shopper → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .delete(`/api/listings/${FAKE_UUID}`)
      .set('Authorization', `Bearer ${shopperToken}`);
    expect(res.body.code).toBe(403);
  });

  // Admin campaigns: shopper and vendor are both excluded
  it('GET /admin/campaigns — shopper → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/admin/campaigns')
      .set('Authorization', `Bearer ${shopperToken}`);
    expect(res.body.code).toBe(403);
  });

  it('GET /admin/campaigns — vendor → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/admin/campaigns')
      .set('Authorization', `Bearer ${vendorToken}`);
    expect(res.body.code).toBe(403);
  });

  it('POST /admin/campaigns — shopper → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/admin/campaigns')
      .set('Authorization', `Bearer ${shopperToken}`)
      .send({ name: 'test' });
    expect(res.body.code).toBe(403);
  });

  // Admin sensitive words: shopper and vendor are both excluded
  it('GET /admin/sensitive-words — shopper → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/admin/sensitive-words')
      .set('Authorization', `Bearer ${shopperToken}`);
    expect(res.body.code).toBe(403);
  });

  it('GET /admin/sensitive-words — vendor → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/admin/sensitive-words')
      .set('Authorization', `Bearer ${vendorToken}`);
    expect(res.body.code).toBe(403);
  });

  // Audit: shopper and vendor are both excluded
  it('GET /audit — shopper → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/audit')
      .set('Authorization', `Bearer ${shopperToken}`);
    expect(res.body.code).toBe(403);
  });

  it('GET /audit — vendor → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/audit')
      .set('Authorization', `Bearer ${vendorToken}`);
    expect(res.body.code).toBe(403);
  });

  it('POST /admin/audit/retention — shopper → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/admin/audit/retention')
      .set('Authorization', `Bearer ${shopperToken}`);
    expect(res.body.code).toBe(403);
  });

  it('POST /admin/audit/export — shopper → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/admin/audit/export')
      .set('Authorization', `Bearer ${shopperToken}`);
    expect(res.body.code).toBe(403);
  });

  // Query save/delete: shopper excluded (vendor/admin only)
  it('POST /query/save — shopper → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/query/save')
      .set('Authorization', `Bearer ${shopperToken}`)
      .send({ name: 'q', entity: 'listings', page: 1, limit: 10 });
    expect(res.body.code).toBe(403);
  });

  it('DELETE /query/saved/:id — shopper → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .delete(`/api/query/saved/${FAKE_UUID}`)
      .set('Authorization', `Bearer ${shopperToken}`);
    expect(res.body.code).toBe(403);
  });

  // Admin canned responses: shopper and vendor excluded
  it('POST /admin/canned-responses — shopper → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/admin/canned-responses')
      .set('Authorization', `Bearer ${shopperToken}`)
      .send({ title: 'hi', body: 'hello' });
    expect(res.body.code).toBe(403);
  });

  it('POST /admin/canned-responses — vendor → 403', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/admin/canned-responses')
      .set('Authorization', `Bearer ${vendorToken}`)
      .send({ title: 'hi', body: 'hello' });
    expect(res.body.code).toBe(403);
  });
});

// ── Response envelope observability ──────────────────────────────────────────
// These tests verify that 401/403 responses carry a complete, useful error
// envelope — not just a status code — across representative endpoints.

describe('Response envelope: 401/403 have complete code+msg+timestamp body', () => {
  let ctx2: TestContext;
  let shopperTok: string;
  let vendorTok: string;

  beforeAll(async () => {
    ctx2 = await createTestApp();
    shopperTok = makeToken(ctx2.jwtService, FAKE_UUID, 'shopper', 'obs_shopper');
    vendorTok  = makeToken(ctx2.jwtService, FAKE_UUID, 'vendor',  'obs_vendor');
  }, 30000);

  afterAll(async () => {
    await ctx2.app.close();
  });

  it('GET /api/users/me — no auth → envelope has code=401, msg, timestamp', async () => {
    const res = await request(ctx2.app.getHttpServer()).get('/api/users/me');
    expect(res.body).toMatchObject({
      code: 401,
      msg: expect.any(String),
      timestamp: expect.any(String),
    });
    expect(res.body.msg.length).toBeGreaterThan(0);
    expect(new Date(res.body.timestamp).getTime()).not.toBeNaN();
  });

  it('GET /api/admin/campaigns — vendor auth → envelope has code=403, msg, timestamp', async () => {
    const res = await request(ctx2.app.getHttpServer())
      .get('/api/admin/campaigns')
      .set('Authorization', `Bearer ${vendorTok}`);
    expect(res.body).toMatchObject({
      code: 403,
      msg: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('GET /api/admin/audit — shopper auth → envelope has code=403, msg, timestamp', async () => {
    const res = await request(ctx2.app.getHttpServer())
      .get('/api/admin/audit')
      .set('Authorization', `Bearer ${shopperTok}`);
    expect(res.body).toMatchObject({
      code: 403,
      msg: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('POST /api/exports/jobs — shopper auth → envelope has code=403, msg', async () => {
    const res = await request(ctx2.app.getHttpServer())
      .post('/api/exports/jobs')
      .set('Authorization', `Bearer ${shopperTok}`)
      .send({ type: 'listings' });
    expect(res.body).toMatchObject({ code: 403, msg: expect.any(String) });
  });

  it('PATCH /api/users/:id/role — vendor auth → 403 envelope', async () => {
    const res = await request(ctx2.app.getHttpServer())
      .patch(`/api/users/${FAKE_UUID}/role`)
      .set('Authorization', `Bearer ${vendorTok}`)
      .send({ role: 'admin' });
    expect(res.body).toMatchObject({ code: 403, msg: expect.any(String), timestamp: expect.any(String) });
  });

  it('tampered JWT → 401 with msg referencing auth failure (not empty)', async () => {
    const TAMPERED = 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const res = await request(ctx2.app.getHttpServer())
      .get('/api/credits/me')
      .set('Authorization', TAMPERED);
    expect(res.body.code).toBe(401);
    expect(res.body.msg).toMatch(/unauthorized|invalid|token/i);
    expect(res.body.timestamp).toBeDefined();
  });
});
