/**
 * settlement-sod.spec.ts
 *
 * Risk: the same principal can complete both settlement approval steps,
 * bypassing the separation-of-duties requirement.
 *
 * Covers:
 *   - ops_reviewer approves step 1 → 200
 *   - same actor (holding finance_admin token) attempts step 2 → 403
 *   - different finance_admin actor completes step 2 → 200
 *   - finance_admin cannot perform step 1 (wrong role) → 403
 *   - non-reviewer role cannot perform step 1 → 403
 */
import * as request from 'supertest';
import { createTestApp, makeToken, TestContext } from './test-utils';
import { User } from '../database/entities/user.entity';
import { Listing, ListingStatus } from '../database/entities/listing.entity';
import { Settlement, SettlementStatus } from '../database/entities/settlement.entity';
import { createTestUser, createTestListing, createTestSettlement, cleanupAll } from './test-fixtures';

describe('Settlement separation-of-duties: same actor cannot approve both steps', () => {
  let ctx: TestContext;
  let opsReviewer: User;
  let financeAdmin: User;
  let vendor: User;
  let listing: Listing;

  // Each test group uses a freshly-inserted settlement so state is independent
  async function freshSettlement(): Promise<Settlement> {
    return createTestSettlement(ctx.dataSource, vendor.id);
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    const ds = ctx.dataSource;

    opsReviewer = await createTestUser(ds, 'ops_reviewer');
    financeAdmin = await createTestUser(ds, 'finance_admin');
    vendor = await createTestUser(ds, 'vendor');
    listing = await createTestListing(ds, vendor.id);
  }, 30000);

  afterAll(async () => {
    // Settlements created per-test are cleaned up here via vendor FK
    await cleanupAll(ctx.dataSource, [
      { entity: Listing, ids: [listing?.id].filter(Boolean) as string[] },
      // Settlements tied to vendor are removed via the cascade delete of the vendor below
      { entity: Settlement, ids: [] }, // explicit per-test cleanup not needed — vendor cascade
      { entity: User, ids: [opsReviewer?.id, financeAdmin?.id, vendor?.id].filter(Boolean) as string[] },
    ]);
    await ctx.app.close();
  });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('ops_reviewer approves step 1, different finance_admin completes step 2', async () => {
    const settlement = await freshSettlement();
    const reviewerToken = makeToken(ctx.jwtService, opsReviewer.id, 'ops_reviewer', opsReviewer.username);
    const financeToken = makeToken(ctx.jwtService, financeAdmin.id, 'finance_admin', financeAdmin.username);

    const step1 = await request(ctx.app.getHttpServer())
      .post(`/api/settlements/${settlement.id}/approve-step1`)
      .set('Authorization', `Bearer ${reviewerToken}`);
    expect(step1.body.code).toBe(201);
    expect(step1.body.data.status).toBe(SettlementStatus.REVIEWER_APPROVED);

    const step2 = await request(ctx.app.getHttpServer())
      .post(`/api/settlements/${settlement.id}/approve-step2`)
      .set('Authorization', `Bearer ${financeToken}`);
    expect(step2.body.code).toBe(201);
    expect(step2.body.data.status).toBe(SettlementStatus.FINANCE_APPROVED);

    await ctx.dataSource.getRepository(Settlement).delete(settlement.id);
  });

  // ── SoD violation: same actor, different role token ─────────────────────────

  it('same actor who did step 1 is denied step 2 even with a finance_admin token', async () => {
    const settlement = await freshSettlement();
    const reviewerToken = makeToken(ctx.jwtService, opsReviewer.id, 'ops_reviewer', opsReviewer.username);
    // Simulate a user who somehow holds both roles — step2 token has finance_admin
    // role but the same subject (user id) as the step-1 approver.
    const sameActorFinanceToken = makeToken(ctx.jwtService, opsReviewer.id, 'finance_admin', opsReviewer.username);

    const step1 = await request(ctx.app.getHttpServer())
      .post(`/api/settlements/${settlement.id}/approve-step1`)
      .set('Authorization', `Bearer ${reviewerToken}`);
    expect(step1.body.code).toBe(201);

    const step2 = await request(ctx.app.getHttpServer())
      .post(`/api/settlements/${settlement.id}/approve-step2`)
      .set('Authorization', `Bearer ${sameActorFinanceToken}`);
    // The SoD policy must reject this regardless of the role on the token
    expect(step2.body.code).toBe(403);

    await ctx.dataSource.getRepository(Settlement).delete(settlement.id);
  });

  // ── Role enforcement ────────────────────────────────────────────────────────

  it('finance_admin cannot perform step 1 (requires ops_reviewer role)', async () => {
    const settlement = await freshSettlement();
    const financeToken = makeToken(ctx.jwtService, financeAdmin.id, 'finance_admin', financeAdmin.username);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/settlements/${settlement.id}/approve-step1`)
      .set('Authorization', `Bearer ${financeToken}`);
    expect(res.body.code).toBe(403);

    await ctx.dataSource.getRepository(Settlement).delete(settlement.id);
  });

  it('ops_reviewer cannot perform step 2 (requires finance_admin role)', async () => {
    const settlement = await freshSettlement();
    const reviewerToken = makeToken(ctx.jwtService, opsReviewer.id, 'ops_reviewer', opsReviewer.username);

    // First advance to REVIEWER_APPROVED
    await request(ctx.app.getHttpServer())
      .post(`/api/settlements/${settlement.id}/approve-step1`)
      .set('Authorization', `Bearer ${reviewerToken}`);

    // Now try step2 with ops_reviewer role
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/settlements/${settlement.id}/approve-step2`)
      .set('Authorization', `Bearer ${reviewerToken}`);
    expect(res.body.code).toBe(403);

    await ctx.dataSource.getRepository(Settlement).delete(settlement.id);
  });

  it('step 2 on a PENDING settlement (not yet reviewer-approved) is rejected (400)', async () => {
    const settlement = await freshSettlement();
    const financeToken = makeToken(ctx.jwtService, financeAdmin.id, 'finance_admin', financeAdmin.username);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/settlements/${settlement.id}/approve-step2`)
      .set('Authorization', `Bearer ${financeToken}`);
    expect(res.body.code).toBe(400);

    await ctx.dataSource.getRepository(Settlement).delete(settlement.id);
  });
});
