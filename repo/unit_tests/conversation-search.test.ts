/**
 * conversation-search.test.ts
 *
 * Narrow unit tests for ConversationsService.findAll() structural behavior:
 * pagination shape, limit clamping, and page defaulting.
 *
 * NOTE: Filter semantic behavior (keyword, date-range, role scoping) is now
 * covered by backend/src/test/conversation-search.integration.spec.ts which
 * uses a real PostgreSQL instance.  This file no longer replicates the SQL
 * query logic in-process — doing so creates a logic-replica risk where the
 * replica and the real TypeORM query can silently diverge.
 *
 * Tests here are appropriate for unit isolation because they verify pure
 * structural invariants (pagination math, response envelope) that do not
 * depend on SQL semantics.
 */

import { ConversationsService } from '../backend/src/conversations/conversations.service';

// ── Minimal service factory ───────────────────────────────────────────────────
//
// The convRepo mock returns a fixed dataset regardless of filters.
// This is intentional: we are only testing the response shape and pagination
// arithmetic, NOT the filter predicates.

function makeConvRepo(items: any[], total?: number) {
  const resolvedTotal = total ?? items.length;
  return {
    createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([items, resolvedTotal]),
    })),
  };
}

function makeMsgRepo() {
  return {
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getQuery: jest.fn().mockReturnValue('SELECT 1'),
    })),
    save: jest.fn(e => Promise.resolve(e)),
    create: jest.fn(e => e),
  };
}

function buildService(items: any[], total?: number): ConversationsService {
  return new ConversationsService(
    makeConvRepo(items, total) as any,
    makeMsgRepo() as any,
    {} as any,  // listingRepo
    {} as any,  // rateLimitRepo
    {} as any,  // cannedRepo
    {} as any,  // auditService
    {} as any,  // riskService
  );
}

// ── Pagination response shape ─────────────────────────────────────────────────

describe('findAll — response shape always includes pagination envelope', () => {
  it('returns items, total, page, limit, totalPages', async () => {
    const svc = buildService([{ id: 'c1' }, { id: 'c2' }], 2);
    const result = await svc.findAll('u1', 'admin', {} as any);
    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('total', 2);
    expect(result).toHaveProperty('page', 1);
    expect(result).toHaveProperty('limit');
    expect(result).toHaveProperty('totalPages');
    expect(Array.isArray(result.items)).toBe(true);
  });

  it('totalPages is Math.ceil(total / limit)', async () => {
    const svc = buildService([], 10); // 10 total items in DB
    const result = await svc.findAll('u1', 'admin', { page: 1, limit: 3 } as any);
    expect(result.totalPages).toBe(4); // ceil(10/3) = 4
  });
});

// ── Limit clamping ────────────────────────────────────────────────────────────

describe('findAll — limit is clamped to SEARCH_MAX_LIMIT (100)', () => {
  it('limit=200 is clamped to 100', async () => {
    const svc = buildService([]);
    const result = await svc.findAll('u1', 'admin', { limit: 200 } as any);
    expect(result.limit).toBe(100);
  });

  it('limit=0 is clamped to 1 (minimum)', async () => {
    const svc = buildService([]);
    const result = await svc.findAll('u1', 'admin', { limit: 0 } as any);
    expect(result.limit).toBe(1);
  });

  it('limit=50 is returned unchanged', async () => {
    const svc = buildService([]);
    const result = await svc.findAll('u1', 'admin', { limit: 50 } as any);
    expect(result.limit).toBe(50);
  });
});

// ── Page defaulting ───────────────────────────────────────────────────────────

describe('findAll — page defaults and flooring', () => {
  it('omitting page defaults to 1', async () => {
    const svc = buildService([]);
    const result = await svc.findAll('u1', 'admin', {} as any);
    expect(result.page).toBe(1);
  });

  it('page=0 is floored to 1', async () => {
    const svc = buildService([]);
    const result = await svc.findAll('u1', 'admin', { page: 0 } as any);
    expect(result.page).toBe(1);
  });

  it('page=3 is returned as-is', async () => {
    const svc = buildService([]);
    const result = await svc.findAll('u1', 'admin', { page: 3 } as any);
    expect(result.page).toBe(3);
  });
});
