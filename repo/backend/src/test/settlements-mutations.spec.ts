/**
 * settlements-mutations.spec.ts
 *
 * Closes coverage gaps for settlement mutation endpoints that previously had
 * only guard-denial (401/403) coverage.
 *
 * Endpoints covered:
 *   GET  /api/settlements                (admin list success)
 *   POST /api/settlements/:id/reject     (ops_reviewer, finance_admin, admin success)
 *   POST /api/settlements/:id/reconcile  (admin and finance_admin success)
 *
 * Negative cases:
 *   - Vendor cannot reject → 403.
 *   - Shopper cannot access settlements list → 403.
 *   - Reject non-existent settlement → 404.
 *   - Reconcile non-existent settlement → 404.
 */
import request from 'supertest';
import { createTestApp, makeToken, TestContext } from './test-utils';
import { User } from '../database/entities/user.entity';
import { Listing } from '../database/entities/listing.entity';
import { Settlement, SettlementStatus } from '../database/entities/settlement.entity';
import {
  createTestUser,
  createTestListing,
  createTestSettlement,
  cleanupAll,
} from './test-fixtures';

const FAKE_UUID = '00000000-0000-4000-a000-000000000020';

describe('Settlements mutation success paths — reject & reconcile', () => {
  let ctx: TestContext;
  let adminUser: User;
  let opsReviewer: User;
  let financeAdmin: User;
  let vendorUser: User;
  let shopperUser: User;
  let listing: Listing;

  const extraSettlementIds: string[] = [];
  let monthCounter = 0;

  async function freshSettlement(): Promise<Settlement> {
    monthCounter++;
    // Use far-future years with a counter to guarantee unique (vendorId, month) pairs.
    const year = 2800 + Math.floor(monthCounter / 12);
    const month = (monthCounter % 12) + 1;
    const uniqueMonth = `${year}-${String(month).padStart(2, '0')}`;
    const s = await createTestSettlement(ctx.dataSource, vendorUser.id, { month: uniqueMonth });
    extraSettlementIds.push(s.id);
    return s;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    const ds = ctx.dataSource;

    adminUser    = await createTestUser(ds, 'admin');
    opsReviewer  = await createTestUser(ds, 'ops_reviewer');
    financeAdmin = await createTestUser(ds, 'finance_admin');
    vendorUser   = await createTestUser(ds, 'vendor');
    shopperUser  = await createTestUser(ds, 'shopper');
    listing      = await createTestListing(ds, vendorUser.id);
  }, 30000);

  afterAll(async () => {
    if (extraSettlementIds.length) {
      await ctx.dataSource
        .getRepository(Settlement)
        .delete(extraSettlementIds)
        .catch(() => {/* ignore */});
    }
    await cleanupAll(ctx.dataSource, [
      { entity: Listing, ids: [listing?.id].filter(Boolean) as string[] },
      { entity: User, ids: [adminUser?.id, opsReviewer?.id, financeAdmin?.id, vendorUser?.id, shopperUser?.id].filter(Boolean) as string[] },
    ]);
    await ctx.app.close();
  });

  // ── GET /settlements — admin list ──────────────────────────────────────────

  it('GET /api/settlements — admin receives full list (200, array)', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get('/api/settlements')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /api/settlements — shopper role → 403', async () => {
    const token = makeToken(ctx.jwtService, shopperUser.id, 'shopper', shopperUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get('/api/settlements')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.code).toBe(403);
  });

  // ── POST /settlements/:id/reject ───────────────────────────────────────────

  it('ops_reviewer can reject a PENDING settlement → 200, status=rejected', async () => {
    const settlement = await freshSettlement();
    const token = makeToken(ctx.jwtService, opsReviewer.id, 'ops_reviewer', opsReviewer.username);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/settlements/${settlement.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Incorrect charges' });

    expect(res.body.code).toBe(200);
    expect(res.body.data.status).toBe(SettlementStatus.REJECTED);
    expect(res.body.data.data.rejectedReason).toBe('Incorrect charges');
  });

  it('finance_admin can reject a PENDING settlement → 200', async () => {
    const settlement = await freshSettlement();
    const token = makeToken(ctx.jwtService, financeAdmin.id, 'finance_admin', financeAdmin.username);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/settlements/${settlement.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Finance review failed' });

    expect(res.body.code).toBe(200);
    expect(res.body.data.status).toBe(SettlementStatus.REJECTED);
  });

  it('admin can reject a settlement → 200', async () => {
    const settlement = await freshSettlement();
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/settlements/${settlement.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Admin override' });

    expect(res.body.code).toBe(200);
    expect(res.body.data.status).toBe(SettlementStatus.REJECTED);
  });

  it('vendor cannot reject a settlement → 403', async () => {
    const settlement = await freshSettlement();
    const token = makeToken(ctx.jwtService, vendorUser.id, 'vendor', vendorUser.username);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/settlements/${settlement.id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Should not work' });

    expect(res.body.code).toBe(403);
  });

  it('reject non-existent settlement → 404', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/settlements/${FAKE_UUID}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'ghost' });
    expect(res.body.code).toBe(404);
  });

  // ── POST /settlements/:id/reconcile ────────────────────────────────────────

  it('admin can reconcile a settlement with actual charges → 200', async () => {
    const settlement = await freshSettlement();
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/settlements/${settlement.id}/reconcile`)
      .set('Authorization', `Bearer ${token}`)
      .send({ actualCharges: 120.50, notes: 'Verified by accounts' });

    expect(res.body.code).toBe(200);
    expect(res.body.data.data.actualCharges).toBeCloseTo(120.50, 1);
    expect(res.body.data.data.reconciliationNotes).toBe('Verified by accounts');
  });

  it('finance_admin can reconcile a settlement → 200', async () => {
    const settlement = await freshSettlement();
    const token = makeToken(ctx.jwtService, financeAdmin.id, 'finance_admin', financeAdmin.username);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/settlements/${settlement.id}/reconcile`)
      .set('Authorization', `Bearer ${token}`)
      .send({ actualCharges: 95.00 });

    expect(res.body.code).toBe(200);
    expect(res.body.data.data.actualCharges).toBeCloseTo(95.00, 1);
  });

  it('reconcile without notes field still succeeds → 200', async () => {
    const settlement = await freshSettlement();
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/settlements/${settlement.id}/reconcile`)
      .set('Authorization', `Bearer ${token}`)
      .send({ actualCharges: 100 });

    expect(res.body.code).toBe(200);
    expect(res.body.data.data.actualCharges).toBeCloseTo(100, 1);
  });

  it('reconcile non-existent settlement → 404', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .post(`/api/settlements/${FAKE_UUID}/reconcile`)
      .set('Authorization', `Bearer ${token}`)
      .send({ actualCharges: 50 });
    expect(res.body.code).toBe(404);
  });
});
