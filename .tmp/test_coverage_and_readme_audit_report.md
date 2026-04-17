# Test Coverage Audit

## Scope

- Audit mode: **static inspection only**.
- Inspected scope only: backend route definitions, backend/API/frontend/e2e test files, `run_tests.sh`, and `repo/README.md`.
- No code/tests/scripts/containers/package managers were executed.

## Project Type Detection

- README top declares: "Full-stack pet marketplace" (`repo/README.md`, line 3).
- Effective strict classification: **fullstack**.

## Backend Endpoint Inventory

Global prefix: `app.setGlobalPrefix('api')` (`repo/backend/src/main.ts`, line 23).

Total endpoints: **54**.

1. `POST /api/auth/login`
2. `POST /api/auth/register`
3. `GET /api/users/me`
4. `GET /api/users`
5. `PATCH /api/users/:id/role`
6. `PATCH /api/users/:id/active`
7. `GET /api/listings`
8. `GET /api/listings/suggest`
9. `GET /api/listings/:id`
10. `POST /api/listings`
11. `PUT /api/listings/:id`
12. `DELETE /api/listings/:id`
13. `GET /api/conversations`
14. `GET /api/conversations/canned-responses`
15. `POST /api/conversations`
16. `GET /api/conversations/:id`
17. `POST /api/conversations/:id/messages`
18. `POST /api/conversations/:id/archive`
19. `POST /api/conversations/:id/voice`
20. `GET /api/conversations/voice/:fileName`
21. `POST /api/admin/canned-responses`
22. `GET /api/campaigns/active`
23. `GET /api/admin/campaigns`
24. `POST /api/admin/campaigns`
25. `PUT /api/admin/campaigns/:id`
26. `DELETE /api/admin/campaigns/:id`
27. `GET /api/admin/sensitive-words`
28. `POST /api/admin/sensitive-words`
29. `DELETE /api/admin/sensitive-words/:id`
30. `GET /api/settlements`
31. `GET /api/settlements/:id`
32. `POST /api/settlements/generate-monthly`
33. `POST /api/settlements/freight/calculate`
34. `POST /api/settlements/:id/approve-step1`
35. `POST /api/settlements/:id/approve-step2`
36. `POST /api/settlements/:id/reject`
37. `POST /api/settlements/:id/reconcile`
38. `GET /api/settlements/export/:id`
39. `GET /api/credits/me`
40. `GET /api/credits/:userId`
41. `POST /api/credits/compute/:userId`
42. `GET /api/audit`
43. `GET /api/admin/audit`
44. `GET /api/admin/audit/:id/verify`
45. `POST /api/admin/audit/retention`
46. `POST /api/admin/audit/export`
47. `GET /api/exports/jobs`
48. `POST /api/exports/jobs`
49. `GET /api/exports/jobs/:id`
50. `GET /api/exports/jobs/:id/download`
51. `POST /api/query`
52. `POST /api/query/save`
53. `GET /api/query/saved`
54. `DELETE /api/query/saved/:id`

## API Test Mapping Table

Coverage rule used: endpoint is “covered” only when request hits exact method/path and route handler/business path.

| Endpoint                                  | Covered | Test type         | Test files                                                                                                 | Evidence                                                |
| ----------------------------------------- | ------- | ----------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `POST /api/auth/login`                    | yes     | true no-mock HTTP | `backend/src/test/masking.spec.ts`, `API_tests/run_api_tests.sh`                                           | integration login assertions + curl login checks        |
| `POST /api/auth/register`                 | yes     | true no-mock HTTP | `backend/src/test/masking.spec.ts`, `API_tests/run_api_tests.sh`                                           | register path tests                                     |
| `GET /api/users/me`                       | yes     | true no-mock HTTP | `backend/src/test/masking.spec.ts`                                                                         | authenticated self-profile success                      |
| `GET /api/users`                          | yes     | true no-mock HTTP | `backend/src/test/users-admin.spec.ts`                                                                     | admin user list success                                 |
| `PATCH /api/users/:id/role`               | yes     | true no-mock HTTP | `backend/src/test/users-admin.spec.ts`                                                                     | role update success                                     |
| `PATCH /api/users/:id/active`             | yes     | true no-mock HTTP | `backend/src/test/users-admin.spec.ts`                                                                     | active-state update success                             |
| `GET /api/listings`                       | yes     | true no-mock HTTP | `API_tests/run_api_tests.sh`                                                                               | list/search/pagination assertions                       |
| `GET /api/listings/suggest`               | yes     | true no-mock HTTP | `API_tests/run_api_tests.sh`                                                                               | suggest endpoint assertion                              |
| `GET /api/listings/:id`                   | yes     | true no-mock HTTP | `backend/src/test/listing-access.spec.ts`                                                                  | direct retrieval checks                                 |
| `POST /api/listings`                      | yes     | true no-mock HTTP | `API_tests/run_api_tests.sh`                                                                               | vendor create listing success                           |
| `PUT /api/listings/:id`                   | yes     | true no-mock HTTP | `backend/src/test/listings-mutations.spec.ts`                                                              | vendor/admin update success tests                       |
| `DELETE /api/listings/:id`                | yes     | true no-mock HTTP | `backend/src/test/listings-mutations.spec.ts`                                                              | vendor/admin delete success tests                       |
| `GET /api/conversations`                  | yes     | true no-mock HTTP | `backend/src/test/conversation-search.spec.ts`, `backend/src/test/conversation-search.integration.spec.ts` | list/filter/search assertions                           |
| `GET /api/conversations/canned-responses` | yes     | true no-mock HTTP | `backend/src/test/conversations-extras.spec.ts`                                                            | canned responses list success                           |
| `POST /api/conversations`                 | yes     | true no-mock HTTP | `API_tests/run_api_tests.sh`                                                                               | conversation create success                             |
| `GET /api/conversations/:id`              | yes     | true no-mock HTTP | `API_tests/run_api_tests.sh`                                                                               | conversation detail fetch                               |
| `POST /api/conversations/:id/messages`    | yes     | true no-mock HTTP | `API_tests/run_api_tests.sh`                                                                               | message send success                                    |
| `POST /api/conversations/:id/archive`     | yes     | true no-mock HTTP | `backend/src/test/conversations-extras.spec.ts`                                                            | archive success                                         |
| `POST /api/conversations/:id/voice`       | yes     | true no-mock HTTP | `backend/src/test/conversations-extras.spec.ts`                                                            | voice upload success                                    |
| `GET /api/conversations/voice/:fileName`  | yes     | true no-mock HTTP | `backend/src/test/voice-access.spec.ts`                                                                    | voice retrieval success                                 |
| `POST /api/admin/canned-responses`        | yes     | true no-mock HTTP | `backend/src/test/conversations-extras.spec.ts`                                                            | admin canned response creation                          |
| `GET /api/campaigns/active`               | yes     | true no-mock HTTP | `backend/src/test/campaigns-admin.spec.ts`                                                                 | active campaigns retrieval                              |
| `GET /api/admin/campaigns`                | yes     | true no-mock HTTP | `backend/src/test/campaigns-admin.spec.ts`                                                                 | admin list                                              |
| `POST /api/admin/campaigns`               | yes     | true no-mock HTTP | `backend/src/test/campaigns-admin.spec.ts`                                                                 | admin create                                            |
| `PUT /api/admin/campaigns/:id`            | yes     | true no-mock HTTP | `backend/src/test/campaigns-admin.spec.ts`                                                                 | admin update                                            |
| `DELETE /api/admin/campaigns/:id`         | yes     | true no-mock HTTP | `backend/src/test/campaigns-admin.spec.ts`                                                                 | admin delete                                            |
| `GET /api/admin/sensitive-words`          | yes     | true no-mock HTTP | `backend/src/test/campaigns-admin.spec.ts`                                                                 | list sensitive words                                    |
| `POST /api/admin/sensitive-words`         | yes     | true no-mock HTTP | `backend/src/test/campaigns-admin.spec.ts`                                                                 | add word success                                        |
| `DELETE /api/admin/sensitive-words/:id`   | yes     | true no-mock HTTP | `backend/src/test/campaigns-admin.spec.ts`                                                                 | remove word success                                     |
| `GET /api/settlements`                    | yes     | true no-mock HTTP | `backend/src/test/settlements-mutations.spec.ts`                                                           | list success                                            |
| `GET /api/settlements/:id`                | yes     | true no-mock HTTP | `backend/src/test/settlement-auth.spec.ts`                                                                 | owner read success                                      |
| `POST /api/settlements/generate-monthly`  | yes     | true no-mock HTTP | `API_tests/run_api_tests.sh`                                                                               | generation success                                      |
| `POST /api/settlements/freight/calculate` | yes     | true no-mock HTTP | `API_tests/run_api_tests.sh`                                                                               | freight calc success                                    |
| `POST /api/settlements/:id/approve-step1` | yes     | true no-mock HTTP | `backend/src/test/settlement-sod.spec.ts`                                                                  | step1 approval success                                  |
| `POST /api/settlements/:id/approve-step2` | yes     | true no-mock HTTP | `backend/src/test/settlement-sod.spec.ts`                                                                  | step2 approval success                                  |
| `POST /api/settlements/:id/reject`        | yes     | true no-mock HTTP | `backend/src/test/settlements-mutations.spec.ts`                                                           | reject success                                          |
| `POST /api/settlements/:id/reconcile`     | yes     | true no-mock HTTP | `backend/src/test/settlements-mutations.spec.ts`                                                           | reconcile success                                       |
| `GET /api/settlements/export/:id`         | yes     | true no-mock HTTP | `backend/src/test/settlement-auth.spec.ts`                                                                 | vendor/admin CSV export `200` + headers/body assertions |
| `GET /api/credits/me`                     | yes     | true no-mock HTTP | `backend/src/test/credits-http.spec.ts`                                                                    | own credits retrieval                                   |
| `GET /api/credits/:userId`                | yes     | true no-mock HTTP | `backend/src/test/credits-http.spec.ts`                                                                    | admin/owner retrieval                                   |
| `POST /api/credits/compute/:userId`       | yes     | true no-mock HTTP | `backend/src/test/credits-http.spec.ts`                                                                    | compute success                                         |
| `GET /api/audit`                          | yes     | true no-mock HTTP | `backend/src/test/audit-http.spec.ts`                                                                      | admin paginated audit log success                       |
| `GET /api/admin/audit`                    | yes     | true no-mock HTTP | `API_tests/run_api_tests.sh`                                                                               | admin audit list success                                |
| `GET /api/admin/audit/:id/verify`         | yes     | true no-mock HTTP | `API_tests/run_api_tests.sh`                                                                               | verify success                                          |
| `POST /api/admin/audit/retention`         | yes     | true no-mock HTTP | `backend/src/test/audit-http.spec.ts`                                                                      | retention success                                       |
| `POST /api/admin/audit/export`            | yes     | true no-mock HTTP | `backend/src/test/audit-http.spec.ts`                                                                      | audit export enqueue success                            |
| `GET /api/exports/jobs`                   | yes     | true no-mock HTTP | `backend/src/test/export-lifecycle.spec.ts`                                                                | list jobs success                                       |
| `POST /api/exports/jobs`                  | yes     | true no-mock HTTP | `backend/src/test/export-lifecycle.spec.ts`                                                                | create job success                                      |
| `GET /api/exports/jobs/:id`               | yes     | true no-mock HTTP | `backend/src/test/export-lifecycle.spec.ts`                                                                | status retrieval success                                |
| `GET /api/exports/jobs/:id/download`      | yes     | true no-mock HTTP | `backend/src/test/export-lifecycle.spec.ts`                                                                | download lifecycle success                              |
| `POST /api/query`                         | yes     | true no-mock HTTP | `backend/src/test/query-tenant.spec.ts`, `backend/src/test/masking.spec.ts`                                | execute query + tenant checks                           |
| `POST /api/query/save`                    | yes     | true no-mock HTTP | `backend/src/test/query-saved.spec.ts`                                                                     | save success                                            |
| `GET /api/query/saved`                    | yes     | true no-mock HTTP | `backend/src/test/query-saved.spec.ts`                                                                     | list saved queries                                      |
| `DELETE /api/query/saved/:id`             | yes     | true no-mock HTTP | `backend/src/test/query-saved.spec.ts`                                                                     | delete success                                          |

## API Test Classification

1. **True No-Mock HTTP**
   - `backend/src/test/*.spec.ts` using full app bootstrap (`createTestApp()` + `request(ctx.app.getHttpServer())`).
   - `API_tests/run_api_tests.sh` executing real HTTP requests.

2. **HTTP with Mocking**
   - **None detected** in backend HTTP spec suite.

3. **Non-HTTP (unit/integration without HTTP)**
   - `backend/src/test/audit-chain.spec.ts`, `backend/src/test/audit-hash.spec.ts`.
   - `unit_tests/*.test.ts` (mocked unit tests).

## Mock Detection

- Frontend:
  - `vi.mock('react-router-dom')` in `frontend/src/pages/__tests__/Login.test.tsx`.
  - MSW interception (`http`, `HttpResponse`) across frontend tests.
- Backend unit tests:
  - Mock-based unit architecture in `unit_tests/mocks/*`.
- Backend HTTP specs:
  - no `jest.mock` / DI override markers found.

## Coverage Summary

- Total endpoints: **54**
- Endpoints with HTTP tests (any): **54**
- Endpoints with true no-mock handler-path coverage: **54**

Metrics:

- HTTP coverage = `54 / 54 = 100.00%`
- True API coverage = `54 / 54 = 100.00%`

## Unit Test Summary

### Backend Unit Tests

Evidence:

- `unit_tests/*.test.ts` (service/policy/security-focused)
- non-HTTP backend tests in `backend/src/test/audit-*.spec.ts`

Modules covered:

- **Controllers**: broadly via HTTP integration specs.
- **Services**: credits, exports lifecycle, settlements policy/calculation/scheduler, conversations search, audit retention/hash-chain.
- **Repositories/data boundaries**: covered via unit and integration checks.
- **Auth/guards/middleware/security**: rate limiting, sanitizer/redaction, risk context, secret handling.

Important backend modules NOT tested:

- No significant endpoint-level module gap found under strict HTTP success-path definition.

### Frontend Unit Tests (strict requirement)

Frontend unit tests detected:

- page tests under `frontend/src/pages/__tests__/*.test.tsx`
- feature tests under `frontend/src/test/*.test.tsx`
- utility tests under `frontend/src/lib/*.test.ts`

Framework/tools detected:

- Vitest, React Testing Library, MSW, jsdom.

Covered frontend modules include:

- `pages/Login`, `pages/Listings`, `pages/ListingDetail`, `pages/Conversations`
- `pages/admin/Settlements`, `pages/admin/Exports`, `pages/admin/Audit`, `pages/admin/Query`, `pages/admin/Config`
- routing/shell components via `frontend/src/test/routing-shell.test.tsx` (`ProtectedRoute`, `Layout`, `App` route behavior)

Important frontend modules not directly unit-tested:

- No high-impact page-level gap detected in current route surface.

**Mandatory verdict:** **Frontend unit tests: PRESENT**

### Cross-Layer Observation

- Backend API and frontend unit coverage are now comparatively well balanced.
- FE↔BE E2E smoke exists (`e2e/tests/smoke.spec.ts`).

## API Observability Check

Strong observability examples:

- `backend/src/test/listings-mutations.spec.ts`
- `backend/src/test/audit-http.spec.ts`
- `backend/src/test/settlement-auth.spec.ts`
- `backend/src/test/export-lifecycle.spec.ts`

Weak pocket:

- `backend/src/test/protected-routes-401.spec.ts` is intentionally status/guard-heavy.

Observability verdict: **Good overall.**

## Test Quality & Sufficiency

- Success paths: strong and broad.
- Failure/edge cases: role/ownership/validation/not-found cases present.
- Integration boundaries: robust via real app + HTTP layer.
- Over-mocking risk: high in `unit_tests` (expected for unit scope), low in backend HTTP specs.

`run_tests.sh` strict check:

- `unit`, `frontend`, `backend`, `api`, `e2e` stages all execute via Docker Compose profiles/services.
- Supporting Dockerized test artifacts exist:
  - `API_tests/Dockerfile`
  - `e2e/Dockerfile`
  - `docker-compose.yml` services `test-api`, `test-e2e`.
- Result: test execution orchestration is now Docker-contained.

## End-to-End Expectations

- Fullstack FE↔BE tests should exist.
- Evidence found: `e2e/tests/smoke.spec.ts`.
- Verdict: **Present**.

## Tests Check

- Static-only constraint respected.
- Endpoint and true no-mock API coverage complete (54/54).
- Docker-contained test runner objective for test orchestration is met.

## Test Coverage Score (0–100)

**97 / 100**

## Score Rationale

- - 100% endpoint coverage.
- - 100% true no-mock handler-path coverage.
- - Broad backend integration and frontend unit coverage (including route shell tests).
- - Dockerized test orchestration now includes API and E2E container stages.
- − Minor observability shallowness remains in guard-matrix-only suites.

## Key Gaps

1. Minor test-depth gap: guard matrix (`protected-routes-401.spec.ts`) remains mostly status-centric by design.

## Confidence & Assumptions

- Confidence: **High** for route inventory and static test mapping.
- Assumption: static evidence reflects active intended test suites; runtime pass/fail intentionally not evaluated.

---

# README Audit

## README Location

- Required file exists at `repo/README.md` ✅

## Hard Gate Evaluation

### Formatting

- Clean markdown structure with readable sections and code blocks ✅

### Startup Instructions

- Required command present: `docker-compose up --build` ✅

### Access Method

- Backend/web URLs and ports documented ✅

### Verification Method

- API verification flow present ✅
- Web UI verification flow present ✅

### Environment Rules (STRICT)

- No runtime install commands are present in README operational/test flows.
- Docker-first wording is explicit for startup and tests.
- Hard-gate result: **PASS** ✅

### Demo Credentials (auth conditional)

- Auth exists and README provides username/email/password for all roles ✅

## Engineering Quality

- Tech stack clarity: strong ✅
- Architecture explanation: strong ✅
- Security/role workflows: strong ✅
- Testing guidance: detailed and aligned with Dockerized test orchestration ✅
- Presentation quality: high ✅

## High Priority Issues

1. No high-priority README issues under strict hard-gate criteria.

## Medium Priority Issues

1. Placeholder clone URL remains generic (`git clone <your-repo-url>`) and should be replaced with the canonical repository URL for operational clarity.

## Low Priority Issues

1. API verification assumes host `jq` availability without explicit prerequisite note.

## Hard Gate Failures

- None.

## README Verdict

**PASS**

---

## Final Verdicts

- **Test Coverage Audit Verdict:** **PASS** (full endpoint and true no-mock coverage with Docker-contained test orchestration).
- **README Audit Verdict:** **PASS** (all strict hard gates satisfied).
