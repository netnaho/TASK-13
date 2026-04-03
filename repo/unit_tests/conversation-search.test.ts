/**
 * conversation-search.test.ts
 *
 * Unit tests for ConversationsService.findAll() — keyword search and
 * date-range semantics.
 *
 * Keyword search contract:
 *   A conversation is returned when its keyword filter matches:
 *     - (primary)   any message whose content contains the keyword, OR
 *     - (secondary) the linked listing's title contains the keyword.
 *
 * Date-range contract:
 *   startDate / endDate always filter on conversation.createdAt.
 *   They are independent of message timestamps.
 */

import { ConversationsService } from '../backend/src/conversations/conversations.service';
import { Repository } from 'typeorm';

// ── Minimal entity stubs ───────────────────────────────────────────────────

function conv(
  id: string,
  opts: {
    vendorId?: string;
    shopperIds?: string[];
    isArchived?: boolean;
    listingId?: string;
    createdAt?: Date;
  } = {},
) {
  return {
    id,
    vendorId: opts.vendorId ?? 'vendor-1',
    shopperIds: opts.shopperIds ?? ['shopper-1'],
    listingId: opts.listingId ?? 'listing-1',
    isArchived: opts.isArchived ?? false,
    createdAt: opts.createdAt ?? new Date('2024-06-01'),
    updatedAt: new Date(),
  };
}

// ── QueryBuilder stub factory ──────────────────────────────────────────────
//
// Returns a chainable stub that captures filter predicates and evaluates them
// against an in-memory dataset when getManyAndCount() is called.

interface Predicate {
  type: 'vendorId' | 'shopperIds' | 'archived' | 'listingId' | 'keyword' | 'startDate' | 'endDate';
  value: any;
}

function makeConvQb(
  dataset: ReturnType<typeof conv>[],
  listing: { id: string; title: string },
  messages: { conversationId: string; content: string }[],
): any {
  const predicates: Predicate[] = [];
  let skipN = 0;
  let takeN = 1000;

  const qb: any = {
    leftJoinAndSelect: () => qb,
    where: (_expr: string, params: any) => {
      if (_expr.includes('vendorId')) predicates.push({ type: 'vendorId', value: params.userId });
      if (_expr.includes('shopperIds')) predicates.push({ type: 'shopperIds', value: params.userId });
      return qb;
    },
    andWhere: (_expr: string, params: any = {}) => {
      if (_expr.includes('isArchived')) predicates.push({ type: 'archived', value: params.archived });
      if (_expr.includes('listingId')) predicates.push({ type: 'listingId', value: params.listingId });
      if (_expr.includes('listing.title ILIKE') || _expr.includes('EXISTS')) {
        predicates.push({ type: 'keyword', value: params.kw });
      }
      if (_expr.includes('c.createdAt >=')) predicates.push({ type: 'startDate', value: params.startDate });
      if (_expr.includes('c.createdAt <=')) predicates.push({ type: 'endDate', value: params.endDate });
      return qb;
    },
    orderBy: () => qb,
    addOrderBy: () => qb,
    skip: (n: number) => { skipN = n; return qb; },
    take: (n: number) => { takeN = n; return qb; },
    getManyAndCount: () => {
      let results = [...dataset];

      for (const p of predicates) {
        switch (p.type) {
          case 'vendorId':
            results = results.filter(c => c.vendorId === p.value);
            break;
          case 'shopperIds':
            results = results.filter(c => c.shopperIds.includes(p.value));
            break;
          case 'archived':
            results = results.filter(c => c.isArchived === p.value);
            break;
          case 'listingId':
            results = results.filter(c => c.listingId === p.value);
            break;
          case 'keyword': {
            const kwLower = (p.value as string).toLowerCase().replace(/%/g, '');
            results = results.filter(c => {
              // Primary: message content match
              const msgMatch = messages.some(
                m => m.conversationId === c.id && m.content.toLowerCase().includes(kwLower),
              );
              // Secondary: listing title match
              const titleMatch = listing.title.toLowerCase().includes(kwLower);
              return msgMatch || (c.listingId === listing.id && titleMatch);
            });
            break;
          }
          case 'startDate':
            results = results.filter(c => c.createdAt >= p.value);
            break;
          case 'endDate':
            results = results.filter(c => c.createdAt <= p.value);
            break;
        }
      }

      results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const paged = results.slice(skipN, skipN + takeN);
      return Promise.resolve([paged, results.length]);
    },
  };
  return qb;
}

function makeMsgQb(): any {
  const qb: any = {
    select: () => qb,
    where: () => qb,
    andWhere: () => qb,
    getQuery: () => 'SELECT 1 FROM messages m WHERE m."conversationId" = c.id AND m.content ILIKE :kw',
  };
  return qb;
}

// ── Service factory ────────────────────────────────────────────────────────

const listing = { id: 'listing-1', title: 'Golden Retriever Puppy' };

function makeService(
  convDataset: ReturnType<typeof conv>[],
  messages: { conversationId: string; content: string }[],
) {
  const convRepo = {
    createQueryBuilder: jest.fn(() => makeConvQb(convDataset, listing, messages)),
  } as unknown as Repository<any>;

  const msgRepo = {
    createQueryBuilder: jest.fn(() => makeMsgQb()),
    save: jest.fn(e => Promise.resolve(e)),
    create: jest.fn(e => e),
  } as unknown as Repository<any>;

  const listingRepo = {
    findOne: jest.fn(() => Promise.resolve(listing)),
  } as unknown as Repository<any>;

  const rateLimitRepo = {
    count: jest.fn(() => Promise.resolve(0)),
    save: jest.fn(e => Promise.resolve(e)),
    create: jest.fn(e => e),
  } as unknown as Repository<any>;

  const cannedRepo = {} as unknown as Repository<any>;

  const auditService = { log: jest.fn(() => Promise.resolve({})) };
  const riskService = {
    assessConversationCreation: jest.fn(() => Promise.resolve([])),
  };

  return new ConversationsService(
    convRepo,
    msgRepo,
    listingRepo,
    rateLimitRepo,
    cannedRepo,
    auditService as any,
    riskService as any,
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function search(
  svc: ConversationsService,
  filters: Record<string, any> = {},
  role = 'admin',
  userId = 'admin-1',
) {
  return svc.findAll(userId, role, filters as any);
}

// ── keyword: message content (primary) ────────────────────────────────────

describe('keyword — message content (primary match)', () => {
  const conversations = [
    conv('c1'),
    conv('c2'),
    conv('c3'),
  ];
  const messages = [
    { conversationId: 'c1', content: 'Is the puppy still available?' },
    { conversationId: 'c2', content: 'Can I get a discount?' },
    // c3 has no messages
  ];

  it('returns conversation whose message content matches the keyword', async () => {
    const svc = makeService(conversations, messages);
    const result = await search(svc, { keyword: 'puppy' });
    const ids = result.items.map(c => c.id);
    expect(ids).toContain('c1');
  });

  it('does not return conversation whose messages do not match (keyword not in listing title)', async () => {
    // 'available' appears only in c1's message — not in the listing title or any other message.
    const svc = makeService(conversations, messages);
    const result = await search(svc, { keyword: 'available' });
    const ids = result.items.map(c => c.id);
    expect(ids).toContain('c1');
    expect(ids).not.toContain('c2');
    expect(ids).not.toContain('c3');
  });

  it('keyword search is case-insensitive', async () => {
    const svc = makeService(conversations, messages);
    const result = await search(svc, { keyword: 'PUPPY' });
    expect(result.items.map(c => c.id)).toContain('c1');
  });

  it('partial substring match works', async () => {
    const svc = makeService(conversations, messages);
    const result = await search(svc, { keyword: 'discount' });
    expect(result.items.map(c => c.id)).toContain('c2');
  });
});

// ── keyword: listing title (secondary) ────────────────────────────────────

describe('keyword — listing title (secondary match)', () => {
  const conversations = [conv('c1'), conv('c2')];
  const messages = [
    { conversationId: 'c2', content: 'Hello there' },
    // c1 has no messages at all
  ];

  it('returns conversation via listing title when no message matches', async () => {
    const svc = makeService(conversations, messages);
    // 'Retriever' is in the listing title but not in any message
    const result = await search(svc, { keyword: 'Retriever' });
    // Both conversations link to listing-1 whose title contains 'Retriever'
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.map(c => c.id)).toContain('c1');
  });
});

// ── no false positives ─────────────────────────────────────────────────────

describe('keyword — no false positives', () => {
  const conversations = [conv('c1'), conv('c2')];
  const messages = [
    { conversationId: 'c1', content: 'Great dog!' },
    { conversationId: 'c2', content: 'Looks healthy' },
  ];

  it('does not return conversations with unrelated listing title when keyword only matches message', async () => {
    // Keyword 'Great' matches c1 message but not listing title.
    // c2 message does not contain 'Great'.
    const svc = makeService(conversations, messages);
    const result = await search(svc, { keyword: 'Great' });
    const ids = result.items.map(c => c.id);
    expect(ids).toContain('c1');
    expect(ids).not.toContain('c2');
  });

  it('returns empty result when keyword matches nothing', async () => {
    const svc = makeService(conversations, messages);
    const result = await search(svc, { keyword: 'xyzzy_no_match' });
    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

// ── date range: conversation.createdAt ────────────────────────────────────

describe('date range — targets conversation.createdAt', () => {
  const conversations = [
    conv('c1', { createdAt: new Date('2024-01-15') }),
    conv('c2', { createdAt: new Date('2024-03-10') }),
    conv('c3', { createdAt: new Date('2024-06-01') }),
  ];

  it('startDate filters out older conversations', async () => {
    const svc = makeService(conversations, []);
    const result = await search(svc, { startDate: '2024-02-01' });
    const ids = result.items.map(c => c.id);
    expect(ids).not.toContain('c1');
    expect(ids).toContain('c2');
    expect(ids).toContain('c3');
  });

  it('endDate filters out newer conversations', async () => {
    const svc = makeService(conversations, []);
    const result = await search(svc, { endDate: '2024-04-01' });
    const ids = result.items.map(c => c.id);
    expect(ids).toContain('c1');
    expect(ids).toContain('c2');
    expect(ids).not.toContain('c3');
  });

  it('startDate boundary is inclusive', async () => {
    const svc = makeService(conversations, []);
    const result = await search(svc, { startDate: '2024-03-10' });
    expect(result.items.map(c => c.id)).toContain('c2');
  });

  it('endDate boundary is inclusive', async () => {
    const svc = makeService(conversations, []);
    const result = await search(svc, { endDate: '2024-03-10' });
    expect(result.items.map(c => c.id)).toContain('c2');
  });

  it('combined startDate+endDate narrows to window', async () => {
    const svc = makeService(conversations, []);
    const result = await search(svc, { startDate: '2024-02-01', endDate: '2024-05-01' });
    const ids = result.items.map(c => c.id);
    expect(ids).toEqual(['c2']); // only c2 is within [Feb, May]
  });

  it('date range is independent of message timestamps', async () => {
    // c1 has a message created in June (well after conversation start in Jan)
    // but the filter targets conversation.createdAt so c1 is still excluded
    const messages = [{ conversationId: 'c1', content: 'Late reply' }];
    const svc = makeService(conversations, messages);
    const result = await search(svc, { startDate: '2024-02-01' });
    expect(result.items.map(c => c.id)).not.toContain('c1');
  });
});

// ── combined keyword + date range ─────────────────────────────────────────

describe('combined keyword + date range', () => {
  const conversations = [
    conv('c1', { createdAt: new Date('2024-01-15') }),
    conv('c2', { createdAt: new Date('2024-06-01') }),
  ];
  const messages = [
    { conversationId: 'c1', content: 'puppy query' },
    { conversationId: 'c2', content: 'puppy query' },
  ];

  it('both filters apply — only conversations in range AND matching keyword are returned', async () => {
    const svc = makeService(conversations, messages);
    const result = await search(svc, { keyword: 'puppy', startDate: '2024-05-01' });
    const ids = result.items.map(c => c.id);
    expect(ids).toContain('c2');
    expect(ids).not.toContain('c1');
  });
});

// ── pagination ─────────────────────────────────────────────────────────────

describe('pagination', () => {
  const conversations = Array.from({ length: 5 }, (_, i) =>
    conv(`c${i + 1}`, { createdAt: new Date(2024, 0, i + 1) }),
  );

  it('returns correct total regardless of page size', async () => {
    const svc = makeService(conversations, []);
    const result = await search(svc, { page: 1, limit: 2 });
    expect(result.total).toBe(5);
    expect(result.totalPages).toBe(3);
  });

  it('page 1 returns first slice', async () => {
    const svc = makeService(conversations, []);
    const result = await search(svc, { page: 1, limit: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(2);
  });

  it('page 3 with limit 2 returns remaining 1 item', async () => {
    const svc = makeService(conversations, []);
    const result = await search(svc, { page: 3, limit: 2 });
    expect(result.items).toHaveLength(1);
  });

  it('defaults to page=1 limit=20 when not specified', async () => {
    const svc = makeService(conversations, []);
    const result = await search(svc);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('results are ordered newest-first (deterministic)', async () => {
    const svc = makeService(conversations, []);
    const result = await search(svc, { limit: 10 });
    const dates = result.items.map(c => c.createdAt.getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i - 1]).toBeGreaterThanOrEqual(dates[i]);
    }
  });
});

// ── role-scoping smoke test ────────────────────────────────────────────────

describe('role scoping is preserved alongside search filters', () => {
  const conversations = [
    conv('c1', { vendorId: 'vendor-A', shopperIds: ['shopper-X'] }),
    conv('c2', { vendorId: 'vendor-B', shopperIds: ['shopper-Y'] }),
  ];
  const messages = [
    { conversationId: 'c1', content: 'hello vendor A' },
    { conversationId: 'c2', content: 'hello vendor B' },
  ];

  it('vendor only sees their own conversations even when keyword matches both', async () => {
    const svc = makeService(conversations, messages);
    const result = await svc.findAll('vendor-A', 'vendor', { keyword: 'hello' } as any);
    expect(result.items.map(c => c.id)).toEqual(['c1']);
  });

  it('shopper only sees conversations they are part of', async () => {
    const svc = makeService(conversations, messages);
    const result = await svc.findAll('shopper-X', 'shopper', { keyword: 'hello' } as any);
    expect(result.items.map(c => c.id)).toEqual(['c1']);
  });
});
