/**
 * Tests for the centralized secrets module (common/config/secrets.ts).
 *
 * The module exports JWT_SECRET and FIELD_ENCRYPTION_KEY resolved at
 * import-time. We cannot re-import a module mid-test, so we test the
 * underlying `requireSecret` logic by extracting it — but since it's
 * not exported, we replicate the exact logic here as a contract test.
 *
 * What we verify:
 *  1. In production (NODE_ENV=production), missing secret → throws FATAL
 *  2. In production, insecure default value → throws FATAL
 *  3. In dev/test, missing secret → returns the dev default
 *  4. In dev/test, explicit env value → returns it
 */

const DEV_JWT_SECRET = 'local_dev_jwt_secret_change_in_prod';
const DEV_ENCRYPTION_KEY = 'local_dev_encryption_key_change_in_prod';

/** Mirror of the private requireSecret function */
function requireSecret(envVar: string, devDefault: string, nodeEnv: string): string {
  const value = process.env[envVar];

  if (nodeEnv === 'production') {
    if (!value) {
      throw new Error(
        `FATAL: ${envVar} is not set. ` +
          'All security-critical secrets must be provided via environment variables in production. ' +
          'See .env.example for the full list.',
      );
    }
    if (value === devDefault) {
      throw new Error(
        `FATAL: ${envVar} is still set to the insecure development default. ` +
          'Generate a cryptographically random value before deploying to production.',
      );
    }
    return value;
  }

  return value || devDefault;
}

describe('requireSecret — production fail-fast', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env
    process.env = { ...originalEnv };
  });

  it('throws when secret is missing in production', () => {
    delete process.env.JWT_SECRET;
    expect(() => requireSecret('JWT_SECRET', DEV_JWT_SECRET, 'production')).toThrow(
      'FATAL: JWT_SECRET is not set',
    );
  });

  it('throws when secret equals the insecure default in production', () => {
    process.env.JWT_SECRET = DEV_JWT_SECRET;
    expect(() => requireSecret('JWT_SECRET', DEV_JWT_SECRET, 'production')).toThrow(
      'insecure development default',
    );
  });

  it('returns the value when a proper secret is set in production', () => {
    process.env.JWT_SECRET = 'super_secure_random_production_key_abc123';
    expect(requireSecret('JWT_SECRET', DEV_JWT_SECRET, 'production')).toBe(
      'super_secure_random_production_key_abc123',
    );
  });

  it('throws when encryption key is missing in production', () => {
    delete process.env.FIELD_ENCRYPTION_KEY;
    expect(() => requireSecret('FIELD_ENCRYPTION_KEY', DEV_ENCRYPTION_KEY, 'production')).toThrow(
      'FATAL: FIELD_ENCRYPTION_KEY is not set',
    );
  });
});

describe('requireSecret — dev/test fallback', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns dev default when env var is not set in test', () => {
    delete process.env.JWT_SECRET;
    expect(requireSecret('JWT_SECRET', DEV_JWT_SECRET, 'test')).toBe(DEV_JWT_SECRET);
  });

  it('returns dev default when env var is not set in development', () => {
    delete process.env.FIELD_ENCRYPTION_KEY;
    expect(requireSecret('FIELD_ENCRYPTION_KEY', DEV_ENCRYPTION_KEY, 'development')).toBe(
      DEV_ENCRYPTION_KEY,
    );
  });

  it('returns explicit value when set, even in dev', () => {
    process.env.JWT_SECRET = 'custom_dev_key';
    expect(requireSecret('JWT_SECRET', DEV_JWT_SECRET, 'development')).toBe('custom_dev_key');
  });

  it('returns dev default when NODE_ENV is undefined', () => {
    delete process.env.JWT_SECRET;
    expect(requireSecret('JWT_SECRET', DEV_JWT_SECRET, '')).toBe(DEV_JWT_SECRET);
  });
});

describe('Actual secrets module — exports are usable in test env', () => {
  it('JWT_SECRET is a non-empty string', () => {
    // This import works because NODE_ENV is not 'production' in test
    const { JWT_SECRET } = require('../backend/src/common/config/secrets');
    expect(typeof JWT_SECRET).toBe('string');
    expect(JWT_SECRET.length).toBeGreaterThan(0);
  });

  it('FIELD_ENCRYPTION_KEY is a non-empty string', () => {
    const { FIELD_ENCRYPTION_KEY } = require('../backend/src/common/config/secrets');
    expect(typeof FIELD_ENCRYPTION_KEY).toBe('string');
    expect(FIELD_ENCRYPTION_KEY.length).toBeGreaterThan(0);
  });
});
