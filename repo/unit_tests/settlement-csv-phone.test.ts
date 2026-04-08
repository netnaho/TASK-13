/**
 * settlement-csv-phone.test.ts
 *
 * Tests that SettlementsService.exportCsv() derives the CSV Phone column from
 * the vendor's dedicated `phone` field — never from `deviceFingerprint`.
 *
 * Coverage
 * --------
 *  1. Admin sees the full decrypted phone number.
 *  2. Non-admin (vendor, ops_reviewer) sees last-4-masked phone.
 *  3. When `phone` is null/absent the cell is an empty string (not 'N/A',
 *     not any value from `deviceFingerprint`).
 *  4. A non-null `deviceFingerprint` on the vendor does NOT leak into Phone.
 *  5. Email masking contract is unchanged (regression guard).
 */

import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { SettlementsService } from '../backend/src/settlements/settlements.service';
import { SettlementStatus } from '../backend/src/database/entities/settlement.entity';
import { Repository } from 'typeorm';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Plaintext phone number used in tests that expect a real value. */
const PLAIN_PHONE = '+14155550199';

/**
 * "Encrypted" phone stored in the DB.  The test encryption stub below simply
 * prepends 'enc:' so the stub decrypt strips it — same convention as
 * export-csv-contract.test.ts.
 */
const ENC_PHONE = `enc:${PLAIN_PHONE}`;

/**
 * A device fingerprint value that should NEVER appear in the Phone column
 * of the settlement CSV, even when phone is absent.
 */
const FINGERPRINT = 'enc:device-fingerprint-secret-abc123';
const PLAIN_FINGERPRINT = 'device-fingerprint-secret-abc123';

const PLAIN_EMAIL = 'vendor@example.com';
const ENC_EMAIL = `enc:${PLAIN_EMAIL}`;

// ── Encryption stub ──────────────────────────────────────────────────────────

const fakeEncryption = {
  decrypt: (v: string) => (v?.startsWith('enc:') ? v.slice(4) : v),
  encrypt: (v: string) => `enc:${v}`,
};

// ── Settlement / vendor fixtures ─────────────────────────────────────────────

function makeVendor(overrides: Partial<{
  phone: string | null;
  email: string | null;
  deviceFingerprint: string | null;
  username: string;
}> = {}) {
  return {
    id: 'vendor-uuid',
    username: 'testvendor',
    email: ENC_EMAIL,
    phone: ENC_PHONE,
    deviceFingerprint: FINGERPRINT,
    ...overrides,
  };
}

function makeSettlement(vendor: any) {
  return {
    id: 'settlement-uuid',
    vendorId: 'vendor-uuid',
    vendor,
    month: '2025-01',
    totalCharges: 500,
    taxAmount: 42.5,
    status: SettlementStatus.FINANCE_APPROVED,
    data: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ── Service factory ───────────────────────────────────────────────────────────

function makeService(settlement: any) {
  const settlementRepo = {
    findOne: jest.fn().mockResolvedValue(settlement),
    save: jest.fn().mockImplementation(async (e: any) => e),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    create: jest.fn().mockImplementation((e: any) => e),
    count: jest.fn().mockResolvedValue(0),
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn(() => ({
      update: function () { return this; },
      set: function () { return this; },
      where: function () { return this; },
      andWhere: function () { return this; },
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    })),
  } as unknown as Repository<any>;

  return new SettlementsService(
    settlementRepo,
    {} as any,     // listingRepo
    {} as any,     // userRepo
    { log: jest.fn().mockResolvedValue({}) } as any, // auditService
    { calculate: jest.fn() } as any,                  // freightService
    fakeEncryption as any,                            // encryptionService
  );
}

// Helper: run exportCsv and parse the phone cell from the data row
async function getPhoneCell(
  vendor: any,
  requesterRole: string,
  requesterId = 'requester-uuid',
) {
  const settlement = makeSettlement(vendor);
  const svc = makeService(settlement);

  const csv = await svc.exportCsv(
    settlement.id,
    requesterId,
    requesterRole,
    'testuser',
  );

  // CSV layout (after watermark header row):
  // line 0: CONFIDENTIAL watermark
  // line 1: column headers
  // line 2: data row
  const lines = csv.split('\n');
  const dataRow = lines[2];

  // Each cell is wrapped in double quotes; split on `","` and strip surrounding quotes.
  const cells = dataRow.replace(/^"|"$/g, '').split('","');
  // Header: Vendor ID,Vendor Username,Email,Phone,Month,Total Charges,Tax Amount,Status
  //         0         1               2     3     4     5             6          7
  return cells[3] ?? '';
}

// Helper: return the full CSV (for header/structure assertions)
async function getCsv(vendor: any, requesterRole: string) {
  const settlement = makeSettlement(vendor);
  const svc = makeService(settlement);
  return svc.exportCsv(settlement.id, 'requester-uuid', requesterRole, 'testuser');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SettlementsService.exportCsv — Phone column source', () => {
  it('admin sees the full decrypted phone number', async () => {
    const phone = await getPhoneCell(makeVendor(), 'admin');
    expect(phone).toBe(PLAIN_PHONE);
  });

  it('non-admin (vendor) sees last-4 masked phone', async () => {
    const phone = await getPhoneCell(makeVendor(), 'vendor', 'vendor-uuid');
    expect(phone).toMatch(/^\*{4}/);
    expect(phone).toContain(PLAIN_PHONE.slice(-4));
  });

  it('non-admin (finance_admin) sees last-4 masked phone', async () => {
    const phone = await getPhoneCell(makeVendor(), 'finance_admin');
    expect(phone).toMatch(/^\*{4}/);
    expect(phone).toContain(PLAIN_PHONE.slice(-4));
  });

  it('non-admin (ops_reviewer) sees last-4 masked phone', async () => {
    const phone = await getPhoneCell(makeVendor(), 'ops_reviewer');
    expect(phone).toMatch(/^\*{4}/);
    expect(phone).toContain(PLAIN_PHONE.slice(-4));
  });

  it('phone cell is empty string when vendor.phone is null', async () => {
    const vendor = makeVendor({ phone: null });
    const phone = await getPhoneCell(vendor, 'admin');
    expect(phone).toBe('');
  });

  it('phone cell is empty string for non-admin when vendor.phone is null', async () => {
    const vendor = makeVendor({ phone: null });
    const phone = await getPhoneCell(vendor, 'vendor', 'vendor-uuid');
    expect(phone).toBe('');
  });
});

describe('SettlementsService.exportCsv — deviceFingerprint never used as Phone', () => {
  it('fingerprint plaintext does not appear in Phone cell when phone is set', async () => {
    const phone = await getPhoneCell(makeVendor(), 'admin');
    expect(phone).not.toContain(PLAIN_FINGERPRINT);
    expect(phone).not.toContain(FINGERPRINT);
  });

  it('fingerprint plaintext does not appear in Phone cell when phone is null', async () => {
    const vendor = makeVendor({ phone: null });
    const phone = await getPhoneCell(vendor, 'admin');
    // Empty string — NOT the fingerprint value
    expect(phone).toBe('');
    expect(phone).not.toContain(PLAIN_FINGERPRINT);
    expect(phone).not.toContain(FINGERPRINT);
  });

  it('fingerprint is absent from the entire CSV output', async () => {
    const vendor = makeVendor({ phone: null });
    const csv = await getCsv(vendor, 'admin');
    expect(csv).not.toContain(PLAIN_FINGERPRINT);
    expect(csv).not.toContain(FINGERPRINT);
  });

  it('vendor with no phone but a fingerprint: phone cell is still empty', async () => {
    const vendor = makeVendor({ phone: null, deviceFingerprint: FINGERPRINT });
    const phone = await getPhoneCell(vendor, 'admin');
    expect(phone).toBe('');
  });
});

describe('SettlementsService.exportCsv — Email masking (regression)', () => {
  it('admin sees decrypted vendor email', async () => {
    const csv = await getCsv(makeVendor(), 'admin');
    expect(csv).toContain(PLAIN_EMAIL);
  });

  it('non-admin (vendor) sees masked email', async () => {
    const settlement = makeSettlement(makeVendor());
    const svc = makeService(settlement);
    const csv = await svc.exportCsv(settlement.id, 'vendor-uuid', 'vendor', 'v');
    expect(csv).not.toContain(PLAIN_EMAIL);
    expect(csv).toContain('***masked***');
  });

  it('null email renders as N/A', async () => {
    const vendor = makeVendor({ email: null });
    const csv = await getCsv(vendor, 'admin');
    expect(csv).toContain('N/A');
  });
});

describe('SettlementsService.exportCsv — access control (guard regression)', () => {
  it('throws NotFoundException when settlement does not exist', async () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
    } as unknown as Repository<any>;
    const svc = new SettlementsService(repo, {} as any, {} as any,
      { log: jest.fn() } as any, { calculate: jest.fn() } as any, fakeEncryption as any);
    await expect(svc.exportCsv('no-id', 'u', 'admin', 'u')).rejects.toThrow(NotFoundException);
  });

  it('vendor cannot export another vendor settlement (ForbiddenException)', async () => {
    const settlement = { ...makeSettlement(makeVendor()), vendorId: 'other-vendor' };
    const svc = makeService(settlement);
    await expect(
      svc.exportCsv(settlement.id, 'my-vendor-id', 'vendor', 'me'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws BadRequestException when settlement is not fully approved', async () => {
    const pending = { ...makeSettlement(makeVendor()), status: SettlementStatus.PENDING };
    const svc = makeService(pending);
    await expect(
      svc.exportCsv(pending.id, 'requester-uuid', 'admin', 'admin'),
    ).rejects.toThrow(BadRequestException);
  });
});
