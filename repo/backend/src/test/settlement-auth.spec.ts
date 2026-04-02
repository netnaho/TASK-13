import * as request from 'supertest';
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
        passwordHash: 'hashed',
        role: 'vendor' as any,
        isActive: true,
      }),
    );

    vendorB = await userRepo.save(
      userRepo.create({
        username: 'test_vendor_b',
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
  });
});
