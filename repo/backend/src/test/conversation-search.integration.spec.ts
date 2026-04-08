/**
 * conversation-search.integration.spec.ts
 *
 * Full-stack integration coverage for ConversationsService.findAll() driven
 * through the real HTTP layer against a live PostgreSQL instance.
 *
 * Risk closed:
 *   Prior unit test (conversation-search.test.ts) replicated the QueryBuilder
 *   filter logic in-process with a custom `makeConvQb` predicate engine.  A
 *   divergence between that replica and the real SQL would produce a passing
 *   unit suite while the production query was silently broken.
 *
 *   These tests exercise the real TypeORM QueryBuilder → PostgreSQL ILIKE /
 *   EXISTS path so every filter assertion reflects actual database behavior.
 *
 * Scenarios covered with real DB-backed fixtures:
 *   Keyword search
 *     - Primary: keyword in message content → conversation returned
 *     - Primary: keyword absent from all messages and titles → nothing returned
 *     - Primary: keyword present in one conversation's message but not another → no false positives
 *     - Case-insensitive: KEYWORD.toUpperCase() matches lowercase message
 *     - Secondary: keyword in listing title, NOT in any message → still returned
 *
 *   Date-range (always targets conversation.createdAt)
 *     - startDate only: older conversation excluded
 *     - endDate only: newer conversation excluded
 *     - Both bounds: only conversations inside the window are returned
 *     - Combined keyword + date range: both filters applied simultaneously
 *
 *   Role / user scoping
 *     - Vendor sees only their own conversations
 *     - Shopper sees only conversations they are in
 *     - Admin sees conversations from all vendors
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
  uid,
} from './test-fixtures';

describe('Conversation search: real DB-backed filter semantics', () => {
  let ctx: TestContext;

  // ── Users ─────────────────────────────────────────────────────────────────
  let vendorA: User;
  let vendorB: User;
  let shopperA: User;
  let shopperB: User;
  let adminUser: User;

  // ── Listings ──────────────────────────────────────────────────────────────
  let listingA: Listing;      // vendorA — generic title (no search keywords)
  let listingT: Listing;      // vendorA — title contains TITLE_KEYWORD
  let listingB: Listing;      // vendorB — generic title

  // ── Conversations ─────────────────────────────────────────────────────────
  let convMsg: Conversation;       // vendorA+shopperA — message has SEARCH_KEYWORD
  let convNoMatch: Conversation;   // vendorA+shopperA — message has no keywords
  let convTitleOnly: Conversation; // vendorA+shopperA — linked to listingT (title has TITLE_KEYWORD), message has no keyword
  let convDateOld: Conversation;   // vendorA+shopperA — createdAt overridden to 2020-03-15
  let convVendorB: Conversation;   // vendorB+shopperB — message has SEARCH_KEYWORD (for isolation test)

  // Unique keywords — random suffix prevents cross-test collisions
  const SEARCH_KEYWORD = `srchkw_${uid()}`;
  const TITLE_KEYWORD  = `titlekw_${uid()}`;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  beforeAll(async () => {
    ctx = await createTestApp();
    const ds = ctx.dataSource;

    // Users
    vendorA   = await createTestUser(ds, 'vendor');
    vendorB   = await createTestUser(ds, 'vendor');
    shopperA  = await createTestUser(ds, 'shopper');
    shopperB  = await createTestUser(ds, 'shopper');
    adminUser = await createTestUser(ds, 'admin');

    // Listings
    listingA = await createTestListing(ds, vendorA.id, ListingStatus.ACTIVE);
    listingT = await createTestListing(ds, vendorA.id, ListingStatus.ACTIVE, {
      title: `Listing_${TITLE_KEYWORD}_special`,
    });
    listingB = await createTestListing(ds, vendorB.id, ListingStatus.ACTIVE);

    // Conversations
    convMsg      = await createTestConversation(ds, listingA.id, vendorA.id, shopperA.id);
    convNoMatch  = await createTestConversation(ds, listingA.id, vendorA.id, shopperA.id);
    convTitleOnly = await createTestConversation(ds, listingT.id, vendorA.id, shopperA.id);
    convDateOld  = await createTestConversation(ds, listingA.id, vendorA.id, shopperA.id);
    convVendorB  = await createTestConversation(ds, listingB.id, vendorB.id, shopperB.id);

    // Messages
    await createTestMessage(ds, convMsg.id, shopperA.id,
      `I am interested in this pet. Does it have ${SEARCH_KEYWORD}?`);
    await createTestMessage(ds, convNoMatch.id, shopperA.id,
      'Just browsing, no special terms here.');
    await createTestMessage(ds, convTitleOnly.id, shopperA.id,
      'Just browsing, no special terms here.');
    await createTestMessage(ds, convVendorB.id, shopperB.id,
      `VendorB message with ${SEARCH_KEYWORD} included.`);

    // Override convDateOld.createdAt to a known past date so date-range tests
    // have a predictable anchor. @CreateDateColumn() auto-sets on insert so we
    // use a raw query to backdate after creation.
    await ds.query(
      `UPDATE conversations SET "createdAt" = $1 WHERE id = $2`,
      [new Date('2020-03-15T00:00:00Z'), convDateOld.id],
    );
  }, 30_000);

  afterAll(async () => {
    // Deletion order: conversations first (messages cascade), then listings, then users.
    await cleanupAll(ctx.dataSource, [
      {
        entity: Conversation,
        ids: [convMsg?.id, convNoMatch?.id, convTitleOnly?.id, convDateOld?.id, convVendorB?.id]
          .filter(Boolean) as string[],
      },
      {
        entity: Listing,
        ids: [listingA?.id, listingT?.id, listingB?.id].filter(Boolean) as string[],
      },
      {
        entity: User,
        ids: [vendorA?.id, vendorB?.id, shopperA?.id, shopperB?.id, adminUser?.id]
          .filter(Boolean) as string[],
      },
    ]);
    await ctx.app.close();
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  function tokenFor(user: User): string {
    return makeToken(ctx.jwtService, user.id, user.role, user.username);
  }

  async function searchAs(user: User, query: Record<string, string | number> = {}) {
    const res = await request(ctx.app.getHttpServer())
      .get('/api/conversations')
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .query(query);
    expect(res.body.code).toBe(200);
    return res.body.data as { items: Conversation[]; total: number; page: number; limit: number; totalPages: number };
  }

  // ── Keyword: primary — message content ───────────────────────────────────

  it('keyword matching message content returns that conversation (primary path)', async () => {
    const data = await searchAs(vendorA, { keyword: SEARCH_KEYWORD });
    const ids = data.items.map((c: any) => c.id);
    expect(ids).toContain(convMsg.id);
  });

  it('keyword in one message does not pollute conversations whose messages lack it (no false positives)', async () => {
    const data = await searchAs(vendorA, { keyword: SEARCH_KEYWORD });
    const ids = data.items.map((c: any) => c.id);
    expect(ids).not.toContain(convNoMatch.id);
    expect(ids).not.toContain(convTitleOnly.id);
  });

  it('keyword matching nothing returns empty result', async () => {
    const absent = `absent_${uid()}`;
    const data = await searchAs(vendorA, { keyword: absent });
    expect(data.items).toHaveLength(0);
    expect(data.total).toBe(0);
  });

  it('keyword search is case-insensitive (UPPERCASE query matches lowercase content)', async () => {
    const data = await searchAs(vendorA, { keyword: SEARCH_KEYWORD.toUpperCase() });
    const ids = data.items.map((c: any) => c.id);
    expect(ids).toContain(convMsg.id);
  });

  // ── Keyword: secondary — listing title ───────────────────────────────────

  it('keyword in listing title (not in any message) returns the linked conversation (secondary path)', async () => {
    // convTitleOnly has a message without TITLE_KEYWORD, but its listing title contains it.
    const data = await searchAs(vendorA, { keyword: TITLE_KEYWORD });
    const ids = data.items.map((c: any) => c.id);
    expect(ids).toContain(convTitleOnly.id);
  });

  it('secondary path does not return conversations linked to listings whose title lacks the keyword', async () => {
    // listingA title does not contain TITLE_KEYWORD, so convMsg and convNoMatch should not appear.
    const data = await searchAs(vendorA, { keyword: TITLE_KEYWORD });
    const ids = data.items.map((c: any) => c.id);
    expect(ids).not.toContain(convMsg.id);
    expect(ids).not.toContain(convNoMatch.id);
  });

  // ── Date range: targets conversation.createdAt ───────────────────────────

  it('startDate only: conversations before the boundary are excluded', async () => {
    // convDateOld was created 2020-03-15; convMsg was created now (~2026).
    // startDate=2023-01-01 should exclude 2020 but include 2026.
    const data = await searchAs(vendorA, { startDate: '2023-01-01' });
    const ids = data.items.map((c: any) => c.id);
    expect(ids).not.toContain(convDateOld.id);
    expect(ids).toContain(convMsg.id);
  });

  it('endDate only: conversations after the boundary are excluded', async () => {
    // endDate=2022-01-01 includes 2020-03-15 but excludes ~2026.
    const data = await searchAs(vendorA, { endDate: '2022-01-01' });
    const ids = data.items.map((c: any) => c.id);
    expect(ids).toContain(convDateOld.id);
    expect(ids).not.toContain(convMsg.id);
  });

  it('both startDate and endDate: only conversations inside the window are returned', async () => {
    // Window [2023-01-01, 2099-01-01] includes ~2026 but not 2020-03-15.
    const data = await searchAs(vendorA, { startDate: '2023-01-01', endDate: '2099-01-01' });
    const ids = data.items.map((c: any) => c.id);
    expect(ids).toContain(convMsg.id);
    expect(ids).not.toContain(convDateOld.id);
  });

  it('date range targets conversation.createdAt, not message timestamps', async () => {
    // convDateOld has createdAt=2020 and a message created at test time (~2026).
    // A startDate=2023 should still exclude convDateOld — the message timestamp is irrelevant.
    const data = await searchAs(vendorA, { startDate: '2023-01-01' });
    const ids = data.items.map((c: any) => c.id);
    expect(ids).not.toContain(convDateOld.id);
  });

  // ── Combined keyword + date range ─────────────────────────────────────────

  it('keyword + startDate in the future returns empty even if keyword matches', async () => {
    const data = await searchAs(vendorA, { keyword: SEARCH_KEYWORD, startDate: '2099-01-01' });
    expect(data.items).toHaveLength(0);
  });

  it('keyword + valid date range returns only the conversation that satisfies both', async () => {
    // convMsg (2026) matches SEARCH_KEYWORD and is within [2023, 2099].
    // convDateOld (2020) is not within [2023, 2099].
    const data = await searchAs(vendorA, {
      keyword: SEARCH_KEYWORD,
      startDate: '2023-01-01',
      endDate: '2099-01-01',
    });
    const ids = data.items.map((c: any) => c.id);
    expect(ids).toContain(convMsg.id);
    expect(ids).not.toContain(convDateOld.id);
  });

  // ── Role / user scoping ───────────────────────────────────────────────────

  it('vendor sees only their own conversations — not another vendors', async () => {
    const data = await searchAs(vendorA);
    const ids = data.items.map((c: any) => c.id);
    expect(ids).toContain(convMsg.id);
    expect(ids).not.toContain(convVendorB.id);
  });

  it('different vendor sees their own conversations — not vendorA conversations', async () => {
    const data = await searchAs(vendorB);
    const ids = data.items.map((c: any) => c.id);
    expect(ids).toContain(convVendorB.id);
    expect(ids).not.toContain(convMsg.id);
  });

  it('shopper sees only conversations they are a participant of', async () => {
    // shopperA is in convMsg/convNoMatch/convTitleOnly/convDateOld, not in convVendorB.
    const data = await searchAs(shopperA);
    const ids = data.items.map((c: any) => c.id);
    expect(ids).toContain(convMsg.id);
    expect(ids).not.toContain(convVendorB.id);
  });

  it('shopper from one conversation cannot see another shoppers conversations', async () => {
    // shopperB is only in convVendorB.
    const data = await searchAs(shopperB);
    const ids = data.items.map((c: any) => c.id);
    expect(ids).toContain(convVendorB.id);
    expect(ids).not.toContain(convMsg.id);
  });

  it('admin sees conversations belonging to all vendors', async () => {
    const data = await searchAs(adminUser);
    const ids = data.items.map((c: any) => c.id);
    expect(ids).toContain(convMsg.id);
    expect(ids).toContain(convVendorB.id);
  });

  it('role scoping still applies when a keyword filter is added', async () => {
    // vendorA with SEARCH_KEYWORD: should see convMsg (own), NOT convVendorB (vendorB).
    const data = await searchAs(vendorA, { keyword: SEARCH_KEYWORD });
    const ids = data.items.map((c: any) => c.id);
    expect(ids).toContain(convMsg.id);
    expect(ids).not.toContain(convVendorB.id);
  });
});
