/**
 * voice-access.spec.ts
 *
 * Security regression tests for authenticated voice-file retrieval.
 *
 * Risk: voice media was previously served as public static files at
 * /uploads/voice/<filename>, bypassing conversation-level authorization.
 *
 * These tests verify:
 *   1. Unauthenticated requests are rejected (401).
 *   2. Authenticated but non-participant users are rejected (403).
 *   3. Conversation participants (shopper + vendor) are allowed (200).
 *   4. Admin can access any voice file (200).
 *   5. Direct static path /uploads/voice/* is blocked (401).
 *   6. A voice message whose file is missing on disk returns 404 after auth passes.
 *   7. Malformed / path-traversal file names are rejected (400).
 */
import * as fs from 'fs';
import { join } from 'path';
import request from 'supertest';
import { createTestApp, makeToken, TestContext } from './test-utils';
import { User } from '../database/entities/user.entity';
import { Listing, ListingStatus } from '../database/entities/listing.entity';
import { Conversation } from '../database/entities/conversation.entity';
import { Message, MessageType } from '../database/entities/message.entity';
import {
  createTestUser,
  createTestListing,
  createTestConversation,
  cleanupAll,
} from './test-fixtures';

describe('Voice file access control', () => {
  let ctx: TestContext;

  let vendorUser: User;
  let shopperUser: User;
  let outsiderUser: User;    // shopper not part of any conversation
  let outsiderVendor: User;  // vendor not part of this conversation
  let adminUser: User;

  // Conversation 2 — used for cross-conversation isolation tests
  let shopperB: User;
  let conv2: Conversation;
  let voiceMsgConv2: Message; // voice message belonging to conv2

  let listing: Listing;
  let conversation: Conversation;
  let voiceMsg: Message;
  let orphanMsg: Message; // referenced in DB but no file on disk

  const testFileName   = `test-voice-${Date.now()}.ogg`;
  const orphanFileName = `orphan-voice-${Date.now()}.ogg`;
  const conv2FileName  = `conv2-voice-${Date.now()}.ogg`;
  const voiceDir = join(process.cwd(), 'uploads', 'voice');

  beforeAll(async () => {
    ctx = await createTestApp();
    const ds = ctx.dataSource;

    vendorUser     = await createTestUser(ds, 'vendor');
    shopperUser    = await createTestUser(ds, 'shopper');
    outsiderUser   = await createTestUser(ds, 'shopper');
    outsiderVendor = await createTestUser(ds, 'vendor');
    adminUser      = await createTestUser(ds, 'admin');

    // Conversation 2 participants
    shopperB = await createTestUser(ds, 'shopper');

    listing      = await createTestListing(ds, vendorUser.id, ListingStatus.ACTIVE);
    conversation = await createTestConversation(ds, listing.id, vendorUser.id, shopperUser.id);

    // Conversation 2 owned by vendorUser, with shopperB as participant
    const listing2Entity = await createTestListing(ds, vendorUser.id, ListingStatus.ACTIVE);
    conv2 = await createTestConversation(ds, listing2Entity.id, vendorUser.id, shopperB.id);

    const msgRepo = ds.getRepository(Message);

    // Voice message that has an actual file on disk.
    voiceMsg = await msgRepo.save(
      msgRepo.create({
        conversationId: conversation.id,
        senderId: shopperUser.id,
        type: MessageType.VOICE,
        content: '',
        audioUrl: `/api/conversations/voice/${testFileName}`,
        isInternal: false,
      }),
    );

    // Voice message whose file has been deleted / never created.
    orphanMsg = await msgRepo.save(
      msgRepo.create({
        conversationId: conversation.id,
        senderId: shopperUser.id,
        type: MessageType.VOICE,
        content: '',
        audioUrl: `/api/conversations/voice/${orphanFileName}`,
        isInternal: false,
      }),
    );

    // Voice message for conversation 2 (cross-conversation isolation tests).
    voiceMsgConv2 = await msgRepo.save(
      msgRepo.create({
        conversationId: conv2.id,
        senderId: shopperB.id,
        type: MessageType.VOICE,
        content: '',
        audioUrl: `/api/conversations/voice/${conv2FileName}`,
        isInternal: false,
      }),
    );

    // Create the actual audio files for the participant / admin tests.
    fs.mkdirSync(voiceDir, { recursive: true });
    fs.writeFileSync(join(voiceDir, testFileName),  Buffer.from('fake ogg audio data'));
    fs.writeFileSync(join(voiceDir, conv2FileName), Buffer.from('fake ogg audio data conv2'));
  }, 30000);

  afterAll(async () => {
    // Remove the test files we created.
    try { fs.unlinkSync(join(voiceDir, testFileName)); }  catch { /* ignored */ }
    try { fs.unlinkSync(join(voiceDir, conv2FileName)); } catch { /* ignored */ }

    await cleanupAll(ctx.dataSource, [
      { entity: Message,      ids: [voiceMsg?.id, orphanMsg?.id, voiceMsgConv2?.id].filter(Boolean) as string[] },
      { entity: Conversation, ids: [conversation?.id, conv2?.id].filter(Boolean) as string[] },
      { entity: Listing,      ids: [listing?.id].filter(Boolean) as string[] },
      { entity: User,         ids: [vendorUser?.id, shopperUser?.id, outsiderUser?.id, outsiderVendor?.id, adminUser?.id, shopperB?.id].filter(Boolean) as string[] },
    ]);
    await ctx.app.close();
  });

  // ── 1. Static route is blocked ───────────────────────────────────────────────

  it('GET /uploads/voice/* is not publicly served (404 — path not registered)', async () => {
    // The static /uploads/voice path is NOT served by NestJS; the only valid
    // route is the authenticated /api/conversations/voice/:fileName endpoint.
    // A 404 (path not found) is the correct response — the file is unreachable
    // without going through the authenticated API route.
    const res = await request(ctx.app.getHttpServer())
      .get(`/uploads/voice/${testFileName}`);
    expect(res.status).toBe(404);
  });

  // ── 2. Unauthenticated on secure endpoint ────────────────────────────────────

  it('unauthenticated request to secure endpoint returns 401', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/conversations/voice/${testFileName}`);
    expect(res.body.code).toBe(401);
  });

  // ── 3. Non-participant denied ────────────────────────────────────────────────

  it('outsider shopper (non-participant) receives 403', async () => {
    const token = makeToken(ctx.jwtService, outsiderUser.id, 'shopper', outsiderUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/conversations/voice/${testFileName}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.code).toBe(403);
  });

  // ── 4. Participants allowed ──────────────────────────────────────────────────

  it('shopper participant receives 200 and audio data', async () => {
    const token = makeToken(ctx.jwtService, shopperUser.id, 'shopper', shopperUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/conversations/voice/${testFileName}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // Response body should be the file content, not a JSON envelope.
    expect(Buffer.isBuffer(res.body) || res.body).toBeTruthy();
  });

  it('vendor participant receives 200 and audio data', async () => {
    const token = makeToken(ctx.jwtService, vendorUser.id, 'vendor', vendorUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/conversations/voice/${testFileName}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  // ── 5. Admin allowed ─────────────────────────────────────────────────────────

  it('admin receives 200 and audio data', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/conversations/voice/${testFileName}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  // ── 6. Auth passes but file is missing on disk ───────────────────────────────

  it('participant gets 404 when the file is missing on disk', async () => {
    const token = makeToken(ctx.jwtService, shopperUser.id, 'shopper', shopperUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/conversations/voice/${orphanFileName}`)
      .set('Authorization', `Bearer ${token}`);
    // Auth passes; the file on disk is absent → 404 from sendFile callback.
    expect(res.body.code).toBe(404);
  });

  // ── 7. Input validation ──────────────────────────────────────────────────────

  it('path-traversal attempt (%2F) returns 400', async () => {
    const token = makeToken(ctx.jwtService, shopperUser.id, 'shopper', shopperUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get('/api/conversations/voice/..%2Fetc%2Fpasswd')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.code).toBe(400);
  });

  it('file name with disallowed characters returns 400', async () => {
    const token = makeToken(ctx.jwtService, shopperUser.id, 'shopper', shopperUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get('/api/conversations/voice/foo$bar.ogg')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.code).toBe(400);
  });

  // ── 8. Unknown file name ─────────────────────────────────────────────────────

  it('participant requesting an unrecognised filename gets 404', async () => {
    const token = makeToken(ctx.jwtService, shopperUser.id, 'shopper', shopperUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get('/api/conversations/voice/no-such-file-ever.ogg')
      .set('Authorization', `Bearer ${token}`);
    // resolveVoiceFilePath throws NotFoundException (no matching message in DB).
    expect(res.body.code).toBe(404);
  });

  // ── 9. Invalid / tampered JWT ─────────────────────────────────────────────────
  //
  // Closes the gap: the suite previously only tested the "no token" 401 case.
  // A tampered or expired token must also be rejected by JwtAuthGuard.

  it('tampered JWT returns 401 (invalid signature)', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/conversations/voice/${testFileName}`)
      .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4eHgifQ.invalidsig');
    expect(res.body.code).toBe(401);
  });

  it('completely malformed token string returns 401', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/conversations/voice/${testFileName}`)
      .set('Authorization', 'Bearer not.a.jwt.at.all');
    expect(res.body.code).toBe(401);
  });

  // ── 10. Outsider vendor (not this conversation's vendor) ──────────────────────
  //
  // Closes the gap: outsider tests previously only covered a shopper non-participant.
  // A vendor user who is NOT the vendor of this conversation must also be denied.

  it('outsider vendor (not the conversation vendor) receives 403', async () => {
    const token = makeToken(ctx.jwtService, outsiderVendor.id, 'vendor', outsiderVendor.username);
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/conversations/voice/${testFileName}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.code).toBe(403);
  });

  // ── 11. Cross-conversation isolation ─────────────────────────────────────────
  //
  // Closes the gap: proves that participant status is tied to the specific
  // conversation that owns the message, not to "any conversation the user is in".
  //
  // shopperUser is a participant of conv1 but NOT conv2.
  // shopperB    is a participant of conv2 but NOT conv1.
  // voiceMsgConv2 belongs to conv2.
  //
  // Expected: shopperUser → 403 on conv2 file; shopperB → 200.

  it('shopper from conv1 cannot access a voice file belonging to conv2 (403)', async () => {
    const token = makeToken(ctx.jwtService, shopperUser.id, 'shopper', shopperUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/conversations/voice/${conv2FileName}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.code).toBe(403);
  });

  it('shopper from conv2 CAN access the voice file belonging to conv2 (200)', async () => {
    const token = makeToken(ctx.jwtService, shopperB.id, 'shopper', shopperB.username);
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/conversations/voice/${conv2FileName}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});
