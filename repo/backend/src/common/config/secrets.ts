/**
 * Centralized secret resolution with fail-fast enforcement.
 *
 * In production (NODE_ENV === 'production') every security-critical secret
 * MUST be provided via the environment — missing values crash the process
 * immediately so a misconfigured deploy never starts silently.
 *
 * In development and test the well-known defaults continue to work so that
 * `docker compose up` and `jest` need zero local setup.
 */

const DEV_JWT_SECRET = 'local_dev_jwt_secret_change_in_prod';
const DEV_ENCRYPTION_KEY = 'local_dev_encryption_key_change_in_prod';
const DEV_DB_PASSWORD = 'petmarket_secret';

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Resolve a secret from the environment.
 * Throws at import-time in production if the variable is missing or matches a
 * known insecure default, so the app never boots with weak credentials.
 */
function requireSecret(envVar: string, devDefault: string): string {
  const value = process.env[envVar];

  if (isProduction()) {
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

  // Dev / test: fall back to the well-known default
  return value || devDefault;
}

export const JWT_SECRET = requireSecret('JWT_SECRET', DEV_JWT_SECRET);
export const FIELD_ENCRYPTION_KEY = requireSecret('FIELD_ENCRYPTION_KEY', DEV_ENCRYPTION_KEY);
export const DB_PASSWORD = requireSecret('DB_PASSWORD', DEV_DB_PASSWORD);
