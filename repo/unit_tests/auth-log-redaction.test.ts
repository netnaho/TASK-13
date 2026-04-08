/**
 * auth-log-redaction.test.ts
 *
 * Verifies that raw IP addresses and device fingerprints are never written to
 * operational logs (Winston). The compliance record (AuditService) retains full
 * values for incident triage — only the log output is redacted.
 *
 * Two test surfaces:
 *  1. Pure helper functions (maskIp, hashFp) — the security contract
 *  2. Service-level spy assertions — login failures and success do not leak
 *     raw sensitive values through logger.warn / logger.info
 */

import { maskIp, hashFp, AuthService } from '../backend/src/auth/auth.service';
import { logger } from '../backend/src/common/logger/winston.logger';

import * as bcrypt from 'bcrypt';

// Pre-hash once at module load (rounds=1 is ~20 ms — acceptable for unit tests)
const CORRECT_PASSWORD = 'correct-password-123';
const KNOWN_HASH = bcrypt.hashSync(CORRECT_PASSWORD, 1);

// ── Test fixtures ─────────────────────────────────────────────────────────────

const RAW_IP_V4 = '203.0.113.42';
const RAW_IP_V6 = '2001:db8:85a3::8a2e:370:7334';
const RAW_FP = 'abcdef1234567890abcdef1234567890';

// ── Helper builders ───────────────────────────────────────────────────────────

function makeUserRepo(user: any = null) {
  return {
    findOne: jest.fn().mockResolvedValue(user),
    update: jest.fn().mockResolvedValue(undefined),
  };
}

function makeAuditMock() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

function makeEncryptionMock() {
  return { encrypt: jest.fn((v: string) => `enc:${v}`) };
}

function makeSanitizerMock() {
  return { sanitize: jest.fn((u: any) => ({ ...u })) };
}

function makeJwtMock() {
  return { sign: jest.fn().mockReturnValue('test-token') };
}

function buildService(userRepo: ReturnType<typeof makeUserRepo>) {
  return new AuthService(
    userRepo as any,
    makeJwtMock() as any,
    {} as any, // DataSource — not exercised by these tests
    makeEncryptionMock() as any,
    makeAuditMock() as any,
    makeSanitizerMock() as any,
  );
}

// FAKE_USER.passwordHash is set after the module-level hashSync above
const FAKE_USER = {
  id: 'user-uuid-1',
  username: 'shopper1',
  email: 'enc:shopper1@example.com',
  get passwordHash() { return KNOWN_HASH; },
  role: 'shopper',
  isActive: true,
  deviceFingerprint: null,
  lastIp: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ── 1. maskIp — pure helper ────────────────────────────────────────────────────

describe('maskIp', () => {
  it('masks last octet of an IPv4 address', () => {
    expect(maskIp('192.168.1.255')).toBe('192.168.1.*');
    expect(maskIp('10.0.0.1')).toBe('10.0.0.*');
    expect(maskIp(RAW_IP_V4)).toBe('203.0.113.*');
  });

  it('masked IPv4 does not contain the original last octet', () => {
    const result = maskIp('10.20.30.99');
    expect(result).not.toContain('99');
    expect(result).toBe('10.20.30.*');
  });

  it('returns a short hash for IPv6 (no raw address exposed)', () => {
    const result = maskIp(RAW_IP_V6);
    expect(result).not.toContain(RAW_IP_V6);
    expect(result.length).toBeLessThanOrEqual(8);
    expect(result).toMatch(/^[0-9a-f]{8}$/);
  });

  it('returns "unknown" for undefined', () => {
    expect(maskIp(undefined)).toBe('unknown');
  });

  it('returns "unknown" for empty string', () => {
    expect(maskIp('')).toBe('unknown');
  });

  it('two different IPs in the same /24 produce the same masked value', () => {
    expect(maskIp('172.16.5.1')).toBe(maskIp('172.16.5.200'));
  });

  it('two IPs in different /24 subnets produce different masked values', () => {
    expect(maskIp('172.16.5.1')).not.toBe(maskIp('172.16.6.1'));
  });
});

// ── 2. hashFp — pure helper ───────────────────────────────────────────────────

describe('hashFp', () => {
  it('returns a string prefixed with "fp:" for a known fingerprint', () => {
    const result = hashFp(RAW_FP);
    expect(result).toBeDefined();
    expect(result!.startsWith('fp:')).toBe(true);
  });

  it('hashed value does not contain any part of the raw fingerprint', () => {
    const result = hashFp(RAW_FP)!;
    expect(result).not.toContain(RAW_FP);
    // The raw value is 32 hex chars; the hash suffix is only 8 hex chars and
    // will not accidentally be a substring of the raw value given SHA-256 avalanche
    expect(result).toMatch(/^fp:[0-9a-f]{8}$/);
  });

  it('returns undefined for undefined input', () => {
    expect(hashFp(undefined)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(hashFp('')).toBeUndefined();
  });

  it('same fingerprint always produces the same hash (deterministic)', () => {
    expect(hashFp(RAW_FP)).toBe(hashFp(RAW_FP));
  });

  it('different fingerprints produce different hashes', () => {
    expect(hashFp(RAW_FP)).not.toBe(hashFp('000000000000000000000000deadbeef'));
  });
});

// ── 3. Service logger spy — login failure: unknown user ───────────────────────

describe('login failure — unknown user — logger does not expose raw telemetry', () => {
  let svc: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = buildService(makeUserRepo(null)); // userRepo returns null → unknown user
  });

  it('throws UnauthorizedException', async () => {
    await expect(
      svc.login({ username: 'ghost', password: 'pass1234' }, RAW_IP_V4, RAW_FP),
    ).rejects.toThrow('Invalid credentials');
  });

  it('logger.warn is called once', async () => {
    await svc.login({ username: 'ghost', password: 'pass1234' }, RAW_IP_V4, RAW_FP).catch(() => {});
    expect((logger.warn as jest.Mock).mock.calls).toHaveLength(1);
  });

  it('logger.warn metadata does not contain raw IP', async () => {
    await svc.login({ username: 'ghost', password: 'pass1234' }, RAW_IP_V4, RAW_FP).catch(() => {});
    const [, meta] = (logger.warn as jest.Mock).mock.calls[0];
    expect(JSON.stringify(meta)).not.toContain(RAW_IP_V4);
  });

  it('logger.warn metadata contains masked IP (subnet only)', async () => {
    await svc.login({ username: 'ghost', password: 'pass1234' }, RAW_IP_V4, RAW_FP).catch(() => {});
    const [, meta] = (logger.warn as jest.Mock).mock.calls[0];
    expect(meta.ip).toBe('203.0.113.*');
  });

  it('logger.warn metadata does not contain raw device fingerprint', async () => {
    await svc.login({ username: 'ghost', password: 'pass1234' }, RAW_IP_V4, RAW_FP).catch(() => {});
    const [, meta] = (logger.warn as jest.Mock).mock.calls[0];
    expect(JSON.stringify(meta)).not.toContain(RAW_FP);
    expect(meta.deviceFingerprint).toBeUndefined();
  });

  it('logger.warn metadata contains hashed fingerprint (not raw)', async () => {
    await svc.login({ username: 'ghost', password: 'pass1234' }, RAW_IP_V4, RAW_FP).catch(() => {});
    const [, meta] = (logger.warn as jest.Mock).mock.calls[0];
    expect(meta.fpHash).toMatch(/^fp:[0-9a-f]{8}$/);
  });

  it('no sensitive telemetry even when ip/fp are undefined', async () => {
    await svc.login({ username: 'ghost', password: 'pass1234' }, undefined, undefined).catch(() => {});
    const [, meta] = (logger.warn as jest.Mock).mock.calls[0];
    expect(meta.ip).toBe('unknown');
    expect(meta.fpHash).toBeUndefined();
  });
});

// ── 4. Service logger spy — login failure: bad password ──────────────────────

describe('login failure — bad password — logger does not expose raw telemetry', () => {
  // Uses real bcrypt (rounds=1) — FAKE_USER.passwordHash is derived from
  // CORRECT_PASSWORD; sending a different password triggers the bad-password path.
  let svc: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = buildService(makeUserRepo(FAKE_USER));
  });

  it('throws UnauthorizedException', async () => {
    await expect(
      svc.login({ username: 'shopper1', password: 'wrong-password' }, RAW_IP_V4, RAW_FP),
    ).rejects.toThrow('Invalid credentials');
  });

  it('logger.warn metadata does not contain raw IP', async () => {
    await svc.login({ username: 'shopper1', password: 'wrong-password' }, RAW_IP_V4, RAW_FP).catch(() => {});
    const [, meta] = (logger.warn as jest.Mock).mock.calls[0];
    expect(JSON.stringify(meta)).not.toContain(RAW_IP_V4);
    expect(meta.ip).toBe('203.0.113.*');
  });

  it('logger.warn metadata does not contain raw device fingerprint', async () => {
    await svc.login({ username: 'shopper1', password: 'wrong-password' }, RAW_IP_V4, RAW_FP).catch(() => {});
    const [, meta] = (logger.warn as jest.Mock).mock.calls[0];
    expect(JSON.stringify(meta)).not.toContain(RAW_FP);
    expect(meta.deviceFingerprint).toBeUndefined();
    expect(meta.fpHash).toMatch(/^fp:[0-9a-f]{8}$/);
  });
});

// ── 5. Service logger spy — login success ─────────────────────────────────────

describe('login success — logger does not expose raw IP', () => {
  // Uses real bcrypt (rounds=1) — sends CORRECT_PASSWORD to reach the success path.
  let svc: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = buildService(makeUserRepo(FAKE_USER));
  });

  it('returns token and user view', async () => {
    const result = await svc.login({ username: 'shopper1', password: CORRECT_PASSWORD }, RAW_IP_V4, RAW_FP);
    expect(result.token).toBe('test-token');
  });

  it('logger.info metadata does not contain raw IP', async () => {
    await svc.login({ username: 'shopper1', password: CORRECT_PASSWORD }, RAW_IP_V4, RAW_FP);
    const calls = (logger.info as jest.Mock).mock.calls;
    // Filter to the login-success call specifically (other logger.info calls may exist)
    const successCall = calls.find(([msg]: [string]) => msg.includes('Login success'));
    expect(successCall).toBeDefined();
    const [, meta] = successCall!;
    expect(JSON.stringify(meta)).not.toContain(RAW_IP_V4);
    expect(meta.ip).toBe('203.0.113.*');
  });

  it('success log does not include device fingerprint at all', async () => {
    await svc.login({ username: 'shopper1', password: CORRECT_PASSWORD }, RAW_IP_V4, RAW_FP);
    const calls = (logger.info as jest.Mock).mock.calls;
    const successCall = calls.find(([msg]: [string]) => msg.includes('Login success'));
    const [, meta] = successCall!;
    expect(meta.deviceFingerprint).toBeUndefined();
    expect(meta.fpHash).toBeUndefined();
    expect(JSON.stringify(meta)).not.toContain(RAW_FP);
  });
});
