import { extractRiskContext, RequestLike } from '../backend/src/common/risk/request-risk-context';

// ── Helpers ───────────────────────────────────────────────────────────────────

function req(overrides: Partial<RequestLike> = {}): RequestLike {
  return {
    headers: {},
    ip: undefined,
    socket: { remoteAddress: undefined },
    ...overrides,
  };
}

// ── IP extraction ─────────────────────────────────────────────────────────────

describe('extractRiskContext — IP resolution', () => {
  it('prefers x-forwarded-for first hop over req.ip', () => {
    const ctx = extractRiskContext(req({
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
      ip: '10.0.0.1',
    }));
    expect(ctx.ip).toBe('203.0.113.5');
  });

  it('takes single-value x-forwarded-for', () => {
    const ctx = extractRiskContext(req({
      headers: { 'x-forwarded-for': '198.51.100.7' },
    }));
    expect(ctx.ip).toBe('198.51.100.7');
  });

  it('handles x-forwarded-for as array (multi-header)', () => {
    const ctx = extractRiskContext(req({
      headers: { 'x-forwarded-for': ['203.0.113.9', '10.0.0.2'] },
    }));
    expect(ctx.ip).toBe('203.0.113.9');
  });

  it('falls back to req.ip when no x-forwarded-for', () => {
    const ctx = extractRiskContext(req({ ip: '192.168.1.1' }));
    expect(ctx.ip).toBe('192.168.1.1');
  });

  it('falls back to socket.remoteAddress as last resort', () => {
    const ctx = extractRiskContext(req({
      socket: { remoteAddress: '127.0.0.1' },
    }));
    expect(ctx.ip).toBe('127.0.0.1');
  });

  it('returns undefined when no IP source is available', () => {
    const ctx = extractRiskContext(req());
    expect(ctx.ip).toBeUndefined();
  });

  it('trims whitespace from x-forwarded-for entries', () => {
    const ctx = extractRiskContext(req({
      headers: { 'x-forwarded-for': '  203.0.113.5 , 10.0.0.1' },
    }));
    expect(ctx.ip).toBe('203.0.113.5');
  });
});

// ── Device fingerprint extraction ─────────────────────────────────────────────

describe('extractRiskContext — device fingerprint', () => {
  it('extracts a valid fingerprint from x-device-fingerprint header', () => {
    const ctx = extractRiskContext(req({
      headers: { 'x-device-fingerprint': 'abc123-fp.VALID_fingerprint' },
    }));
    expect(ctx.deviceFingerprint).toBe('abc123-fp.VALID_fingerprint');
  });

  it('returns undefined when header is absent', () => {
    const ctx = extractRiskContext(req());
    expect(ctx.deviceFingerprint).toBeUndefined();
  });

  it('returns undefined for empty string header', () => {
    const ctx = extractRiskContext(req({ headers: { 'x-device-fingerprint': '' } }));
    expect(ctx.deviceFingerprint).toBeUndefined();
  });

  it('returns undefined for whitespace-only header', () => {
    const ctx = extractRiskContext(req({ headers: { 'x-device-fingerprint': '   ' } }));
    expect(ctx.deviceFingerprint).toBeUndefined();
  });

  it('returns undefined when fingerprint exceeds 512 chars', () => {
    const ctx = extractRiskContext(req({
      headers: { 'x-device-fingerprint': 'a'.repeat(513) },
    }));
    expect(ctx.deviceFingerprint).toBeUndefined();
  });

  it('accepts fingerprint of exactly 512 chars', () => {
    const fp = 'a'.repeat(512);
    const ctx = extractRiskContext(req({ headers: { 'x-device-fingerprint': fp } }));
    expect(ctx.deviceFingerprint).toBe(fp);
  });

  it('returns undefined for fingerprint containing null byte (injection guard)', () => {
    const ctx = extractRiskContext(req({
      headers: { 'x-device-fingerprint': 'valid\x00injection' },
    }));
    expect(ctx.deviceFingerprint).toBeUndefined();
  });

  it('takes first value when header is an array', () => {
    const ctx = extractRiskContext(req({
      headers: { 'x-device-fingerprint': ['fp-one', 'fp-two'] },
    }));
    expect(ctx.deviceFingerprint).toBe('fp-one');
  });

  it('missing fingerprint does not crash — flow gets fallback undefined', () => {
    expect(() => extractRiskContext(req())).not.toThrow();
    const ctx = extractRiskContext(req());
    expect(ctx.deviceFingerprint).toBeUndefined();
    expect(ctx.ip).toBeUndefined();
  });
});

// ── Multi-account / same-IP risk scenario (context propagation) ───────────────

describe('extractRiskContext — multi-account same-IP scenario', () => {
  it('captures the shared IP used by multiple accounts', () => {
    const SHARED_IP = '203.0.113.42';

    // Simulate two different requests from the same IP
    const ctxA = extractRiskContext(req({ ip: SHARED_IP, headers: { 'x-device-fingerprint': 'fp-account-A' } }));
    const ctxB = extractRiskContext(req({ ip: SHARED_IP, headers: { 'x-device-fingerprint': 'fp-account-B' } }));

    expect(ctxA.ip).toBe(SHARED_IP);
    expect(ctxB.ip).toBe(SHARED_IP);
    // Both have distinct fingerprints but the same IP — risk service would
    // detect this as ip_risk if account creation volume threshold is exceeded
    expect(ctxA.deviceFingerprint).toBe('fp-account-A');
    expect(ctxB.deviceFingerprint).toBe('fp-account-B');
  });

  it('captures same fingerprint across different IPs (multi-account device)', () => {
    const SHARED_FP = 'device-fingerprint-shared-device';

    const ctxA = extractRiskContext(req({ ip: '10.0.0.1', headers: { 'x-device-fingerprint': SHARED_FP } }));
    const ctxB = extractRiskContext(req({ ip: '10.0.0.2', headers: { 'x-device-fingerprint': SHARED_FP } }));

    expect(ctxA.deviceFingerprint).toBe(SHARED_FP);
    expect(ctxB.deviceFingerprint).toBe(SHARED_FP);
    // Same fingerprint on different IPs triggers multi_account_device check
    expect(ctxA.ip).not.toBe(ctxB.ip);
  });
});

// ── Risk context → listing status integration ─────────────────────────────────

describe('risk flag → listing status logic', () => {
  /**
   * The listings service uses: shouldReview = flagged || riskFlags.length > 0
   * This tests that pure logic directly, matching what listings.service.ts does.
   */
  function deriveStatus(flagged: boolean, riskFlagCount: number): string {
    return flagged || riskFlagCount > 0 ? 'pending_review' : 'active';
  }

  it('no flags → active', () => {
    expect(deriveStatus(false, 0)).toBe('active');
  });

  it('sensitive word flag alone → pending_review', () => {
    expect(deriveStatus(true, 0)).toBe('pending_review');
  });

  it('risk flags alone → pending_review', () => {
    expect(deriveStatus(false, 1)).toBe('pending_review');
  });

  it('both flags → pending_review', () => {
    expect(deriveStatus(true, 2)).toBe('pending_review');
  });

  it('multiple risk flags → pending_review', () => {
    expect(deriveStatus(false, 3)).toBe('pending_review');
  });
});
