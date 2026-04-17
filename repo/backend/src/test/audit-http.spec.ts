/**
 * audit-http.spec.ts
 *
 * Closes coverage gaps for audit HTTP endpoints that previously had only
 * guard-denial (401/403) coverage.
 *
 * Endpoints covered:
 *   GET  /api/audit                    (admin paginated audit log — AuditController)
 *   POST /api/admin/audit/retention    (admin triggers retention archival job)
 *   POST /api/admin/audit/export       (admin queues audit export job)
 *
 * Negative cases:
 *   - Unauthenticated GET /api/audit → 401.
 *   - Non-admin (vendor) GET /api/audit → 403.
 *   - Non-admin POST retention → 403.
 *   - Non-admin POST export → 403.
 */
import request from 'supertest';
import { createTestApp, makeToken, TestContext } from './test-utils';
import { User } from '../database/entities/user.entity';
import { ExportJob } from '../database/entities/export-job.entity';
import { createTestUser, cleanup } from './test-fixtures';

describe('Audit HTTP success paths — GET /audit, POST retention, POST export', () => {
  let ctx: TestContext;
  let adminUser: User;
  let vendorUser: User;

  const createdExportJobIds: string[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    adminUser  = await createTestUser(ctx.dataSource, 'admin');
    vendorUser = await createTestUser(ctx.dataSource, 'vendor');

    // Create at least one audit log entry so findAll has data to return.
    // The seed + app bootstrap already create entries; this is a safety net.
    await ctx.dataSource.getRepository('audit_logs').save(
      ctx.dataSource.getRepository('audit_logs').create({
        action: 'test.audit_http_spec',
        actorId: adminUser.id,
        entityType: 'test',
        entityId: null,
        before: null,
        after: { note: 'audit-http.spec setup' },
        hash: 'test-hash-' + Date.now(),
        prevHash: null,
      }),
    );
  }, 30000);

  afterAll(async () => {
    if (createdExportJobIds.length) {
      await ctx.dataSource
        .getRepository(ExportJob)
        .delete(createdExportJobIds)
        .catch(() => {/* ignore */});
    }
    await cleanup(ctx.dataSource, User, adminUser?.id, vendorUser?.id);
    await ctx.app.close();
  });

  // ── GET /api/audit — auth gates ───────────────────────────────────────────

  it('GET /api/audit — unauthenticated → 401', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/audit');
    expect(res.body.code).toBe(401);
  });

  it('GET /api/audit — vendor role → 403', async () => {
    const token = makeToken(ctx.jwtService, vendorUser.id, 'vendor', vendorUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get('/api/audit')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.code).toBe(403);
  });

  // ── GET /api/audit — success ──────────────────────────────────────────────

  it('GET /api/audit — admin receives paginated audit log (200)', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get('/api/audit')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(200);
    // Returns { items: AuditLog[], total: number }
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(typeof res.body.data.total).toBe('number');
    expect(res.body.data.total).toBeGreaterThan(0);
    // Each item has required audit fields
    const first = res.body.data.items[0];
    expect(first.id).toBeDefined();
    expect(first.action).toBeDefined();
    expect(first.hash).toBeDefined();
  });

  it('GET /api/audit — pagination params are accepted (200)', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .get('/api/audit?page=1&limit=5')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.length).toBeLessThanOrEqual(5);
  });

  // ── POST /api/admin/audit/retention — auth gates ──────────────────────────

  it('POST /api/admin/audit/retention — vendor role → 403', async () => {
    const token = makeToken(ctx.jwtService, vendorUser.id, 'vendor', vendorUser.username);
    const res = await request(ctx.app.getHttpServer())
      .post('/api/admin/audit/retention')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.code).toBe(403);
  });

  // ── POST /api/admin/audit/retention — success ─────────────────────────────

  it('POST /api/admin/audit/retention — admin dry-run returns retention result (200)', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .post('/api/admin/audit/retention?dryRun=true')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(200);
    // RetentionRunResult shape
    const result = res.body.data;
    expect(result.dryRun).toBe(true);
    expect(typeof result.processed).toBe('number');
    expect(typeof result.archived).toBe('number');
    expect(result.cutoff).toBeDefined();
  });

  it('POST /api/admin/audit/retention — admin real run returns retention result (200)', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .post('/api/admin/audit/retention')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.code).toBe(200);
    const result = res.body.data;
    expect(result.dryRun).toBe(false);
    expect(typeof result.processed).toBe('number');
    expect(typeof result.archived).toBe('number');
  });

  // ── POST /api/admin/audit/export — auth gates ─────────────────────────────

  it('POST /api/admin/audit/export — vendor role → 403', async () => {
    const token = makeToken(ctx.jwtService, vendorUser.id, 'vendor', vendorUser.username);
    const res = await request(ctx.app.getHttpServer())
      .post('/api/admin/audit/export')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.body.code).toBe(403);
  });

  // ── POST /api/admin/audit/export — success ────────────────────────────────

  it('POST /api/admin/audit/export — admin queues audit export job (200)', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .post('/api/admin/audit/export')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.body.code).toBe(200);
    const job = res.body.data;
    expect(job.id).toBeDefined();
    expect(job.status).toBe('queued');
    expect(job.requesterId).toBe(adminUser.id);
    expect(job.params?.type).toBe('audit');
    createdExportJobIds.push(job.id);
  });

  it('POST /api/admin/audit/export — admin queues filtered audit export (200)', async () => {
    const token = makeToken(ctx.jwtService, adminUser.id, 'admin', adminUser.username);
    const res = await request(ctx.app.getHttpServer())
      .post('/api/admin/audit/export')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'listing.create', entityType: 'listing' });

    expect(res.body.code).toBe(200);
    const job = res.body.data;
    expect(job.id).toBeDefined();
    expect(job.status).toBe('queued');
    expect(job.params?.filters?.action).toBe('listing.create');
    createdExportJobIds.push(job.id);
  });
});
