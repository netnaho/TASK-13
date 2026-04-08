import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: AddUserContactFields
 *
 * Adds nullable contact/address columns to the `users` table.
 * All new columns are NULL by default, so existing rows are untouched.
 *
 * Context
 * -------
 * The settlement CSV export was incorrectly deriving a "Phone" column from the
 * `device_fingerprint` security field.  This migration introduces a proper
 * `phone` column (and companion address fields) so the CSV can be populated
 * from real contact data.  The `device_fingerprint` column is unchanged and
 * continues to serve its original purpose.
 *
 * Storage convention
 * ------------------
 * Sensitive values (phone, addressLine1, addressLine2, postalCode) are stored
 * AES-256 encrypted by the application layer (same as `email` and
 * `device_fingerprint`).  Less-sensitive locality fields (city, stateRegion,
 * country) may be stored plaintext, consistent with the data-masking policy
 * that permits city+state disclosure to non-admin roles.
 */
export class AddUserContactFields1712610000000 implements MigrationInterface {
  name = 'AddUserContactFields1712610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "phone"         TEXT    DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "address_line1" TEXT    DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "address_line2" TEXT    DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "city"          TEXT    DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "state_region"  TEXT    DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "postal_code"   TEXT    DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "country"       TEXT    DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN IF EXISTS "phone",
        DROP COLUMN IF EXISTS "address_line1",
        DROP COLUMN IF EXISTS "address_line2",
        DROP COLUMN IF EXISTS "city",
        DROP COLUMN IF EXISTS "state_region",
        DROP COLUMN IF EXISTS "postal_code",
        DROP COLUMN IF EXISTS "country"
    `);
  }
}
