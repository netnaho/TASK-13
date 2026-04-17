import request from 'supertest';
import { createTestApp, makeToken, TestContext } from './test-utils';
import { User } from '../database/entities/user.entity';

describe('Power Query Tenant Isolation', () => {
  let ctx: TestContext;
  let vendor: User;

  beforeAll(async () => {
    ctx = await createTestApp();

    const userRepo = ctx.dataSource.getRepository(User);
    vendor = await userRepo.save(
      userRepo.create({
        username: 'test_query_vendor',
        email: 'test_query_vendor@test.local',
        passwordHash: 'hashed',
        role: 'vendor' as any,
        isActive: true,
      }),
    );
  }, 30000);

  afterAll(async () => {
    const userRepo = ctx.dataSource.getRepository(User);
    await userRepo.delete(vendor.id);
    await ctx.app.close();
  });

  it('should deny vendor from querying users entity', async () => {
    const token = makeToken(ctx.jwtService, vendor.id, 'vendor', 'test_query_vendor');

    const res = await request(ctx.app.getHttpServer())
      .post('/api/query')
      .set('Authorization', `Bearer ${token}`)
      .send({ entity: 'users', page: 1, limit: 10 });

    expect(res.body.code).toBe(403);
  });

  it('should deny vendor from querying conversations entity', async () => {
    const token = makeToken(ctx.jwtService, vendor.id, 'vendor', 'test_query_vendor');

    const res = await request(ctx.app.getHttpServer())
      .post('/api/query')
      .set('Authorization', `Bearer ${token}`)
      .send({ entity: 'conversations', page: 1, limit: 10 });

    expect(res.body.code).toBe(403);
  });

  it('should allow vendor to query own listings', async () => {
    const token = makeToken(ctx.jwtService, vendor.id, 'vendor', 'test_query_vendor');

    const res = await request(ctx.app.getHttpServer())
      .post('/api/query')
      .set('Authorization', `Bearer ${token}`)
      .send({ entity: 'listings', page: 1, limit: 10 });

    expect(res.body.code).toBe(200);
  });
});
