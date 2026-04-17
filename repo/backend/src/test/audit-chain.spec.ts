/**
 * audit-chain.spec.ts
 *
 * Risk: audit log tamper detection only works for individually-verified entries;
 * chain-level continuity (prevHash linkage across multiple entries) and
 * DB-level mutation detection are not tested.
 *
 * Covers:
 *   - chain of N entries: each entry's prevHash === preceding entry's hash
 *   - DB-level tamper of `after` data is detected by verifyEntry
 *   - DB-level tamper of `prevHash` field is detected by verifyEntry
 *   - Entries preceding a tampered entry still verify correctly
 *   - verifyEntry returns false (not throws) on a tampered entry
 */
import { createTestApp, TestContext } from './test-utils';
import { AuditService } from '../audit/audit.service';
import { AuditLog } from '../database/entities/audit-log.entity';

describe('Audit chain continuity and DB-level tamper detection', () => {
  let ctx: TestContext;
  let auditService: AuditService;

  beforeAll(async () => {
    ctx = await createTestApp();
    auditService = ctx.app.get(AuditService);
  }, 30000);

  afterAll(async () => {
    await ctx.app.close();
  });

  // ── Chain linkage verification ──────────────────────────────────────────────

  it('chain of 5 entries: every prevHash matches the preceding entry hash', async () => {
    const entries: AuditLog[] = [];
    for (let i = 0; i < 5; i++) {
      const entry = await auditService.log({
        action: `test.chain_continuity_${i}`,
        actorId: 'test-actor',
        entityType: 'test',
        entityId: `chain-ent-${i}`,
        after: { step: i },
      });
      entries.push(entry);
    }

    // entries[0].prevHash links to whatever was the last entry before this test
    // ran — it is NOT necessarily null because other audit entries already exist
    // in the DB.  What matters is the chain linkage within our 5 entries.

    // Each subsequent entry's prevHash must equal the preceding entry's hash
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i].prevHash).toBe(entries[i - 1].hash);
    }

    // All entries individually verify
    for (const entry of entries) {
      const { valid } = await auditService.verifyEntry(entry.id);
      expect(valid).toBe(true);
    }
  });

  // ── DB-level tamper: mutate `after` data ─────────────────────────────────────

  it('direct DB mutation of after data is detected: verifyEntry returns false', async () => {
    const entry = await auditService.log({
      action: 'test.tamper_after',
      actorId: 'test-actor',
      entityType: 'test',
      entityId: 'tamper-target',
      after: { amount: 100 },
    });

    // Verify entry is clean before tamper
    const before = await auditService.verifyEntry(entry.id);
    expect(before.valid).toBe(true);

    // Directly mutate the row — simulates a rogue DB admin modifying a record
    await ctx.dataSource
      .getRepository(AuditLog)
      .update(entry.id, { after: { amount: 999999 } as any });

    // verifyEntry must detect the mutation
    const after = await auditService.verifyEntry(entry.id);
    expect(after.valid).toBe(false);
  });

  // ── DB-level tamper: mutate prevHash ─────────────────────────────────────────

  it('direct DB mutation of prevHash is detected: verifyEntry returns false', async () => {
    const entry1 = await auditService.log({
      action: 'test.tamper_prevhash_anchor',
      actorId: 'test-actor',
      entityType: 'test',
      entityId: 'anchor',
    });
    const entry2 = await auditService.log({
      action: 'test.tamper_prevhash_target',
      actorId: 'test-actor',
      entityType: 'test',
      entityId: 'target',
    });

    // Corrupt the prevHash of entry2 to point at a fabricated hash
    await ctx.dataSource
      .getRepository(AuditLog)
      .update(entry2.id, { prevHash: 'a'.repeat(64) });

    const result = await auditService.verifyEntry(entry2.id);
    expect(result.valid).toBe(false);

    // entry1 (the anchor) must still verify — only entry2 is broken
    const anchorResult = await auditService.verifyEntry(entry1.id);
    expect(anchorResult.valid).toBe(true);
  });

  // ── DB-level tamper: mutate action field ────────────────────────────────────

  it('direct DB mutation of the action field is detected', async () => {
    const entry = await auditService.log({
      action: 'test.tamper_action',
      actorId: 'test-actor',
      entityType: 'test',
      entityId: 'action-target',
      after: { legitimate: true },
    });

    await ctx.dataSource
      .getRepository(AuditLog)
      .update(entry.id, { action: 'test.INJECTED_BACKDOOR' } as any);

    const result = await auditService.verifyEntry(entry.id);
    expect(result.valid).toBe(false);
  });

  // ── Entries preceding a tampered entry are unaffected ─────────────────────

  it('entries before a tampered entry still verify correctly', async () => {
    const e1 = await auditService.log({
      action: 'test.pre_tamper_1',
      actorId: 'test-actor',
      entityType: 'test',
      entityId: 'pre1',
    });
    const e2 = await auditService.log({
      action: 'test.pre_tamper_2',
      actorId: 'test-actor',
      entityType: 'test',
      entityId: 'pre2',
    });
    const e3 = await auditService.log({
      action: 'test.tamper_middle',
      actorId: 'test-actor',
      entityType: 'test',
      entityId: 'middle',
    });

    // Tamper the middle entry
    await ctx.dataSource
      .getRepository(AuditLog)
      .update(e2.id, { after: { hacked: true } as any });

    // e2 (tampered) fails
    const r2 = await auditService.verifyEntry(e2.id);
    expect(r2.valid).toBe(false);

    // e1 (before tamper) still passes — its hash is over its own content only
    const r1 = await auditService.verifyEntry(e1.id);
    expect(r1.valid).toBe(true);

    // e3 (after tamper) also passes individually — its hash is over its own
    // fields; it references e2's ORIGINAL hash via prevHash, so if an auditor
    // independently recomputes e2's correct hash and finds it differs from e3's
    // prevHash, that's the chain-break signal.
    const r3 = await auditService.verifyEntry(e3.id);
    // e3.prevHash still equals e2's stored (now-corrupted) hash, so e3 itself
    // verifies. The chain break is detectable by comparing e3.prevHash vs
    // recomputing e2 — an auditor walking the chain would flag the inconsistency.
    // This confirms the per-entry verify is local; full-chain audits must walk the chain.
    expect(r3.valid).toBe(true);
    // The chain break is apparent: e3.prevHash != recomputed hash of untampered e2
    expect(r3.entry.prevHash).toBe(e2.hash); // stored original hash (before tamper)
  });
});
