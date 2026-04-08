/**
 * conversation-search.spec.ts
 *
 * Risk: keyword search silently targets listing title only (not message body);
 * date-range semantics are ambiguous; these defects are invisible through
 * unit tests that stub the query builder.
 *
 * Covers — driven through the real HTTP layer against live Postgres:
 *   - keyword matches message content (primary)
 *   - keyword does NOT match conversations whose messages lack the term
 *   - keyword matches listing title as secondary when no message matches
 *   - keyword matching is case-insensitive
 *   - date range (startDate/endDate) filters on conversation.createdAt, not message.createdAt
 *   - combined keyword + date range correctly narrows results
 *   - pagination response shape is present
 */
import request from 'supertest';
import { createTestApp, makeToken, TestContext } from './test-utils';
import { User } from '../database/entities/user.entity';
import { Listing, ListingStatus } from '../database/entities/listing.entity';
import { Conversation } from '../database/entities/conversation.entity';
import { Message } from '../database/entities/message.entity';
import {
  createTestUser,
  createTestListing,
  createTestConversation,
  createTestMessage,
  cleanupAll,
} from './test-fixtures';

describe('Conversation search: keyword targets message content and date range targets conversation.createdAt', () => {
  let ctx: TestContext;
  let vendor: User;
  let shopper: User;

  // Two conversations with distinct message content
  let convWithKeyword: Conversation;
  let convWithoutKeyword: Conversation;
  let listing: Listing;

  // Unique marker to avoid collisions with other test data
  const UNIQUE_KEYWORD = `xqztestword_${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    ctx = await createTestApp();
    const ds = ctx.dataSource;

    vendor = await createTestUser(ds, 'vendor');
    shopper = await createTestUser(ds, 'shopper');
    listing = await createTestListing(ds, vendor.id, ListingStatus.ACTIVE);

    convWithKeyword = await createTestConversation(ds, listing.id, vendor.id, shopper.id);
    convWithoutKeyword = await createTestConversation(ds, listing.id, vendor.id, shopper.id);

    // Plant the unique keyword only in convWithKeyword's message
    await createTestMessage(ds, convWithKeyword.id, shopper.id, `Is the ${UNIQUE_KEYWORD} still available?`);
    await createTestMessage(ds, convWithoutKeyword.id, shopper.id, 'Can I get a discount?');
  }, 30000);

  afterAll(async () => {
    await cleanupAll(ctx.dataSource, [
      { entity: Message, ids: [] }, // cleaned via conversation cascade
      { entity: Conversation, ids: [convWithKeyword?.id, convWithoutKeyword?.id].filter(Boolean) as string[] },
      { entity: Listing, ids: [listing?.id].filter(Boolean) as string[] },
      { entity: User, ids: [vendor?.id, shopper?.id].filter(Boolean) as string[] },
    ]);
    await ctx.app.close();
  });

  // ── keyword: message content ────────────────────────────────────────────────

  it('keyword matching message content returns the correct conversation', async () => {
    const token = makeToken(ctx.jwtService, vendor.id, 'vendor', vendor.username);

    const res = await request(ctx.app.getHttpServer())
      .get('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .query({ keyword: UNIQUE_KEYWORD });

    expect(res.body.code).toBe(200);
    const ids = res.body.data.items.map((c: any) => c.id);
    expect(ids).toContain(convWithKeyword.id);
    expect(ids).not.toContain(convWithoutKeyword.id);
  });

  it('keyword not present in any message or title returns empty result', async () => {
    const token = makeToken(ctx.jwtService, vendor.id, 'vendor', vendor.username);
    const absentWord = `absent_${Math.random().toString(36).slice(2)}`;

    const res = await request(ctx.app.getHttpServer())
      .get('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .query({ keyword: absentWord });

    expect(res.body.code).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
    expect(res.body.data.total).toBe(0);
  });

  it('keyword search is case-insensitive against message content', async () => {
    const token = makeToken(ctx.jwtService, vendor.id, 'vendor', vendor.username);

    const res = await request(ctx.app.getHttpServer())
      .get('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .query({ keyword: UNIQUE_KEYWORD.toUpperCase() });

    expect(res.body.code).toBe(200);
    const ids = res.body.data.items.map((c: any) => c.id);
    expect(ids).toContain(convWithKeyword.id);
  });

  // ── keyword: listing title (secondary) ─────────────────────────────────────

  it('keyword matching listing title (not in any message) returns conversations linked to that listing', async () => {
    const token = makeToken(ctx.jwtService, vendor.id, 'vendor', vendor.username);
    // listing.title was generated with uid() prefix — use a substring of it
    const titleWord = listing.title.split('_')[0]; // "t" prefix or the unique part

    const res = await request(ctx.app.getHttpServer())
      .get('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .query({ keyword: listing.title });

    expect(res.body.code).toBe(200);
    // Both conversations link to this listing so both should match via title
    const ids = res.body.data.items.map((c: any) => c.id);
    expect(ids).toContain(convWithKeyword.id);
    expect(ids).toContain(convWithoutKeyword.id);
  });

  // ── date range: targets conversation.createdAt ──────────────────────────────

  it('startDate in the future excludes all conversations (date range on conversation.createdAt)', async () => {
    const token = makeToken(ctx.jwtService, vendor.id, 'vendor', vendor.username);

    const res = await request(ctx.app.getHttpServer())
      .get('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .query({ startDate: '2099-01-01' });

    expect(res.body.code).toBe(200);
    // No conversations were created after 2099
    expect(res.body.data.items).toHaveLength(0);
  });

  it('endDate in the far past excludes all conversations', async () => {
    const token = makeToken(ctx.jwtService, vendor.id, 'vendor', vendor.username);

    const res = await request(ctx.app.getHttpServer())
      .get('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .query({ endDate: '2000-01-01' });

    expect(res.body.code).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });

  it('date range includes test conversations created now', async () => {
    const token = makeToken(ctx.jwtService, vendor.id, 'vendor', vendor.username);

    const res = await request(ctx.app.getHttpServer())
      .get('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .query({ startDate: '2020-01-01', endDate: '2099-12-31' });

    expect(res.body.code).toBe(200);
    const ids = res.body.data.items.map((c: any) => c.id);
    expect(ids).toContain(convWithKeyword.id);
    expect(ids).toContain(convWithoutKeyword.id);
  });

  // ── Combined keyword + date range ───────────────────────────────────────────

  it('keyword + valid date range returns matching conversation', async () => {
    const token = makeToken(ctx.jwtService, vendor.id, 'vendor', vendor.username);

    const res = await request(ctx.app.getHttpServer())
      .get('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .query({
        keyword: UNIQUE_KEYWORD,
        startDate: '2020-01-01',
        endDate: '2099-12-31',
      });

    expect(res.body.code).toBe(200);
    const ids = res.body.data.items.map((c: any) => c.id);
    expect(ids).toContain(convWithKeyword.id);
    expect(ids).not.toContain(convWithoutKeyword.id);
  });

  it('keyword present but date range excludes the conversation → empty result', async () => {
    const token = makeToken(ctx.jwtService, vendor.id, 'vendor', vendor.username);

    const res = await request(ctx.app.getHttpServer())
      .get('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .query({ keyword: UNIQUE_KEYWORD, startDate: '2099-01-01' });

    expect(res.body.code).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });

  // ── Pagination response shape ───────────────────────────────────────────────

  it('response includes pagination fields: total, page, limit, totalPages', async () => {
    const token = makeToken(ctx.jwtService, vendor.id, 'vendor', vendor.username);

    const res = await request(ctx.app.getHttpServer())
      .get('/api/conversations')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, limit: 5 });

    expect(res.body.code).toBe(200);
    const data = res.body.data;
    expect(data).toHaveProperty('items');
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('page', 1);
    expect(data).toHaveProperty('limit', 5);
    expect(data).toHaveProperty('totalPages');
    expect(Array.isArray(data.items)).toBe(true);
  });
});
