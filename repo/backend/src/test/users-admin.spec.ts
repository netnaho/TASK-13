/**
 * users-admin.spec.ts
 *
 * Closes coverage gaps for the users admin HTTP endpoints.
 *
 * Endpoints covered:
 *   GET   /api/users              (admin-only paginated user list)
 *   PATCH /api/users/:id/role     (admin-only role promotion)
 *   PATCH /api/users/:id/active   (admin-only activation toggle)
 *
 * Negative cases:
 *   - Non-admin cannot list users → 403.
 *   - Non-admin cannot change role → 403.
 *   - Non-admin cannot toggle active → 403.
 *   - Invalid role string → 400 (ValidationPipe).
 */
import request from 'supertest';
import { createTestApp, makeToken, TestContext } from './test-utils';
import { User, UserRole } from '../database/entities/user.entity';
import { createTestUser, cleanup, uid } from './test-fixtures';

describe('Users admin HTTP success paths', () => {
  let ctx: TestContext;
  let adminUser: User;
  let targetUser: User;
  let vendorUser: User;

  beforeAll(async () => {
    ctx = await createTestApp();
    adminUser  = await createTestUser(ctx.dataSource, 'admin');
    targetUser = await createTestUser(ctx.dataSource, 'shopper');
    vendorUser = await createTestUser(ctx.dataSource, 'vendor');
  }, 30000);

  afterAll(async () => {
    await cleanup(ctx.dataSource, User, adminUser?.id, targetUser?.id, vendorUser?.id);
    await ctx.app.close();
  });

  // ── GET /users — admin list ────────────────────────────────────────────────

  it('GET /api/users — admin receives paginated user list (200)', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(200);
    // Service returns { items: UserView[], total: number }
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(typeof res.body.data.total).toBe('number');
    expect(res.body.data.total).toBeGreaterThan(0);
    // UserView never exposes passwordHash
    const hasPasswordHash = (res.body.data.items as Array<Record<string, unknown>>).some(
      (u) => 'passwordHash' in u,
    );
    expect(hasPasswordHash).toBe(false);
  });

  it('GET /api/users — vendor role → 403', async () => {
    const token = makeToken(ctx.jwtService, vendorUser.id, 'vendor', vendorUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.code).toBe(403);
  });

  it('GET /api/users — unauthenticated → 401', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/users');
    expect(res.body.code).toBe(401);
  });

  it('GET /api/users — pagination params are accepted (200)', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get('/api/users?page=1&limit=5')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  // ── PATCH /users/:id/role ──────────────────────────────────────────────────

  it('PATCH /api/users/:id/role — admin promotes shopper to ops_reviewer (200)', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/users/${targetUser.id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: UserRole.OPS_REVIEWER });

    expect(res.body.code).toBe(200);
    expect(res.body.data.role).toBe(UserRole.OPS_REVIEWER);
    expect(res.body.data.id).toBe(targetUser.id);
  });

  it('PATCH /api/users/:id/role — admin restores shopper role (200)', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/users/${targetUser.id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: UserRole.SHOPPER });

    expect(res.body.code).toBe(200);
    expect(res.body.data.role).toBe(UserRole.SHOPPER);
  });

  it('PATCH /api/users/:id/role — non-admin → 403', async () => {
    const token = makeToken(ctx.jwtService, vendorUser.id, 'vendor', vendorUser.username);
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/users/${targetUser.id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: UserRole.ADMIN });
    expect(res.body.code).toBe(403);
  });

  it('PATCH /api/users/:id/role — invalid role string → 400', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/users/${targetUser.id}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'superuser' });
    expect(res.body.code).toBe(400);
  });

  // ── PATCH /users/:id/active ────────────────────────────────────────────────

  it('PATCH /api/users/:id/active — admin deactivates user (200, isActive=false)', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/users/${targetUser.id}/active`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false });

    expect(res.body.code).toBe(200);
    expect(res.body.data.isActive).toBe(false);
    expect(res.body.data.id).toBe(targetUser.id);
  });

  it('PATCH /api/users/:id/active — admin reactivates user (200, isActive=true)', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/users/${targetUser.id}/active`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: true });

    expect(res.body.code).toBe(200);
    expect(res.body.data.isActive).toBe(true);
  });

  it('PATCH /api/users/:id/active — non-admin → 403', async () => {
    const token = makeToken(ctx.jwtService, vendorUser.id, 'vendor', vendorUser.username);
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/users/${targetUser.id}/active`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false });
    expect(res.body.code).toBe(403);
  });

  it('PATCH /api/users/:id/active — unauthenticated → 401', async () => {
    const res = await request(ctx.app.getHttpServer())
      .patch(`/api/users/${targetUser.id}/active`)
      .send({ isActive: false });
    expect(res.body.code).toBe(401);
  });
});
