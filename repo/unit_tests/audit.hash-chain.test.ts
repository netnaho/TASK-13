import * as crypto from 'crypto';

interface AuditEntry {
  action: string;
  actorId: string;
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  hash: string;
  prevHash: string | null;
  createdAt: Date;
}

function computeHash(entry: Omit<AuditEntry, 'hash'>, prevHash: string | null): string {
  const payload = (prevHash ?? '') + JSON.stringify({
    action: entry.action,
    actorId: entry.actorId,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ts: entry.createdAt.toISOString(),
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function verifyEntry(entry: AuditEntry): boolean {
  const recomputed = computeHash(entry, entry.prevHash);
  return recomputed === entry.hash;
}

function createEntry(
  action: string,
  prevHash: string | null,
  time: Date,
): AuditEntry {
  const base = {
    action,
    actorId: 'user-1',
    entityType: 'listing',
    entityId: 'listing-1',
    before: null,
    after: { title: 'test' },
    prevHash,
    createdAt: time,
  };
  const hash = computeHash(base, prevHash);
  return { ...base, hash };
}

describe('AuditHashChain', () => {
  it('first entry hash computed from null prevHash', () => {
    const entry = createEntry('create', null, new Date('2024-01-01T00:00:00Z'));
    expect(entry.prevHash).toBeNull();
    expect(entry.hash).toHaveLength(64);
    expect(verifyEntry(entry)).toBe(true);
  });

  it('chain: entry N prevHash = entry N-1 hash', () => {
    const entry1 = createEntry('create', null, new Date('2024-01-01T00:00:00Z'));
    const entry2 = createEntry('update', entry1.hash, new Date('2024-01-01T01:00:00Z'));
    const entry3 = createEntry('delete', entry2.hash, new Date('2024-01-01T02:00:00Z'));

    expect(entry2.prevHash).toBe(entry1.hash);
    expect(entry3.prevHash).toBe(entry2.hash);
    expect(verifyEntry(entry1)).toBe(true);
    expect(verifyEntry(entry2)).toBe(true);
    expect(verifyEntry(entry3)).toBe(true);
  });

  it('tamper detection: modifying content breaks hash', () => {
    const entry = createEntry('create', null, new Date('2024-01-01T00:00:00Z'));
    expect(verifyEntry(entry)).toBe(true);

    const tampered = { ...entry, action: 'TAMPERED' };
    expect(verifyEntry(tampered)).toBe(false);
  });

  it('tamper detection: modifying after data breaks hash', () => {
    const entry = createEntry('create', null, new Date('2024-01-01T00:00:00Z'));
    const tampered = { ...entry, after: { title: 'hacked' } };
    expect(verifyEntry(tampered)).toBe(false);
  });

  it('tamper detection: modifying prevHash breaks hash', () => {
    const entry1 = createEntry('create', null, new Date('2024-01-01T00:00:00Z'));
    const entry2 = createEntry('update', entry1.hash, new Date('2024-01-01T01:00:00Z'));

    const tampered2 = { ...entry2, prevHash: 'fakehash' };
    expect(verifyEntry(tampered2)).toBe(false);
  });

  it('different timestamps produce different hashes', () => {
    const entry1 = createEntry('create', null, new Date('2024-01-01T00:00:00Z'));
    const entry2 = createEntry('create', null, new Date('2024-01-01T00:00:01Z'));
    expect(entry1.hash).not.toBe(entry2.hash);
  });
});
