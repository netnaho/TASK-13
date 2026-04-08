# Issue Fix Verification Rerun (Static-Only) — 2026-04-08 (v5)

## Scope

Re-verified all issues from `audit_report-1.md` using **static code evidence only** (no runtime execution).

## Summary

- **Fixed:** 5 / 5
- **Partially fixed:** 0 / 5
- **Not fixed:** 0 / 5

## Per-Issue Verification

### 1) High — Production-risk DB schema auto-sync enabled

- **Current status:** **Fixed**
- **Evidence:** `repo/backend/src/app.module.ts`
  - `synchronize: process.env.NODE_ENV !== 'production'`
- **Assessment:** Production auto-sync is explicitly disabled.

### 2) High — Weak default DB credential fallback in code/config

- **Current status:** **Fixed**
- **Evidence:**
  - `repo/backend/src/common/config/secrets.ts`
    - `DB_PASSWORD` resolved via `requireSecret('DB_PASSWORD', DEV_DB_PASSWORD)`
    - production mode fails fast when missing/default insecure values are used
  - `repo/backend/src/app.module.ts`
    - database password comes from `DB_PASSWORD` constant
  - `repo/docker-compose.yml`
    - fallback is documented as local-dev only
- **Assessment:** Production path is fail-fast and hardened; local default is constrained to dev workflow.

### 3) High — Sensitive auth telemetry logged in failure paths

- **Current status:** **Fixed**
- **Evidence:** `repo/backend/src/auth/auth.service.ts`
  - warning logs use redacted/hash forms: `ip: maskIp(ip)`, `fpHash: hashFp(deviceFingerprint)`
  - helper methods `maskIp` and `hashFp` present and used in failure logs
- **Assessment:** Raw IP/fingerprint no longer appear in warning-log metadata.

### 4) Medium — Security coverage gap: incomplete 401 matrix for protected routes

- **Current status:** **Fixed**
- **Evidence:** `repo/backend/src/test/protected-routes-401.spec.ts`
  - broad matrix for protected endpoints across users/settlements/conversations/credits/audit/admin/exports/query/listings/admin tools
  - checks no-token, malformed token, and tampered-signature token paths (401)
- **Assessment:** Unauthorized-access matrix is now comprehensive and systematic.

### 5) Medium — Unit tests as logic replicas/stubs rather than direct wiring

- **Current status:** **Fixed**
- **Evidence:**
  - `repo/backend/src/test/conversation-search.integration.spec.ts`
    - real DB-backed integration coverage for keyword matching, listing-title fallback, date-range semantics, combined filters, and role/user scoping
  - `repo/unit_tests/conversation-search.test.ts`
    - refocused to structural/pagination invariants only
    - explicit note that SQL/filter semantics are no longer replicated in unit scaffolding
- **Assessment:** The prior query-logic replica risk for conversation search has been removed and replaced with real wiring validation.

## Final Conclusion

All previously reported issues are now statically verified as fixed in code.

- Security hardening concerns are addressed in production-sensitive paths.
- Auth/authorization test depth has been expanded to reduce regression risk.
- The remaining “partial” test-realism gap is now closed with dedicated integration coverage.

## Verification Boundary

This report is static-only and does not claim runtime execution validation.
