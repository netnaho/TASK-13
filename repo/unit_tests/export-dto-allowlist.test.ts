/**
 * export-dto-allowlist.test.ts
 *
 * Verifies that the export type allowlist (EXPORT_ALLOWED_TYPES) enforces the
 * correct set of exportable entities.
 *
 * 'users' was previously visible in the Query UI but is NOT in the allowlist —
 * the backend rejects it via @IsIn(EXPORT_ALLOWED_TYPES) on CreateExportJobDto.
 */

import { EXPORT_ALLOWED_TYPES } from '../backend/src/exports/dto/export.dto';

const ALLOWED = Array.from(EXPORT_ALLOWED_TYPES);

describe('EXPORT_ALLOWED_TYPES — allowlist contract', () => {
  it('contains exactly the four approved export types', () => {
    expect(ALLOWED).toHaveLength(4);
    expect(ALLOWED).toContain('listings');
    expect(ALLOWED).toContain('conversations');
    expect(ALLOWED).toContain('settlements');
    expect(ALLOWED).toContain('audit');
  });

  it('"users" is NOT in the allowlist (was erroneously offered in the UI)', () => {
    expect(ALLOWED).not.toContain('users');
  });

  it('"admin" is not in the allowlist', () => {
    expect(ALLOWED).not.toContain('admin');
  });

  it('no blank or wildcard entries exist', () => {
    for (const t of ALLOWED) {
      expect(typeof t).toBe('string');
      expect(t.trim().length).toBeGreaterThan(0);
    }
  });

  it('all entries are lowercase strings (no casing surprises)', () => {
    for (const t of ALLOWED) {
      expect(t).toBe(t.toLowerCase());
    }
  });
});
