# PetMarket API Specification

## Overview
This document specifies the REST API endpoints exposed by the NestJS backend for the PetMarket Operations & Risk Management system. All endpoints are prefixed with `/api`.

**Last contract sync: 2026-04-08** — aligned to DTO/controller source of truth.

### Base URL
`http://localhost:3001/api`

### Authentication
Most endpoints require a valid JSON Web Token (JWT) provided in the `Authorization` header.
- **Header:** `Authorization: Bearer <token>`

### Global Response Format
All successful responses follow this JSON structure:
```json
{
  "code": 200,
  "msg": "OK",
  "data": { ... }
}
```

Error responses:
```json
{
  "code": 400,
  "msg": "Validation failed",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

---

## 1. Authentication (`/auth`)

### `POST /auth/login`
- **Description:** Authenticate a user and receive a JWT.
- **Body:** `{ "username": "admin", "password": "admin123" }`
  - `password`: minimum 6 characters
- **Headers (optional):** `x-device-fingerprint` — stored AES-256 encrypted
- **Access:** Public
- **Response Data:** `{ "token": "eyJ...", "user": { "id": "uuid", "username": "admin", "role": "admin" } }`

### `POST /auth/register`
- **Description:** Register a new user account. Role defaults to `shopper`. To assign `vendor`, `ops_reviewer`, `finance_admin`, or `admin`, an admin must call `PATCH /users/:id/role` after registration.
- **Body:**
  ```json
  { "username": "shopper2", "password": "password123", "email": "shopper2@example.com" }
  ```
  - `username`: 3–30 characters, unique
  - `password`: minimum 8 characters
  - `email`: valid email address (required)
- **Access:** Public

---

## 2. Users (`/users`)

All `/users` endpoints require JWT.

### `GET /users/me`
- **Description:** Get the current authenticated user's profile.
- **Access:** Any authenticated user.

### `GET /users`
- **Description:** Paginated list of all users (sanitized for admin view).
- **Query Params:** `page` (default 1), `limit` (default 50)
- **Access:** Admin only

### `PATCH /users/:id/role`
- **Description:** Assign any role to an existing user. Used to promote users to `ops_reviewer` or `finance_admin` for the two-step settlement workflow. Role change is audit-logged.
- **Body:** `{ "role": "ops_reviewer" }`
  - Allowed values: `shopper` · `vendor` · `admin` · `ops_reviewer` · `finance_admin`
- **Access:** Admin only

### `PATCH /users/:id/active`
- **Description:** Activate or deactivate a user account. Change is audit-logged.
- **Body:** `{ "isActive": false }`
- **Access:** Admin only

---

## 3. Listings (`/listings`)

### `GET /listings`
- **Description:** Retrieve paginated market listings. Supports multi-dimensional filtering and sorting.
- **Access:** Public (no auth required)
- **Query Params** — all optional:

| Param         | Type    | Description                                               |
|---------------|---------|-----------------------------------------------------------|
| `q`           | string  | Full-text keyword search (title, description, breed)      |
| `breed`       | string  | Exact breed filter                                        |
| `region`      | string  | Exact region filter                                       |
| `minAge`      | number  | Minimum age in months                                     |
| `maxAge`      | number  | Maximum age in months                                     |
| `minPrice`    | number  | Minimum price (USD)                                       |
| `maxPrice`    | number  | Maximum price (USD)                                       |
| `minRating`   | number  | Minimum rating                                            |
| `maxRating`   | number  | Maximum rating                                            |
| `newArrivals` | boolean | `true` to show only recently added listings               |
| `sort`        | string  | `price_asc` · `price_desc` · `rating_desc` · `newest`    |
| `page`        | number  | Page number (default: 1)                                  |
| `limit`       | number  | Items per page (default: 20)                              |

- **Response:** `{ items: Listing[], total, page, limit, totalPages }`

### `GET /listings/suggest`
- **Description:** Get autocomplete suggestions for a keyword.
- **Query Params:** `q` (string)

### `GET /listings/:id`
- **Description:** Get detailed information for a specific listing. Vendor relation is sanitized (only `id`, `username`, `role` exposed).
- **Access:** Public; authenticated users may see additional fields

### `POST /listings`
- **Description:** Create a new listing. Rate-limited: 30 listings/hour/vendor. Listings containing sensitive words are saved with `status=pending_review` and `sensitiveWordFlagged=true`.
- **Body:**
  ```json
  { "title": "...", "description": "...", "breed": "...", "age": 3, "region": "...", "priceUsd": 900 }
  ```
  - `photos` (optional): string array of photo URLs
- **Access:** Vendor, Admin

### `PUT /listings/:id`
- **Description:** Update an existing listing.
- **Access:** Vendor (owner only), Admin

### `DELETE /listings/:id`
- **Description:** Soft-delete (archive) a listing.
- **Access:** Vendor (owner only), Admin

---

## 4. Conversations (`/conversations`)

### `GET /conversations`
- **Description:** List conversations for the current user (vendor sees their own, shopper sees their own).
- **Access:** Authenticated

### `POST /conversations`
- **Description:** Start a new conversation regarding a listing. Rate-limited: 10 new conversations/10 min/account.
- **Access:** Shopper

### `GET /conversations/:id`
- **Description:** Get the message history and full context of a conversation.
- **Access:** Conversation participant (vendor or shopper), Admin

### `POST /conversations/:id/messages`
- **Description:** Send a text message to a conversation. Supports internal notes for Admin/Vendor.
- **Body:** `{ "content": "Hello", "isInternal": false }`
- **Access:** Conversation participant

### `POST /conversations/:id/voice`
- **Description:** Upload a local audio file as a voice note.
- **Requires:** `multipart/form-data` with field name **`audio`** (file, `audio/*` MIME types only)
- **Response:** `{ "audioUrl": "/api/conversations/voice/<filename>" }` — secure URL, not a public static path
- **Access:** Conversation participant

### `GET /conversations/voice/:fileName`
- **Description:** Stream a stored voice recording. Admin bypasses all checks; vendor and shopper must be conversation participants. Filename must match `/^[\w.-]+$/` (path traversal rejected).
- **Access:** Authenticated; participant check enforced for non-admin

### `POST /conversations/:id/archive`
- **Description:** Archive the conversation.
- **Access:** Vendor, Admin

### `GET /conversations/canned-responses`
- **Description:** Retrieve configured canned responses available to vendors and admins.
- **Access:** Vendor, Admin

---

## 5. Settlements (`/settlements`)

All `/settlements` endpoints require JWT. Access roles are noted per endpoint.

### `GET /settlements`
- **Description:** List monthly settlements. Vendors see only their own; `ops_reviewer` and `finance_admin` see all pending/reviewer-approved settlements; admin sees all.
- **Query Params:**
  - `month` (string, `YYYY-MM` format)
  - `status` (string): `pending` · `reviewer_approved` · `finance_approved` · `rejected`
- **Access:** Admin, Vendor, ops_reviewer, finance_admin

### `GET /settlements/:id`
- **Description:** Get a single settlement with variance reconciliation detail.
- **Access:** Admin, Vendor (own only), ops_reviewer, finance_admin

### `POST /settlements/generate-monthly`
- **Description:** Generate monthly settlement statements for all vendors based on completed transactions.
- **Body:** `{ "month": "2025-01" }` — `YYYY-MM` format required
- **Access:** Admin only

### `POST /settlements/freight/calculate`
- **Description:** Calculate offline freight cost breakdown.
- **Body** — all fields required:
  ```json
  {
    "distanceMiles": 50,
    "weightLbs": 20,
    "dimWeightLbs": 15,
    "isOversized": false,
    "isWeekend": false
  }
  ```
- **Response:**
  ```json
  {
    "billableWeight": 20,
    "baseCost": 45.00,
    "perPoundCharge": 15.00,
    "oversizedSurcharge": 0,
    "subtotalBeforeWeekend": 60.00,
    "weekendSurcharge": 0,
    "subtotalBeforeTax": 60.00,
    "salesTax": 4.95,
    "total": 64.95
  }
  ```
- **Access:** Admin, Vendor

### `POST /settlements/:id/approve-step1`
- **Description:** First step of two-step settlement approval. Settlement must be in `pending` status.
- **Access:** `ops_reviewer` **only** — admin is explicitly blocked (separation of duties is technically enforced, not just documented)

### `POST /settlements/:id/approve-step2`
- **Description:** Second and final step of settlement approval. Settlement must be in `reviewer_approved` status. The step-2 approver must be a **different user** than the step-1 approver.
- **Access:** `finance_admin` **only** — admin is explicitly blocked (SoD enforced)

### `POST /settlements/:id/reject`
- **Description:** Reject a settlement at any pending approval step.
- **Body:** `{ "reason": "Variance too large" }`
- **Access:** ops_reviewer, finance_admin, Admin

### `GET /settlements/export/:id`
- **Description:** Export settlement statement as CSV (`Content-Type: text/csv`).
- **Access:** Admin, Vendor (own only), ops_reviewer, finance_admin

---

## 6. Campaigns & Operations (`/campaigns` & `/admin/campaigns`)

### `GET /campaigns/active`
- **Description:** Get currently active announcements and carousel recommendations.
- **Access:** Public

### `POST /admin/campaigns`
- **Description:** Schedule and publish a new campaign slot.
- **Body:** `{ "title": "...", "startTime": "...", "endTime": "..." }`
- **Access:** Admin

### `POST /admin/canned-responses`
- **Description:** Create or update standard canned responses for vendors.
- **Access:** Admin

---

## 7. Credits & Risk Control (`/credits`)

### `GET /credits/me`
- **Description:** Get current credit score and 90-day trailing metrics for the authenticated user. Shopper metrics are conversation-based; vendor metrics are settlement-based.
- **Access:** Authenticated user

### `GET /credits/:userId`
- **Description:** Get credit score for a specific user. Non-admin callers can only view their own score.
- **Access:** Admin (any user); others (own score only)

### `POST /credits/compute/:userId`
- **Description:** Force recompute credit score based on recent activity.
- **Scoring formula:** `clamp((successRate×0.5 − disputeRate×0.3 − cancelRate×0.2) × 1000, 0, 1000)`
- **Vendor metrics:** settlement success rate, listing cancellation rate, conversation dispute rate
- **Shopper metrics:** conversation success rate (non-disputed + non-archived), conversation cancellation rate (archived + non-disputed), conversation dispute rate
- **Access:** Admin

---

## 8. Data Queries (`/query`)

### `POST /query/execute`
- **Description:** Execute dynamic data query with combined filter conditions and sorting.
- **Body:**
  ```json
  {
    "entity": "listings",
    "filters": [{ "field": "region", "op": "eq", "value": "California" }],
    "sort": { "field": "priceUsd", "dir": "ASC" },
    "page": 1,
    "limit": 20
  }
  ```
  - `entity`: `listings` · `conversations` · `settlements`
  - `op` values: `eq` · `gt` · `lt` · `gte` · `lte` · `contains` · `in`
- **Access:** Admin

### `POST /query/save`
- **Description:** Save a custom configured query by name.
- **Access:** Authenticated

### `GET /query/saved`
- **Description:** Get the authenticated user's saved queries.
- **Access:** Authenticated

### `DELETE /query/saved/:id`
- **Description:** Delete a saved query.
- **Access:** Owner

---

## 9. Audit & Exports (`/admin/audit` & `/exports`)

### `GET /admin/audit`
- **Description:** Search and view the tamper-evident SHA-256 hash-chained audit logs.
- **Query Params:** `actorId`, `entityType`, `action` (partial), `startDate`, `endDate`, `keyword`, `page`, `limit` (max 200)
- **Access:** Admin

### `GET /admin/audit/:id/verify`
- **Description:** Cryptographically verify the SHA-256 hash-chain integrity of a log entry.
- **Response:** `{ "valid": true, "entry": { ... } }`
- **Access:** Admin

### `POST /exports/jobs`
- **Description:** Trigger an asynchronous data export job. Maximum 2 concurrent jobs (`queued` or `running`) per user. Files expire after 7 days. Non-admin exports mask vendor email with `***`.
- **Body:**
  ```json
  { "type": "listings", "filters": {} }
  ```
  - `type`: `listings` · `conversations` · `settlements` · `audit`
  - **Note:** `users` is NOT a valid export type; use `GET /users` for user data.
- **Access:** Authenticated

### `GET /exports/jobs`
- **Description:** View status of background export jobs for the authenticated user.
- **Access:** Authenticated

### `GET /exports/jobs/:id/download`
- **Description:** Download the generated CSV export file.
- **Access:** Job owner

---

## Contract Alignment Notes

This section records corrections made during past alignment passes. Code is the source of truth.

### 2026-04-08 alignment

| Location | Was | Now | Reason |
|---|---|---|---|
| `GET /listings` query params | `age`, `priceMin`, `priceMax`, `rating`, `search` | `minAge`/`maxAge`, `minPrice`/`maxPrice`, `minRating`/`maxRating`, `q` | Canonical DTO field names (`SearchListingsDto`) |
| `POST /settlements/freight/calculate` body | `billableWeight`, `measurements` | `weightLbs`, `dimWeightLbs`, `isOversized` | Canonical DTO field names (`FreightCalcDto`) |
| `POST /settlements/:id/approve-step1` access | "Ops Reviewer (Admin specific scope)" | `ops_reviewer` only; admin blocked | `@Roles('ops_reviewer')` — SoD technically enforced |
| `POST /settlements/:id/approve-step2` access | "Finance Admin (Admin specific scope)" | `finance_admin` only; admin blocked | `@Roles('finance_admin')` — SoD technically enforced |
| `POST /query` | missing `/execute` suffix | `POST /query/execute` | Actual controller route |
| `POST /exports/jobs` type list | `listings\|settlements\|audit` | added `conversations` | All 4 types in `EXPORT_ALLOWED_TYPES` |
| `POST /auth/register` description | "use the admin panel to promote to vendor" | Use `PATCH /users/:id/role` | New admin role-management endpoints |
| Added endpoints | — | `GET /users`, `PATCH /users/:id/role`, `PATCH /users/:id/active`, `GET /settlements/:id`, `POST /settlements/:id/reject`, `DELETE /query/saved/:id` | Previously undocumented |

### 2026-04-03 alignment

| Location | Was | Now |
|---|---|---|
| `README.md` Services table | `localhost:5432` | `localhost:5433` |
| `app.module.ts` `DB_PASSWORD` fallback | `petmarket_pass` | `petmarket_secret` |
| `POST /conversations/:id/voice` form field | `file` | `audio` |
| `POST /auth/register` example | no `email`, password `"pwd"` | `email` required, password min 8 chars |
