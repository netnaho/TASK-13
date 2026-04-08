# Reinspection Results for Previously Reported Issues (Static Review)

Date: 2026-04-08  
Scope: Static code review only (no runtime/test execution)

## Overall Status

- Previously reported issues reviewed: **6**
- **Fixed:** 6
- **Partially fixed:** 0
- **Not fixed:** 0

---

## Issue-by-Issue Verification

### 1) High — Settlement variance reconciliation was effectively not implemented

**Previous finding:** `actual = expected` caused always-zero variance.  
**Current status:** ✅ **Fixed**

**Evidence**

- Variance now reads `actualCharges` from settlement data with fallback for legacy rows:
  - `repo/backend/src/settlements/settlements.service.ts:80-81`
- Reconciliation write path added:
  - `repo/backend/src/settlements/settlements.service.ts:302` (`recordActualCharges(...)`)
  - `repo/backend/src/settlements/settlements.service.ts:314` (stores `actualCharges`)

**Conclusion**

- Issue resolved with backward-compatible fallback behavior.

---

### 2) High — Export progress was fake in UI (fixed 60% bar)

**Previous finding:** UI progress indicator was hardcoded, backend had no progress model.  
**Current status:** ✅ **Fixed**

**Evidence**

- Export job entity has progress fields:
  - `repo/backend/src/database/entities/export-job.entity.ts:50` (`progressPercent`)
  - `repo/backend/src/database/entities/export-job.entity.ts:54` (`progressStage`)
- Backend job lifecycle updates progress in stages:
  - `repo/backend/src/exports/exports.service.ts:68-69` (queued defaults)
  - `repo/backend/src/exports/exports.service.ts:145-146` (running/start)
  - `repo/backend/src/exports/exports.service.ts:186` (50 / data fetched)
  - `repo/backend/src/exports/exports.service.ts:192` (90 / file written)
  - `repo/backend/src/exports/exports.service.ts:198-199` (100 / done)
  - `repo/backend/src/exports/exports.service.ts:211-212` (`setProgress` helper)
- Frontend now uses progress utility state:
  - `repo/frontend/src/pages/admin/Exports.tsx:9`
  - `repo/frontend/src/pages/admin/Exports.tsx:84`
  - `repo/frontend/src/pages/admin/Exports.tsx:88`

**Conclusion**

- Fake-progress issue is resolved.

---

### 3) High — Frontend listing filters incomplete (missing age/rating/region dimensions)

**Previous finding:** UI exposed only subset of required dimensions.  
**Current status:** ✅ **Fixed**

**Evidence**

- Region filter control:
  - `repo/frontend/src/pages/Listings.tsx:159`
- Age range controls:
  - `repo/frontend/src/pages/Listings.tsx:197` (min)
  - `repo/frontend/src/pages/Listings.tsx:204` (max)
- Rating range controls:
  - `repo/frontend/src/pages/Listings.tsx:213` (min)
  - `repo/frontend/src/pages/Listings.tsx:222` (max)

**Conclusion**

- Required multidimensional filter controls are now present.

---

### 4) Medium — Settlement CSV “Phone” sourced from device fingerprint (no phone/address model)

**Previous finding:** Incorrect phone semantics and missing domain model for contact data.  
**Current status:** ✅ **Fixed**

**Evidence**

- Settlement CSV now explicitly uses dedicated `vendor.phone`, with comment prohibiting fingerprint usage:
  - `repo/backend/src/settlements/settlements.service.ts:356-362`
  - `repo/backend/src/settlements/settlements.service.ts:374,379` (CSV header/value wiring)
- User entity now has phone/address contact fields:
  - `repo/backend/src/database/entities/user.entity.ts:50` (`phone`)
  - `repo/backend/src/database/entities/user.entity.ts:56,60,67,71,75,79` (address components)
- Migration added for nullable contact columns:
  - `repo/backend/src/database/migrations/1712610000000-AddUserContactFields.ts:1`
- Targeted tests added for phone semantics and fingerprint non-leakage:
  - `repo/unit_tests/settlement-csv-phone.test.ts:1`

**Conclusion**

- Phone/address data semantics issue is resolved.

---

### 5) Medium — Authz test route drift (`/query/execute` vs actual `/query`)

**Previous finding:** stale endpoint in protected-route tests.  
**Current status:** ✅ **Fixed**

**Evidence**

- Protected-route tests target `/api/query`:
  - `repo/backend/src/test/protected-routes-401.spec.ts:192`
  - `repo/backend/src/test/protected-routes-401.spec.ts:411`
  - `repo/backend/src/test/protected-routes-401.spec.ts:419`

**Conclusion**

- Endpoint drift is corrected.

---

### 6) Medium — Frontend test harness existed but no frontend test cases detected

**Previous finding:** no actual frontend test files in `frontend/src/test`.  
**Current status:** ✅ **Fixed**

**Evidence**

- Frontend test files now exist:
  - `repo/frontend/src/test/listings-filters.test.tsx`
  - `repo/frontend/src/test/exports-progress.test.tsx`
  - `repo/frontend/src/test/conversation-internal-notes-visibility.test.tsx`
- Test suites cover the previously requested behaviors:
  - Listings filters: `repo/frontend/src/test/listings-filters.test.tsx:69,112,201,244`
  - Exports progress rendering states: `repo/frontend/src/test/exports-progress.test.tsx:103,131,169,195,220`
  - Conversation internal-note visibility: `repo/frontend/src/test/conversation-internal-notes-visibility.test.tsx:133`

**Conclusion**

- Frontend test coverage gap for these critical UI behaviors is resolved.

---

## Final Reinspection Verdict

- **All 6/6 previously reported issues are now fixed (static evidence).**

## Notes

- This verification is static-only and does not claim runtime/test execution success.
- Optional next step: run backend + frontend test suites to convert static confidence into executed quality-gate evidence.
