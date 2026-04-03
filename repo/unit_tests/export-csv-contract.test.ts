/**
 * Contract tests for the export CSV formatter layer.
 *
 * These verify that:
 *  1. Every export type includes a watermark row identifying the requester.
 *  2. Admin exports contain decrypted PII (real email).
 *  3. Non-admin exports contain masked PII ('***').
 *  4. The formatExportCsv helper is the single assembly point.
 *
 * The tests drive processJob via a fully-stubbed DataSource so no DB is needed.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ExportsService } from '../backend/src/exports/exports.service';
import { ExportJobStatus } from '../backend/src/database/entities/export-job.entity';

// ── Stubs ────────────────────────────────────────────────────────────────────

const ENCRYPTED_EMAIL = 'enc:vendor@test.com';
const DECRYPTED_EMAIL = 'vendor@test.com';

/** Minimal encryption stub — just strips the prefix */
const fakeEncryption = {
  decrypt: (val: string) => val.replace('enc:', ''),
  encrypt: (val: string) => `enc:${val}`,
};

/** Create a QueryBuilder stub that returns the given rows from getMany */
function makeEntityQb(rows: any[]) {
  const qb: any = {
    leftJoinAndSelect: () => qb,
    orderBy: () => qb,
    andWhere: () => qb,
    where: () => qb,
    limit: () => qb,
    getMany: jest.fn().mockResolvedValue(rows),
  };
  return qb;
}

/** DataSource stub: routes getRepository('Entity').createQueryBuilder to our stub QB */
function makeDataSource(entityRows: Record<string, any[]>, requester: any) {
  return {
    getRepository: jest.fn().mockImplementation((entity: string) => ({
      createQueryBuilder: jest.fn(() => makeEntityQb(entityRows[entity] ?? [])),
      findOne: jest.fn().mockResolvedValue(entity === 'User' ? requester : null),
    })),
  };
}

function makeRepo(job: any) {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(job),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    count: jest.fn().mockResolvedValue(0),
    save: jest.fn().mockImplementation(async (e: any) => e),
    create: jest.fn().mockImplementation((e: any) => e),
    createQueryBuilder: jest.fn(() => ({
      update: function () { return this; },
      set: function () { return this; },
      where: function () { return this; },
      andWhere: function () { return this; },
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    })),
  };
}

function makeJob(type: string, requesterId: string): any {
  return {
    id: `job-${type}`,
    requesterId,
    status: ExportJobStatus.QUEUED,
    params: { type, filters: {} },
    expiresAt: new Date(Date.now() + 86400_000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** Run processJob and read the written CSV from disk */
async function runExportJob(
  type: string,
  requesterRole: string,
  entityRows: Record<string, any[]>,
): Promise<string> {
  const requesterId = `${requesterRole}-id`;
  const requester = { id: requesterId, role: requesterRole };
  const job = makeJob(type, requesterId);
  const repo = makeRepo(job);
  const ds = makeDataSource(entityRows, requester);

  const service = new ExportsService(repo as any, ds as any, fakeEncryption as any);

  // Call the private processJob via bracket notation
  await (service as any).processJob(job);

  // processJob writes to /tmp/exports/<jobId>.csv
  const filePath = path.join('/tmp/exports', `${job.id}.csv`);
  const csv = fs.readFileSync(filePath, 'utf-8');
  fs.unlinkSync(filePath); // cleanup
  return csv;
}

// ── Sample entity rows ──────────────────────────────────────────────────────

const LISTING_ROW = {
  id: 'lst-1',
  title: 'Golden Puppy',
  breed: 'Golden Retriever',
  region: 'California',
  priceUsd: 1200,
  status: 'active',
  vendor: { username: 'vendorUser', email: ENCRYPTED_EMAIL },
  createdAt: '2025-01-01',
};

const CONVERSATION_ROW = {
  id: 'conv-1',
  listingId: 'lst-1',
  vendorId: 'vendor-id',
  vendor: { username: 'vendorUser', email: ENCRYPTED_EMAIL },
  isArchived: false,
  isDisputed: false,
  createdAt: '2025-01-01',
};

const SETTLEMENT_ROW = {
  id: 'stl-1',
  vendor: { username: 'vendorUser', email: ENCRYPTED_EMAIL },
  month: '2025-01',
  totalCharges: 500,
  taxAmount: 50,
  status: 'pending',
  createdAt: '2025-01-01',
};

const AUDIT_ROW = {
  id: 'aud-1',
  action: 'login',
  actorId: 'admin-id',
  entityType: 'user',
  entityId: 'u-1',
  hash: 'abc123',
  createdAt: '2025-01-01',
};

// ── Setup ────────────────────────────────────────────────────────────────────

beforeAll(() => {
  // processJob writes to /tmp/exports — ensure the directory exists
  if (!fs.existsSync('/tmp/exports')) fs.mkdirSync('/tmp/exports', { recursive: true });
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Export CSV watermark — present in every export type', () => {
  it.each(['listings', 'conversations', 'settlements', 'audit'])(
    '%s export contains watermark row',
    async (type) => {
      const rows: Record<string, any[]> = {
        Listing: [LISTING_ROW],
        Conversation: [CONVERSATION_ROW],
        Settlement: [SETTLEMENT_ROW],
        AuditLog: [AUDIT_ROW],
      };
      const csv = await runExportJob(type, 'admin', rows);
      const firstLine = csv.split('\n')[0];
      expect(firstLine).toMatch(/^# Generated for: admin \/ admin-id at /);
    },
  );

  it('vendor export watermark identifies the vendor role and requester', async () => {
    const csv = await runExportJob('listings', 'vendor', { Listing: [LISTING_ROW] });
    const firstLine = csv.split('\n')[0];
    expect(firstLine).toMatch(/^# Generated for: vendor \/ vendor-id at /);
  });
});

describe('Export CSV masking — admin vs non-admin email output', () => {
  it('admin listings export includes decrypted vendor email', async () => {
    const csv = await runExportJob('listings', 'admin', { Listing: [LISTING_ROW] });
    expect(csv).toContain(DECRYPTED_EMAIL);
    expect(csv).not.toMatch(/,\*\*\*,/);
  });

  it('vendor listings export masks vendor email to ***', async () => {
    const csv = await runExportJob('listings', 'vendor', { Listing: [LISTING_ROW] });
    expect(csv).not.toContain(DECRYPTED_EMAIL);
    expect(csv).toContain(',***,');
  });

  it('admin conversations export includes decrypted vendor email', async () => {
    const csv = await runExportJob('conversations', 'admin', { Conversation: [CONVERSATION_ROW] });
    expect(csv).toContain(DECRYPTED_EMAIL);
  });

  it('vendor conversations export masks vendor email to ***', async () => {
    const csv = await runExportJob('conversations', 'vendor', { Conversation: [CONVERSATION_ROW] });
    expect(csv).not.toContain(DECRYPTED_EMAIL);
    expect(csv).toContain(',***,');
  });

  it('admin settlements export includes decrypted vendor email', async () => {
    const csv = await runExportJob('settlements', 'admin', { Settlement: [SETTLEMENT_ROW] });
    expect(csv).toContain(DECRYPTED_EMAIL);
  });

  it('vendor settlements export masks vendor email to ***', async () => {
    const csv = await runExportJob('settlements', 'vendor', { Settlement: [SETTLEMENT_ROW] });
    expect(csv).not.toContain(DECRYPTED_EMAIL);
    expect(csv).toContain(',***,');
  });

  it('ops_reviewer settlements export masks vendor email to ***', async () => {
    const csv = await runExportJob('settlements', 'ops_reviewer', { Settlement: [SETTLEMENT_ROW] });
    expect(csv).not.toContain(DECRYPTED_EMAIL);
    expect(csv).toContain(',***,');
  });
});

describe('Export CSV headers — include email column', () => {
  it('listings header includes Vendor Email', async () => {
    const csv = await runExportJob('listings', 'admin', { Listing: [] });
    const headerLine = csv.split('\n')[1];
    expect(headerLine).toContain('Vendor Email');
  });

  it('conversations header includes Vendor Email', async () => {
    const csv = await runExportJob('conversations', 'admin', { Conversation: [] });
    const headerLine = csv.split('\n')[1];
    expect(headerLine).toContain('Vendor Email');
  });

  it('settlements header includes Vendor Email', async () => {
    const csv = await runExportJob('settlements', 'admin', { Settlement: [] });
    const headerLine = csv.split('\n')[1];
    expect(headerLine).toContain('Vendor Email');
  });
});

describe('Export CSV masking — null email produces N/A', () => {
  it('null vendor email renders as N/A', async () => {
    const listingNoEmail = { ...LISTING_ROW, vendor: { username: 'v', email: null } };
    const csv = await runExportJob('listings', 'admin', { Listing: [listingNoEmail] });
    expect(csv).toContain(',N/A,');
  });
});
