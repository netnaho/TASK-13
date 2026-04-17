/**
 * settlement-auth.spec.ts
 *
 * Object-level authorization for settlement read and CSV export endpoints.
 *
 * Covers:
 *   - Cross-vendor read denied (403)
 *   - Cross-vendor export denied (403)
 *   - Owner reads own settlement (200, correct shape)
 *   - Owner exports own FINANCE_APPROVED settlement (200, CSV headers+body)
 *   - Admin exports any settlement (200, full decrypted data in CSV)
 */
import request from 'supertest';
import { createTestApp, makeToken, TestContext } from './test-utils';
import { User } from '../database/entities/user.entity';
import { Settlement, SettlementStatus } from '../database/entities/settlement.entity';

describe('Settlement Object-Level Authorization', () => {
  let ctx: TestContext;
  let vendorA: User;
  let vendorB: User;
  let settlementB: Settlement;

  beforeAll(async () => {
    ctx = await createTestApp();

    const userRepo = ctx.dataSource.getRepository(User);
    const settlementRepo = ctx.dataSource.getRepository(Settlement);

    // Ensure two vendor users exist
    vendorA = await userRepo.save(
      userRepo.create({
        username: 'test_vendor_a',
        email: 'test_vendor_a@test.local',
        passwordHash: 'hashed',
        role: 'vendor' as any,
        isActive: true,
      }),
    );

    vendorB = await userRepo.save(
      userRepo.create({
        username: 'test_vendor_b',
        email: 'test_vendor_b@test.local',
        passwordHash: 'hashed',
        role: 'vendor' as any,
        isActive: true,
      }),
    );

    // Create a settlement belonging to vendor B
    settlementB = await settlementRepo.save(
      settlementRepo.create({
        vendorId: vendorB.id,
        month: '2025-01',
        totalCharges: 100,
        taxAmount: 8.5,
        status: SettlementStatus.PENDING,
      }),
    );
  }, 30000);

  afterAll(async () => {
    // Clean up test data
    const settlementRepo = ctx.dataSource.getRepository(Settlement);
    const userRepo = ctx.dataSource.getRepository(User);
    await settlementRepo.delete({ vendorId: vendorA.id });
    await settlementRepo.delete({ vendorId: vendorB.id });
    await userRepo.delete(vendorA.id);
    await userRepo.delete(vendorB.id);
    await ctx.app.close();
  });

  it('should deny vendor A from reading vendor B settlement', async () => {
    const token = makeToken(ctx.jwtService, vendorA.id, 'vendor', 'test_vendor_a');

    const res = await request(ctx.app.getHttpServer())
      .get(`/api/settlements/${settlementB.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(403);
  });

  it('should deny vendor A from exporting vendor B settlement', async () => {
    const token = makeToken(ctx.jwtService, vendorA.id, 'vendor', 'test_vendor_a');

    const res = await request(ctx.app.getHttpServer())
      .get(`/api/settlements/export/${settlementB.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(403);
  });

  it('should allow vendor B to read their own settlement', async () => {
    const token = makeToken(ctx.jwtService, vendorB.id, 'vendor', 'test_vendor_b');

    const res = await request(ctx.app.getHttpServer())
      .get(`/api/settlements/${settlementB.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(200);
    expect(res.body.data.settlement.id).toBe(settlementB.id);
    expect(res.body.data.settlement.vendorId).toBe(vendorB.id);
    expect(res.body.data.variance).toBeDefined();
    expect(typeof res.body.data.variance.expected).toBe('number');
  });

  // ── Export CSV — success paths ─────────────────────────────────────────────

  it('GET /api/settlements/export/:id — vendor B exports own FINANCE_APPROVED settlement → 200 CSV', async () => {
    // Upgrade to FINANCE_APPROVED so the export gate passes.
    await ctx.dataSource
      .getRepository(Settlement)
      .update(settlementB.id, { status: SettlementStatus.FINANCE_APPROVED });

    const token = makeToken(ctx.jwtService, vendorB.id, 'vendor', 'test_vendor_b');

    const res = await request(ctx.app.getHttpServer())
      .get(`/api/settlements/export/${settlementB.id}`)
      .set('Authorization', `Bearer ${token}`);

    // HTTP 200 (direct res.send bypass — ResponseInterceptor not applied)
    expect(res.status).toBe(200);

    // Headers
    expect(res.headers['content-type']).toMatch(/text\/csv/i);
    expect(res.headers['content-disposition']).toMatch(
      new RegExp(`attachment.*settlement-${settlementB.id}\\.csv`, 'i'),
    );

    // Body is raw CSV string
    const csv: string = res.text;
    expect(typeof csv).toBe('string');
    expect(csv.length).toBeGreaterThan(0);

    // Column-header row
    expect(csv).toContain('Vendor ID');
    expect(csv).toContain('Month');
    expect(csv).toContain('Total Charges');
    expect(csv).toContain('Tax Amount');
    expect(csv).toContain('Status');

    // CONFIDENTIAL watermark contains the requester username
    expect(csv).toContain('CONFIDENTIAL');
    expect(csv).toContain('test_vendor_b');

    // Data row values
    expect(csv).toContain(settlementB.vendorId);
    expect(csv).toContain('finance_approved');
    expect(csv).toContain('2025-01');
  });

  it('GET /api/settlements/export/:id — admin exports any settlement → 200 CSV with unmasked email', async () => {
    // settlementB is already FINANCE_APPROVED from the previous test.
    const adminUser = await ctx.dataSource.getRepository(User).save(
      ctx.dataSource.getRepository(User).create({
        username: 'test_admin_export',
        email: 'test_admin_export@test.local',
        passwordHash: 'hashed',
        role: 'admin' as any,
        isActive: true,
      }),
    );

    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', 'test_admin_export');

    const res = await request(ctx.app.getHttpServer())
      .get(`/api/settlements/export/${settlementB.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/i);
    expect(res.text).toContain('CONFIDENTIAL');
    expect(res.text).toContain('test_admin_export');
    expect(res.text).toContain('finance_approved');

    await ctx.dataSource.getRepository(User).delete(adminUser.id);
  });

  it('GET /api/settlements/export/:id — export PENDING settlement → 400 (not approved yet)', async () => {
    // Create a separate PENDING settlement to test the status guard.
    const pendingSettlement = await ctx.dataSource.getRepository(Settlement).save(
      ctx.dataSource.getRepository(Settlement).create({
        vendorId: vendorA.id,
        month: '2025-03',
        totalCharges: 50,
        taxAmount: 4.25,
        status: SettlementStatus.PENDING,
      }),
    );

    const token = makeToken(ctx.jwtService, vendorA.id, 'vendor', 'test_vendor_a');

    const res = await request(ctx.app.getHttpServer())
      .get(`/api/settlements/export/${pendingSettlement.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(400);

    await ctx.dataSource.getRepository(Settlement).delete(pendingSettlement.id);
  });
});
