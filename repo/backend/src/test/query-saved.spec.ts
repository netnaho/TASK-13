/**
 * query-saved.spec.ts
 *
 * Closes coverage gaps for saved-query business flows.
 *
 * Endpoints covered:
 *   POST   /api/query/save           (save a named query)
 *   GET    /api/query/saved          (list saved queries for current user)
 *   DELETE /api/query/saved/:id      (delete own saved query)
 *
 * Negative cases:
 *   - Shopper role cannot access any query endpoint → 403.
 *   - DELETE query owned by a different user → 403.
 *   - DELETE non-existent query UUID → 404.
 */
import request from 'supertest';
import { createTestApp, makeToken, TestContext } from './test-utils';
import { User } from '../database/entities/user.entity';
import { SavedQuery } from '../database/entities/saved-query.entity';
import { createTestUser, cleanup, uid } from './test-fixtures';

const FAKE_UUID = '00000000-0000-4000-a000-000000000010';

describe('Query saved-queries business flows — success paths', () => {
  let ctx: TestContext;
  let adminUser: User;
  let vendorUser: User;
  let shopperUser: User;

  const savedQueryIds: string[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    adminUser  = await createTestUser(ctx.dataSource, 'admin');
    vendorUser = await createTestUser(ctx.dataSource, 'vendor');
    shopperUser = await createTestUser(ctx.dataSource, 'shopper');
  }, 30000);

  afterAll(async () => {
    if (savedQueryIds.length) {
      await ctx.dataSource
        .getRepository(SavedQuery)
        .delete(savedQueryIds)
        .catch(() => {/* ignore */});
    }
    await cleanup(ctx.dataSource, User, adminUser?.id, vendorUser?.id, shopperUser?.id);
    await ctx.app.close();
  });

  // ── Shopper forbidden ──────────────────────────────────────────────────────

  it('POST /api/query/save — shopper role → 403', async () => {
    const token = makeToken(ctx.jwtService, shopperUser.id, 'shopper', shopperUser.username);
    const res = await request(ctx.app.getHttpServer())
      .post('/api/query/save')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'my-query', params: { entity: 'listings' } });
    expect(res.body.code).toBe(403);
  });

  it('GET /api/query/saved — shopper role → 403', async () => {
    const token = makeToken(ctx.jwtService, shopperUser.id, 'shopper', shopperUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get('/api/query/saved')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.code).toBe(403);
  });

  // ── Vendor success path ────────────────────────────────────────────────────

  it('POST /api/query/save — vendor saves query, returns saved object with id', async () => {
    const token = makeToken(ctx.jwtService, vendorUser.id, 'vendor', vendorUser.username);
    const name = uid('q');
    const res = await request(ctx.app.getHttpServer())
      .post('/api/query/save')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, params: { entity: 'listings', filters: [] } });

    expect(res.body.code).toBe(200);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.name).toBe(name);
    expect(res.body.data.userId).toBe(vendorUser.id);
    savedQueryIds.push(res.body.data.id);
  });

  it('GET /api/query/saved — vendor lists own saved queries', async () => {
    const token = makeToken(ctx.jwtService, vendorUser.id, 'vendor', vendorUser.username);

    // Ensure at least one saved query exists for this user
    const saveRes = await request(ctx.app.getHttpServer())
      .post('/api/query/save')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: uid('ql'), params: { entity: 'conversations' } });
    savedQueryIds.push(saveRes.body.data.id);

    const res = await request(ctx.app.getHttpServer())
      .get('/api/query/saved')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const ids = (res.body.data as Array<{ id: string; userId: string }>).map((q) => q.userId);
    // All returned queries belong to the requesting vendor
    expect(ids.every((uid) => uid === vendorUser.id)).toBe(true);
  });

  it('GET /api/query/saved — admin sees only their own saved queries (tenant isolation)', async () => {
    const adminToken = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const vendorToken = makeToken(ctx.jwtService, vendorUser.id, 'vendor', vendorUser.username);

    // Admin saves one query
    const adminSave = await request(ctx.app.getHttpServer())
      .post('/api/query/save')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: uid('admin-q'), params: { entity: 'users' } });
    savedQueryIds.push(adminSave.body.data.id);

    // Admin's list should not contain vendor's queries
    const adminList = await request(ctx.app.getHttpServer())
      .get('/api/query/saved')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminList.body.code).toBe(200);
    const adminIds = (adminList.body.data as Array<{ userId: string }>).map((q) => q.userId);
    expect(adminIds.every((u) => u === adminUser.id)).toBe(true);

    // Vendor's list should not contain admin's query
    const vendorList = await request(ctx.app.getHttpServer())
      .get('/api/query/saved')
      .set('Authorization', `Bearer ${vendorToken}`);
    const vendorIds = (vendorList.body.data as Array<{ id: string }>).map((q) => q.id);
    expect(vendorIds).not.toContain(adminSave.body.data.id);
  });

  it('DELETE /api/query/saved/:id — vendor deletes own query, returns 200', async () => {
    const token = makeToken(ctx.jwtService, vendorUser.id, 'vendor', vendorUser.username);
    const saveRes = await request(ctx.app.getHttpServer())
      .post('/api/query/save')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: uid('del-q'), params: { entity: 'settlements' } });
    const qid: string = saveRes.body.data.id;

    const deleteRes = await request(ctx.app.getHttpServer())
      .delete(`/api/query/saved/${qid}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteRes.body.code).toBe(200);
  });

  it('DELETE /api/query/saved/:id — non-existent query → 404', async () => {
    const token = makeToken(ctx.jwtService, vendorUser.id, 'vendor', vendorUser.username);
    const res = await request(ctx.app.getHttpServer())
      .delete(`/api/query/saved/${FAKE_UUID}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.code).toBe(404);
  });

  it('DELETE /api/query/saved/:id — vendor cannot delete another user query → 403', async () => {
    // Admin saves a query
    const adminToken = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const adminSave = await request(ctx.app.getHttpServer())
      .post('/api/query/save')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: uid('admin-only'), params: { entity: 'users' } });
    const adminQid: string = adminSave.body.data.id;
    savedQueryIds.push(adminQid);

    // Vendor tries to delete admin's query
    const vendorToken = makeToken(ctx.jwtService, vendorUser.id, 'vendor', vendorUser.username);
    const res = await request(ctx.app.getHttpServer())
      .delete(`/api/query/saved/${adminQid}`)
      .set('Authorization', `Bearer ${vendorToken}`);
    expect(res.body.code).toBe(403);
  });
});
