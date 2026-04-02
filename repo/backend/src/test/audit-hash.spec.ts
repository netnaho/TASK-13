import { createTestApp, TestContext } from './test-utils';
import { AuditService } from '../audit/audit.service';

describe('Audit Hash Chain Integrity', () => {
  let ctx: TestContext;
  let auditService: AuditService;

  beforeAll(async () => {
    ctx = await createTestApp();
    auditService = ctx.app.get(AuditService);
  }, 30000);

  afterAll(async () => {
    await ctx.app.close();
  });

  it('should verify an untampered audit entry as valid', async () => {
    const entry = await auditService.log({
      action: 'test.integrity_check',
      actorId: 'test-actor-id',
      entityType: 'test',
      entityId: 'test-entity-id',
      after: { foo: 'bar' },
    });

    const result = await auditService.verifyEntry(entry.id);
    expect(result.valid).toBe(true);
    expect(result.entry.id).toBe(entry.id);
  });

  it('should verify multiple chained entries as valid', async () => {
    const entry1 = await auditService.log({
      action: 'test.chain_1',
      actorId: 'test-actor-id',
      entityType: 'test',
      entityId: 'chain-1',
    });

    const entry2 = await auditService.log({
      action: 'test.chain_2',
      actorId: 'test-actor-id',
      entityType: 'test',
      entityId: 'chain-2',
    });

    const result1 = await auditService.verifyEntry(entry1.id);
    const result2 = await auditService.verifyEntry(entry2.id);

    expect(result1.valid).toBe(true);
    expect(result2.valid).toBe(true);
    expect(result2.entry.prevHash).toBeDefined();
  });
});
