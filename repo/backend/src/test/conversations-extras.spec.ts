/**
 * conversations-extras.spec.ts
 *
 * Closes coverage gaps for conversation endpoints that previously had only
 * guard-denial (401/403) coverage.
 *
 * Endpoints covered:
 *   GET  /api/conversations/canned-responses    (authenticated user lists canned responses)
 *   POST /api/conversations/:id/archive          (vendor/admin archives a conversation)
 *   POST /api/conversations/:id/voice            (multipart audio upload success path)
 *   POST /api/admin/canned-responses             (admin creates canned response)
 *
 * Negative cases:
 *   - Shopper cannot archive a conversation → 403.
 *   - Archive non-participant conversation → 403.
 *   - Voice upload with wrong MIME type → 400.
 */
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { createTestApp, makeToken, TestContext } from './test-utils';
import { User } from '../database/entities/user.entity';
import { Listing } from '../database/entities/listing.entity';
import { Conversation } from '../database/entities/conversation.entity';
import { CannedResponse } from '../database/entities/canned-response.entity';
import {
  createTestUser,
  createTestListing,
  createTestConversation,
  cleanupAll,
  uid,
} from './test-fixtures';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'voice');

describe('Conversations — canned-responses, archive, voice upload', () => {
  let ctx: TestContext;
  let adminUser: User;
  let vendorUser: User;
  let shopperUser: User;
  let otherShopper: User;
  let listing: Listing;
  let conversation: Conversation;

  const createdCannedIds: string[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    const ds = ctx.dataSource;

    adminUser    = await createTestUser(ds, 'admin');
    vendorUser   = await createTestUser(ds, 'vendor');
    shopperUser  = await createTestUser(ds, 'shopper');
    otherShopper = await createTestUser(ds, 'shopper');

    listing      = await createTestListing(ds, vendorUser.id);
    conversation = await createTestConversation(ds, listing.id, vendorUser.id, shopperUser.id);

    // Ensure upload directory exists for voice tests
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
  }, 30000);

  afterAll(async () => {
    if (createdCannedIds.length) {
      await ctx.dataSource
        .getRepository(CannedResponse)
        .delete(createdCannedIds)
        .catch(() => {/* ignore */});
    }
    await cleanupAll(ctx.dataSource, [
      { entity: Conversation, ids: [conversation?.id].filter(Boolean) as string[] },
      { entity: Listing,      ids: [listing?.id].filter(Boolean) as string[] },
      { entity: User,         ids: [adminUser?.id, vendorUser?.id, shopperUser?.id, otherShopper?.id].filter(Boolean) as string[] },
    ]);
    await ctx.app.close();
  });

  // ── GET /conversations/canned-responses ────────────────────────────────────

  it('GET /api/conversations/canned-responses — any authenticated user receives 200 + array', async () => {
    const token = makeToken(ctx.jwtService, shopperUser.id, 'shopper', shopperUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get('/api/conversations/canned-responses')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/conversations/canned-responses — unauthenticated → 401', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/conversations/canned-responses');
    expect(res.body.code).toBe(401);
  });

  // ── POST /admin/canned-responses ───────────────────────────────────────────

  it('POST /api/admin/canned-responses — admin creates canned response (200)', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const title = uid('canned');
    const res = await request(ctx.app.getHttpServer())
      .post('/api/admin/canned-responses')
      .set('Authorization', `Bearer ${token}`)
      .send({ title, body: 'Thank you for your interest.' });

    expect(res.body.code).toBe(200);
    expect(res.body.data.title).toBe(title);
    expect(res.body.data.id).toBeDefined();
    createdCannedIds.push(res.body.data.id);
  });

  it('POST /api/admin/canned-responses — non-admin → 403', async () => {
    const token = makeToken(ctx.jwtService, vendorUser.id, 'vendor', vendorUser.username);
    const res = await request(ctx.app.getHttpServer())
      .post('/api/admin/canned-responses')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'unauthorized', body: 'Should fail' });
    expect(res.body.code).toBe(403);
  });

  it('newly created canned response appears in GET canned-responses list', async () => {
    // Create one via admin
    const adminToken = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const title = uid('visible');
    const createRes = await request(ctx.app.getHttpServer())
      .post('/api/admin/canned-responses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title, body: 'Visible in list' });
    createdCannedIds.push(createRes.body.data.id);

    // Verify it appears via the public-to-auth list endpoint
    const shopperToken = makeToken(ctx.jwtService, shopperUser.id, 'shopper', shopperUser.username);
    const listRes = await request(ctx.app.getHttpServer())
      .get('/api/conversations/canned-responses')
      .set('Authorization', `Bearer ${shopperToken}`);

    const titles = (listRes.body.data as Array<{ title: string }>).map((cr) => cr.title);
    expect(titles).toContain(title);
  });

  // ── POST /conversations/:id/archive ────────────────────────────────────────

  it('vendor (conversation participant) archives conversation → 200, isArchived=true', async () => {
    // Create a fresh conversation so archiving doesn't affect other tests
    const freshConv = await createTestConversation(
      ctx.dataSource,
      listing.id,
      vendorUser.id,
      shopperUser.id,
    );

    const token = makeToken(ctx.jwtService, vendorUser.id, 'vendor', vendorUser.username);
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/conversations/${freshConv.id}/archive`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(200);
    expect(res.body.data.isArchived).toBe(true);

    await ctx.dataSource.getRepository(Conversation).delete(freshConv.id).catch(() => {});
  });

  it('admin can archive any conversation → 200', async () => {
    const freshConv = await createTestConversation(
      ctx.dataSource,
      listing.id,
      vendorUser.id,
      shopperUser.id,
    );

    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/conversations/${freshConv.id}/archive`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(200);
    expect(res.body.data.isArchived).toBe(true);

    await ctx.dataSource.getRepository(Conversation).delete(freshConv.id).catch(() => {});
  });

  it('shopper cannot archive a conversation → 403', async () => {
    const token = makeToken(ctx.jwtService, shopperUser.id, 'shopper', shopperUser.username);
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/conversations/${conversation.id}/archive`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.code).toBe(403);
  });

  it('non-participant vendor cannot archive another vendor conversation → 403', async () => {
    const otherVendor = await createTestUser(ctx.dataSource, 'vendor');
    const token = makeToken(ctx.jwtService, otherVendor.id, 'vendor', otherVendor.username);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/conversations/${conversation.id}/archive`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(403);

    await ctx.dataSource.getRepository(User).delete(otherVendor.id).catch(() => {});
  });

  // ── POST /conversations/:id/voice ──────────────────────────────────────────

  it('authenticated participant can upload audio file → 200, returns message with audioUrl', async () => {
    // Minimal valid audio buffer (ID3 header for MP3 — enough to pass MIME check)
    const audioBuffer = Buffer.from([
      0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);

    const token = makeToken(ctx.jwtService, vendorUser.id, 'vendor', vendorUser.username);
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/conversations/${conversation.id}/voice`)
      .set('Authorization', `Bearer ${token}`)
      .attach('audio', audioBuffer, { filename: 'test.mp3', contentType: 'audio/mpeg' });

    expect(res.body.code).toBe(200);
    expect(res.body.data.audioUrl).toMatch(/^\/api\/conversations\/voice\//);
    expect(res.body.data.type).toBe('voice');
  });

  it('voice upload with non-audio MIME type → 400', async () => {
    const textBuffer = Buffer.from('not audio');
    const token = makeToken(ctx.jwtService, vendorUser.id, 'vendor', vendorUser.username);
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/conversations/${conversation.id}/voice`)
      .set('Authorization', `Bearer ${token}`)
      .attach('audio', textBuffer, { filename: 'test.txt', contentType: 'text/plain' });

    expect(res.body.code).toBe(400);
  });
});
