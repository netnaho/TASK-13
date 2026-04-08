# PetMarket API Specification

**Last contract sync: 2026-04-08** — aligned to DTO/controller source of truth.

Base URL: `http://localhost:3001/api`

All responses are wrapped in the standard envelope:

```json
{ "code": 200, "msg": "OK", "data": <payload> }
```

Errors:

```json
{ "code": 400, "msg": "Validation failed: field is required", "timestamp": "2024-01-01T00:00:00Z" }
```

Authentication: `Authorization: Bearer <jwt_token>`

---

## Auth

### POST /auth/register

Create a new account. Default role: `shopper`.

**Request body**

| Field      | Type   | Constraints              |
|------------|--------|--------------------------|
| `username` | string | 3–30 characters, unique  |
| `password` | string | min 8 characters         |
| `email`    | string | valid email format       |

**Response** — `UserView` (email masked as `***` for non-admin callers)

---

### POST /auth/login

**Request body**

| Field      | Type   | Constraints    |
|------------|--------|----------------|
| `username` | string | required       |
| `password` | string | min 6 chars    |

**Headers (optional)**

| Header                  | Description                   |
|-------------------------|-------------------------------|
| `x-device-fingerprint`  | Client device fingerprint; AES-256 encrypted at rest |

**Response**

```json
{ "token": "eyJ...", "user": { "id": "uuid", "username": "...", "role": "shopper", ... } }
```

---

## Users

All `/users` endpoints require JWT.

### GET /users/me

Returns the authenticated user's own profile.

**Response** — `UserView`

---

### GET /users *(admin only)*

Paginated list of all users.

**Query parameters**

| Param   | Type   | Default | Description        |
|---------|--------|---------|--------------------|
| `page`  | number | 1       | Page number        |
| `limit` | number | 50      | Items per page     |

**Response** — `{ items: UserView[], total: number }`

---

### PATCH /users/:id/role *(admin only)*

Assign any role to an existing user. Use this to promote users to `ops_reviewer` or `finance_admin` for the two-step settlement approval workflow.

**Path** — `:id` must be a valid UUID.

**Request body**

| Field  | Type   | Allowed values                                              |
|--------|--------|-------------------------------------------------------------|
| `role` | string | `shopper` · `vendor` · `admin` · `ops_reviewer` · `finance_admin` |

**Response** — updated `UserView`

**Audit** — action `user.role_changed` is appended to the hash chain.

---

### PATCH /users/:id/active *(admin only)*

Activate or deactivate a user account.

**Request body**

| Field      | Type    |
|------------|---------|
| `isActive` | boolean |

**Response** — updated `UserView`

---

## Listings

### GET /listings

Search listings. Public endpoint (no auth required).

**Query parameters** — all optional

| Param        | Type    | Description                                             |
|--------------|---------|---------------------------------------------------------|
| `q`          | string  | Full-text keyword search (title, description, breed)    |
| `breed`      | string  | Exact breed filter                                      |
| `region`     | string  | Exact region filter                                     |
| `minAge`     | number  | Minimum age (months)                                    |
| `maxAge`     | number  | Maximum age (months)                                    |
| `minPrice`   | number  | Minimum price (USD)                                     |
| `maxPrice`   | number  | Maximum price (USD)                                     |
| `minRating`  | number  | Minimum rating                                          |
| `maxRating`  | number  | Maximum rating                                          |
| `newArrivals`| boolean | `true` to show only recently added listings             |
| `sort`       | string  | `price_asc` · `price_desc` · `rating_desc` · `newest`  |
| `page`       | number  | Page number (default: 1)                                |
| `limit`      | number  | Items per page (default: 20)                            |

**Response** — `{ items: Listing[], total: number, page: number, limit: number, totalPages: number }`

When `items` is empty the response may include a `fallback` object:
```json
{ "fallback": { "similarBreed": [...], "trending": [...] } }
```

**Frontend UI filter coverage** (sidebar in `frontend/src/pages/Listings.tsx`)

| Filter param  | UI control          | Notes                    |
|---------------|---------------------|--------------------------|
| `q`           | Search text input   | Debounced; requires Enter or Apply |
| `breed`       | Breed select        |                          |
| `region`      | Region text input   | Fires on change          |
| `sort`        | Sort select         |                          |
| `newArrivals` | Checkbox            |                          |
| `minPrice`    | Min $ number input  | Fires on change          |
| `maxPrice`    | Max $ number input  | Fires on change          |
| `minAge`      | Min age number input | Fires on change (months) |
| `maxAge`      | Max age number input | Fires on change (months) |
| `minRating`   | Min ★ number input  | 0–5, step 0.1            |
| `maxRating`   | Max ★ number input  | 0–5, step 0.1            |

---

### GET /listings/suggest

Autocomplete suggestions.

**Query parameters**

| Param | Type   | Description           |
|-------|--------|-----------------------|
| `q`   | string | Partial search string |

**Response** — `string[]`

---

### GET /listings/:id

Get a single listing by UUID. `OptionalJwtAuthGuard` — authenticated users see additional fields.

**Response** — `Listing` (vendor relation sanitized: only `id`, `username`, `role`)

---

### POST /listings *(vendor, admin)*

Create a new listing. Rate-limited: 30 listings/hour/vendor.

Listings containing sensitive words are saved with `status=pending_review` and `sensitiveWordFlagged=true`.

**Request body**

| Field         | Type     | Constraints        |
|---------------|----------|--------------------|
| `title`       | string   | required           |
| `description` | string   | required           |
| `breed`       | string   | required           |
| `age`         | number   | positive integer   |
| `region`      | string   | required           |
| `priceUsd`    | number   | positive number    |
| `photos`      | string[] | optional           |

---

### PUT /listings/:id *(vendor owner, admin)*

Update a listing. Vendor may only update their own listings.

---

### DELETE /listings/:id *(vendor owner, admin)*

Soft-delete (archive) a listing.

---

## Settlements

### GET /settlements

List settlements. Vendors see only their own; `ops_reviewer` and `finance_admin` see all settlements; admin sees all.

**Access:** admin, vendor, ops_reviewer, finance_admin

**Query parameters**

| Param    | Type   | Allowed values                                                |
|----------|--------|---------------------------------------------------------------|
| `month`  | string | `YYYY-MM` format                                              |
| `status` | string | `pending` · `reviewer_approved` · `finance_approved` · `rejected` |

---

### GET /settlements/:id

Get a single settlement with variance reconciliation detail.

**Access:** admin, vendor (own only), ops_reviewer, finance_admin

---

### POST /settlements/generate-monthly *(admin)*

Generate monthly settlement statements for all vendors.

**Request body**

| Field   | Type   | Constraints                        |
|---------|--------|------------------------------------|
| `month` | string | `YYYY-MM` format (required)        |

---

### POST /settlements/:id/approve-step1 *(ops_reviewer only)*

First step of the two-step approval. Settlement must be in `pending` status.

> **Note:** Endpoint is `/approve-step1` — there is no `/approve` shortcut.
> Admin cannot perform this step (separation of duties is technically enforced).

---

### POST /settlements/:id/approve-step2 *(finance_admin only)*

Second step of the two-step approval. Settlement must be in `reviewer_approved` status.
The step-2 approver must be a different user than the step-1 approver.

> **Note:** Endpoint is `/approve-step2`.

---

### POST /settlements/:id/reject *(ops_reviewer, finance_admin, admin)*

Reject a settlement.

**Request body**

| Field    | Type   |
|----------|--------|
| `reason` | string |

---

### POST /settlements/freight/calculate *(admin, vendor)*

Calculate freight cost breakdown.

**Request body** — all fields required

| Field           | Type    | Description                         |
|-----------------|---------|-------------------------------------|
| `distanceMiles` | number  | Shipping distance in miles          |
| `weightLbs`     | number  | Actual weight in pounds             |
| `dimWeightLbs`  | number  | Dimensional weight in pounds        |
| `isOversized`   | boolean | Whether the shipment is oversized   |
| `isWeekend`     | boolean | Whether delivery is on a weekend    |

**Response**

```json
{
  "billableWeight": 12.5,
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

---

### GET /settlements/export/:id *(admin, vendor, ops_reviewer, finance_admin)*

Download settlement as CSV. Returns binary stream with `Content-Type: text/csv`. Vendor can only export their own settlements.

---

## Credits

### GET /credits/me *(authenticated)*

Get the authenticated user's credit score. Uses conversation-based metrics for shoppers and settlement-based metrics for vendors.

**Response** — `CreditScore`

---

### GET /credits/:userId *(authenticated)*

Get another user's credit score. Non-admin callers can only view their own score.

---

### POST /credits/compute/:userId *(admin only)*

Trigger recomputation of a user's credit score.

**Scoring formula (shared by all roles):**

```
score = clamp(
  (transactionSuccessRate × 0.5 − disputeRate × 0.3 − cancellationRate × 0.2) × 1000,
  0, 1000
)
```

**Vendor metrics:**
- `transactionSuccessRate` = settlements with `finance_approved` / total settlements (90-day window)
- `disputeRate` = disputed conversations / total conversations (90-day window)
- `cancellationRate` = archived listings / total listings (90-day window)

**Shopper metrics:**
- `transactionSuccessRate` = (non-disputed, non-archived conversations) / total shopper conversations
- `disputeRate` = disputed conversations / total shopper conversations
- `cancellationRate` = archived (non-disputed) conversations / total shopper conversations

Default score (no history): **500**

---

## Conversations

### GET /conversations *(authenticated)*

List conversations for the authenticated user.

---

### POST /conversations *(shopper)*

Start a new conversation about a listing. Rate-limited: 10 new conversations/10 min/account.

---

### GET /conversations/:id/messages *(participant)*

Get messages in a conversation.

---

### POST /conversations/:id/messages *(participant)*

Send a message (text or voice note).

---

### POST /conversations/:id/voice *(participant)*

Upload a voice note audio file to a conversation.

- **Requires:** `multipart/form-data` with field name **`audio`** (`audio/*` MIME types only)
- **Response:** `{ "audioUrl": "/api/conversations/voice/<filename>" }` — returns a secured URL, not a public static path

---

### GET /conversations/voice/:fileName *(authenticated participant)*

Stream a voice recording. Access is gated: admin bypasses lookup; vendor and shopper must be conversation participants.

Path traversal is rejected: filename must match `/^[\w.-]+$/`.

---

## Audit

### GET /admin/audit *(admin)*

Filtered audit log with pagination.

**Query parameters**

| Param        | Type   | Description                         |
|--------------|--------|-------------------------------------|
| `actorId`    | string | Filter by actor                     |
| `entityType` | string | Filter by entity type               |
| `action`     | string | Partial match on action string      |
| `startDate`  | string | ISO 8601 date                       |
| `endDate`    | string | ISO 8601 date                       |
| `keyword`    | string | Substring search in before/after    |
| `page`       | number | Page number                         |
| `limit`      | number | Max 200                             |

---

### GET /admin/audit/:id/verify *(admin)*

Verify the SHA-256 hash-chain integrity of a specific audit log entry.

**Response**

```json
{ "valid": true, "entry": { ... } }
```

---

## Exports

### POST /exports/jobs *(authenticated)*

Queue an export job. Maximum 2 concurrent jobs (`queued` or `running`) per user.

**Request body**

| Field     | Type   | Allowed values                                  |
|-----------|--------|-------------------------------------------------|
| `type`    | string | `listings` · `conversations` · `settlements` · `audit` |
| `filters` | object | Optional query filters                          |

> **Note:** `users` is NOT a valid export type — use `GET /users` for user data.

Files expire after 7 days. Exports include a watermark row identifying the requester.
Non-admin exports mask vendor email with `***`.

---

### GET /exports/jobs *(authenticated)*

List the authenticated user's export jobs. Each item in the array is an `ExportJob` object.

**ExportJob object**

| Field             | Type            | Notes                                                                 |
|-------------------|-----------------|-----------------------------------------------------------------------|
| `id`              | string (UUID)   |                                                                       |
| `requesterId`     | string (UUID)   |                                                                       |
| `status`          | string          | `queued` · `running` · `done` · `failed` · `expired`                 |
| `params`          | object          | `{ type, filters }` as submitted                                      |
| `filePath`        | string \| null  | Populated when `status=done`                                          |
| `expiresAt`       | ISO string      | 7 days after creation                                                 |
| `createdAt`       | ISO string      |                                                                       |
| `progressPercent` | int 0–100 \| null | **Optional.** Null on legacy rows. Consumers should treat null as 0. |
| `progressStage`   | string \| null  | **Optional.** One of `starting` · `data_fetched` · `file_written` · `done`. |

Progress milestones emitted by the backend processor:

| Stage          | `progressPercent` | `status`  |
|----------------|-------------------|-----------|
| Created        | 0                 | `queued`  |
| Processing started | 10            | `running` |
| Data fetched   | 50                | `running` |
| File written   | 90                | `running` |
| Complete       | 100               | `done`    |
| Failed         | last known value  | `failed`  |

---

### GET /exports/jobs/:id/download *(owner)*

Download the exported CSV file.

---

## Risk

### GET /admin/risk/multi-account *(admin)*

Detect users sharing device fingerprints or IP addresses.

---

## Query (Power Query)

### POST /query/execute *(admin)*

Execute a dynamic query with filters and sorting.

**Request body**

| Field     | Type     | Allowed entities                          |
|-----------|----------|-------------------------------------------|
| `entity`  | string   | `listings` · `conversations` · `settlements` |
| `filters` | array    | `[{ field, op, value }]`                  |
| `sort`    | object   | `{ field, dir: "ASC" | "DESC" }`          |
| `page`    | number   | default 1                                 |
| `limit`   | number   | default 20, max 200                       |

---

### POST /query/save *(authenticated)*

Save a named query for later reuse.

---

### GET /query/saved *(authenticated)*

List saved queries.

---

### DELETE /query/saved/:id *(owner)*

Delete a saved query.

---

## Retention / Archival

The retention job runs daily and archives audit records older than 7 years.

**Strict append-only semantics:** original `AuditLog` rows are NEVER modified after creation.
Instead, a row is inserted into `audit_archival_records` for each eligible entry, and a
tombstone event (`action: audit.retention_archival`) is appended to the hash chain.

The hash chain remains fully verifiable after archival because the content fields
(`action`, `actorId`, `entityType`, `before`, `after`, `hash`, `prevHash`, `createdAt`)
are immutable.
