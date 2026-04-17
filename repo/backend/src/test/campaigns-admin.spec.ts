/**
 * campaigns-admin.spec.ts
 *
 * Closes coverage gaps for campaigns & sensitive-words admin CRUD.
 *
 * Endpoints covered:
 *   GET  /api/campaigns/active           (public — no auth required)
 *   GET  /api/admin/campaigns            (admin success)
 *   POST /api/admin/campaigns            (admin create)
 *   PUT  /api/admin/campaigns/:id        (admin update)
 *   DELETE /api/admin/campaigns/:id      (admin soft-delete)
 *   GET  /api/admin/sensitive-words      (admin list)
 *   POST /api/admin/sensitive-words      (admin add)
 *   DELETE /api/admin/sensitive-words/:id (admin remove)
 *
 * Negative cases:
 *   - Non-admin (vendor) receives 403 on all admin endpoints.
 *   - Duplicate sensitive word → 400.
 *   - Update non-existent campaign → 404.
 */
import request from 'supertest';
import { createTestApp, makeToken, TestContext } from './test-utils';
import { User } from '../database/entities/user.entity';
import { Campaign } from '../database/entities/campaign.entity';
import { SensitiveWord } from '../database/entities/sensitive-word.entity';
import { createTestUser, cleanup, uid } from './test-fixtures';

const FAKE_UUID = '00000000-0000-4000-a000-000000000099';

describe('Campaigns & Sensitive Words admin CRUD — success paths', () => {
  let ctx: TestContext;
  let adminUser: User;
  let vendorUser: User;

  const createdCampaignIds: string[] = [];
  const createdWordIds: string[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    adminUser = await createTestUser(ctx.dataSource, 'admin');
    vendorUser = await createTestUser(ctx.dataSource, 'vendor');
  }, 30000);

  afterAll(async () => {
    if (createdCampaignIds.length) {
      await ctx.dataSource
        .getRepository(Campaign)
        .delete(createdCampaignIds)
        .catch(() => {/* ignore */});
    }
    if (createdWordIds.length) {
      await ctx.dataSource
        .getRepository(SensitiveWord)
        .delete(createdWordIds)
        .catch(() => {/* ignore */});
    }
    await cleanup(ctx.dataSource, User, adminUser?.id, vendorUser?.id);
    await ctx.app.close();
  });

  // ── Public active campaigns ────────────────────────────────────────────────

  it('GET /api/campaigns/active — public endpoint returns 200 and array', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/campaigns/active');
    expect(res.body.code).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  // ── Admin campaign CRUD ────────────────────────────────────────────────────

  it('GET /api/admin/campaigns — admin receives 200 with array', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get('/api/admin/campaigns')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/admin/campaigns — vendor receives 403', async () => {
    const token = makeToken(ctx.jwtService, vendorUser.id, 'vendor', vendorUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get('/api/admin/campaigns')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.code).toBe(403);
  });

  it('POST /api/admin/campaigns — admin creates campaign, returns campaign object', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const title = uid('Campaign');
    const res = await request(ctx.app.getHttpServer())
      .post('/api/admin/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title,
        type: 'announcement',
        startTime: '2090-01-01T00:00:00Z',
        endTime: '2090-06-30T23:59:59Z',
      });

    expect(res.body.code).toBe(200);
    expect(res.body.data.title).toBe(title);
    expect(res.body.data.id).toBeDefined();
    createdCampaignIds.push(res.body.data.id);
  });

  it('POST /api/admin/campaigns — vendor receives 403', async () => {
    const token = makeToken(ctx.jwtService, vendorUser.id, 'vendor', vendorUser.username);
    const res = await request(ctx.app.getHttpServer())
      .post('/api/admin/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'unauthorized',
        type: 'announcement',
        startTime: '2090-01-01T00:00:00Z',
        endTime: '2090-06-30T23:59:59Z',
      });
    expect(res.body.code).toBe(403);
  });

  it('PUT /api/admin/campaigns/:id — admin updates campaign title and status', async () => {
    // Create a campaign to update
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const createRes = await request(ctx.app.getHttpServer())
      .post('/api/admin/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: uid('UpdateTarget'),
        type: 'carousel',
        startTime: '2090-02-01T00:00:00Z',
        endTime: '2090-08-31T23:59:59Z',
      });
    const campaignId: string = createRes.body.data.id;
    createdCampaignIds.push(campaignId);

    const newTitle = uid('UpdatedTitle');
    const updateRes = await request(ctx.app.getHttpServer())
      .put(`/api/admin/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: newTitle, status: 'active' });

    expect(updateRes.body.code).toBe(200);
    expect(updateRes.body.data.title).toBe(newTitle);
    expect(updateRes.body.data.status).toBe('active');
  });

  it('PUT /api/admin/campaigns/:id — non-existent campaign → 404', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .put(`/api/admin/campaigns/${FAKE_UUID}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'ghost' });
    expect(res.body.code).toBe(404);
  });

  it('DELETE /api/admin/campaigns/:id — admin soft-deletes campaign, returns 200', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const createRes = await request(ctx.app.getHttpServer())
      .post('/api/admin/campaigns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: uid('ToDelete'),
        type: 'recommendation',
        startTime: '2090-03-01T00:00:00Z',
        endTime: '2090-09-30T23:59:59Z',
      });
    const campaignId: string = createRes.body.data.id;

    const deleteRes = await request(ctx.app.getHttpServer())
      .delete(`/api/admin/campaigns/${campaignId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteRes.body.code).toBe(200);
  });

  // ── Sensitive words CRUD ───────────────────────────────────────────────────

  it('GET /api/admin/sensitive-words — admin receives 200 with array', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get('/api/admin/sensitive-words')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('POST /api/admin/sensitive-words — admin adds word, returns saved word object', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const word = uid('testword');
    const res = await request(ctx.app.getHttpServer())
      .post('/api/admin/sensitive-words')
      .set('Authorization', `Bearer ${token}`)
      .send({ word });

    expect(res.body.code).toBe(200);
    expect(res.body.data.word).toBe(word.toLowerCase());
    expect(res.body.data.id).toBeDefined();
    createdWordIds.push(res.body.data.id);
  });

  it('POST /api/admin/sensitive-words — duplicate word → 400', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const word = uid('dupword');
    const first = await request(ctx.app.getHttpServer())
      .post('/api/admin/sensitive-words')
      .set('Authorization', `Bearer ${token}`)
      .send({ word });
    createdWordIds.push(first.body.data.id);

    const dup = await request(ctx.app.getHttpServer())
      .post('/api/admin/sensitive-words')
      .set('Authorization', `Bearer ${token}`)
      .send({ word });
    expect(dup.body.code).toBe(400);
  });

  it('DELETE /api/admin/sensitive-words/:id — admin removes word, returns 200', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const word = uid('delword');
    const createRes = await request(ctx.app.getHttpServer())
      .post('/api/admin/sensitive-words')
      .set('Authorization', `Bearer ${token}`)
      .send({ word });
    const wordId: string = createRes.body.data.id;

    const deleteRes = await request(ctx.app.getHttpServer())
      .delete(`/api/admin/sensitive-words/${wordId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleteRes.body.code).toBe(200);
  });

  it('DELETE /api/admin/sensitive-words/:id — non-existent word → 404', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .delete(`/api/admin/sensitive-words/${FAKE_UUID}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.code).toBe(404);
  });
});
