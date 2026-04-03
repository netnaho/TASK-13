/**
 * listing-access.spec.ts
 *
 * Risk: listings in pending_review status are directly retrievable by
 * non-owners via GET /listings/:id, bypassing the visibility policy.
 *
 * Covers:
 *   - anonymous caller → 404 for pending listing
 *   - shopper → 404
 *   - non-owner vendor → 404
 *   - owner vendor → 200
 *   - admin → 200
 *   - ACTIVE listing is visible to everyone (control)
 */
import * as request from 'supertest';
import { createTestApp, makeToken, TestContext } from './test-utils';
import { User } from '../database/entities/user.entity';
import { Listing, ListingStatus } from '../database/entities/listing.entity';
import { createTestUser, createTestListing, cleanupAll } from './test-fixtures';

describe('Pending-review listing direct retrieval denied to non-owners', () => {
  let ctx: TestContext;
  let ownerVendor: User;
  let otherVendor: User;
  let shopper: User;
  let adminUser: User;
  let pendingListing: Listing;
  let activeListing: Listing;

  beforeAll(async () => {
    ctx = await createTestApp();
    const ds = ctx.dataSource;

    ownerVendor = await createTestUser(ds, 'vendor');
    otherVendor = await createTestUser(ds, 'vendor');
    shopper = await createTestUser(ds, 'shopper');
    adminUser = await createTestUser(ds, 'admin');

    pendingListing = await createTestListing(ds, ownerVendor.id, ListingStatus.PENDING_REVIEW);
    activeListing = await createTestListing(ds, ownerVendor.id, ListingStatus.ACTIVE);
  }, 30000);

  afterAll(async () => {
    await cleanupAll(ctx.dataSource, [
      { entity: Listing, ids: [pendingListing?.id, activeListing?.id].filter(Boolean) as string[] },
      { entity: User, ids: [ownerVendor?.id, otherVendor?.id, shopper?.id, adminUser?.id].filter(Boolean) as string[] },
    ]);
    await ctx.app.close();
  });

  // ── Denial cases ────────────────────────────────────────────────────────────

  it('anonymous caller cannot retrieve a pending_review listing (404)', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/listings/${pendingListing.id}`);
    // No auth guard on this endpoint — visibility is enforced inside the service
    expect(res.body.code).toBe(404);
  });

  it('shopper cannot retrieve a pending_review listing (404)', async () => {
    const token = makeToken(ctx.jwtService, shopper.id, 'shopper', shopper.username);
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/listings/${pendingListing.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.code).toBe(404);
  });

  it('non-owner vendor cannot retrieve a pending_review listing (404)', async () => {
    const token = makeToken(ctx.jwtService, otherVendor.id, 'vendor', otherVendor.username);
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/listings/${pendingListing.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.code).toBe(404);
  });

  // ── Allowed cases ───────────────────────────────────────────────────────────

  it('owner vendor can retrieve their own pending_review listing (200)', async () => {
    const token = makeToken(ctx.jwtService, ownerVendor.id, 'vendor', ownerVendor.username);
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/listings/${pendingListing.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.code).toBe(200);
    expect(res.body.data.id).toBe(pendingListing.id);
  });

  it('admin can retrieve any pending_review listing (200)', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/listings/${pendingListing.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.code).toBe(200);
  });

  // ── Control: active listing is public ───────────────────────────────────────

  it('active listing is visible to anonymous caller (200)', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/listings/${activeListing.id}`);
    expect(res.body.code).toBe(200);
  });

  it('active listing is visible to shopper (200)', async () => {
    const token = makeToken(ctx.jwtService, shopper.id, 'shopper', shopper.username);
    const res = await request(ctx.app.getHttpServer())
      .get(`/api/listings/${activeListing.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.code).toBe(200);
  });
});
