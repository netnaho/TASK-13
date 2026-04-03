# PetMarket API Specification

## Overview
This document specifies the REST API endpoints exposed by the NestJS backend for the PetMarket Operations & Risk Management system. All endpoints are prefixed with `/api`.

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
- **Access:** Public
- **Response Data:** `{ "token": "eyJ...", "user": { "id": 1, "role": "admin" } }`

### `POST /auth/register`
- **Description:** Register a new user account. Role defaults to `shopper`; use the admin panel to promote to vendor.
- **Body:** `{ "username": "shopper2", "password": "password123", "email": "shopper2@example.com" }`
  - `username`: 3–30 characters
  - `password`: minimum 8 characters
  - `email`: valid email address (required)
- **Access:** Public

---

## 2. Users (`/users`)

### `GET /users/me`
- **Description:** Get the current authenticated user's profile.
- **Access:** Any authenticated user.

---

## 3. Listings (`/listings`)

### `GET /listings`
- **Description:** Retrieve paginated market listings. Supports multi-dimensional filtering and sorting.
- **Query Params:** `breed`, `age`, `region`, `priceMin`, `priceMax`, `rating`, `newArrivals`, `search`
- **Access:** Public / Shopper

### `GET /listings/suggest`
- **Description:** Get autocomplete suggestions and typo corrections for a keyword.
- **Query Params:** `q` (string)

### `GET /listings/:id`
- **Description:** Get detailed information for a specific listing.

### `POST /listings`
- **Description:** Create a new listing. Trigger sensitive word filtering.
- **Body:** `{ "title": "...", "description": "...", "breed": "...", "age": 3, "region": "...", "priceUsd": 900 }`
- **Access:** Vendor

### `PUT /listings/:id`
- **Description:** Update an existing listing.
- **Access:** Vendor (owner)

### `DELETE /listings/:id`
- **Description:** Remove a listing.
- **Access:** Vendor (owner) or Admin

---

## 4. Conversations (`/conversations`)

### `GET /conversations`
- **Description:** List conversations for the current User/Vendor.

### `POST /conversations`
- **Description:** Start a new conversation regarding a listing.
- **Access:** Shopper

### `GET /conversations/:id`
- **Description:** Get the message history and full context of a conversation.

### `POST /conversations/:id/messages`
- **Description:** Send a text message to a conversation. (Supports internal notes if Admin/Vendor).
- **Body:** `{ "content": "Hello", "isInternal": false }`

### `POST /conversations/:id/voice`
- **Description:** Upload a local audio file as a voice note.
- **Requires:** `multipart/form-data` with field name **`audio`** (file, `audio/*` MIME types only, max 10 MB)

### `POST /conversations/:id/archive`
- **Description:** Archive the conversation context.

### `GET /conversations/canned-responses`
- **Description:** Retrieve configured canned responses available to the Vendor/Admin.

---

## 5. Settlements (`/settlements`)

### `GET /settlements`
- **Description:** List monthly settlements with variances and statuses.
- **Access:** Operations Admin / Vendor

### `POST /settlements/generate-monthly`
- **Description:** Generate monthly settlement statements based on completed offline transactions.
- **Access:** Admin

### `POST /settlements/freight/calculate`
- **Description:** Calculate offline freight estimates.
- **Body:** `{ "distanceMiles": 50, "billableWeight": 20, "measurements": {...}, "isWeekend": false }`
- **Access:** Vendor / Admin

### `POST /settlements/:id/approve-step1`
- **Description:** First step of settlement approval.
- **Access:** Ops Reviewer (Admin specific scope)

### `POST /settlements/:id/approve-step2`
- **Description:** Second and final step of settlement approval.
- **Access:** Finance Admin (Admin specific scope)

### `GET /settlements/export/:id`
- **Description:** Export settlement statement for accounting purposes.

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
- **Description:** Get current credit score and 90-day trailing metrics for the authenticated user.
- **Access:** Authenticated user

### `GET /credits/:userId`
- **Description:** Get credit and risk flags (device footprint, IPs) for a specific user.
- **Access:** Admin

### `POST /credits/compute/:userId`
- **Description:** Force recompute credit score based on recent offline transactions and disputes.
- **Access:** Admin

---

## 8. Data Queries (`/query`)

### `POST /query`
- **Description:** Execute dynamic data query with combined conditions.
- **Access:** Admin

### `POST /query/save`
- **Description:** Save a custom configured list query.

### `GET /query/saved`
- **Description:** Get customized saved queries.

---

## 9. Audit & Exports (`/admin/audit` & `/exports`)

### `GET /admin/audit`
- **Description:** Search and view the tamper-evident hash-chained logs.
- **Access:** Admin

### `GET /admin/audit/:id/verify`
- **Description:** Cryptographically verify the SHA-256 hash chain integrity of a log entry.
- **Access:** Admin

### `POST /exports/jobs`
- **Description:** Trigger an asynchronous data export job.
- **Body:** `{ "type": "listings|settlements|audit" }`
- **Access:** Admin

### `GET /exports/jobs`
- **Description:** View status of background export queues (max 2 concurrent limits).
- **Access:** Admin

---

## Contract Alignment Notes

This section records corrections made during the 2026-04-03 alignment pass. All fixes
move the documentation to match the implemented code (code is the source of truth).

### 1. PostgreSQL host port (README)

| Location | Was | Now |
|---|---|---|
| `README.md` Services table | `localhost:5432` | `localhost:5433` |

**Reason:** `docker-compose.yml` maps host port **5433** → container port 5432
(`ports: '5433:5432'`). The backend connects on 5432 _within the Docker network_
(correct), but a developer connecting from the host must use 5433.

### 2. DB password code default (`app.module.ts`)

| Location | Was | Now |
|---|---|---|
| `backend/src/app.module.ts` `DB_PASSWORD` fallback | `petmarket_pass` | `petmarket_secret` |

**Reason:** `docker-compose.yml` and `README.md` both set `petmarket_secret`. The
mismatched code fallback caused local-dev runs outside Docker to fail with an auth
error. `docker-compose.yml` is the authoritative default; `README.md` already
reflected it correctly.

### 3. Voice upload form field name

| Location | Was | Now |
|---|---|---|
| `docs/api-spec.md` `POST /conversations/:id/voice` | `file` | `audio` |

**Reason:** The NestJS controller uses `FileInterceptor('audio', ...)` and the
frontend client appends the file as `formData.append('audio', file)`. The field name
`audio` is enforced server-side — sending `file` returns a 400. The spec was wrong.

### 4. `POST /auth/register` request body

| Field | Spec (old) | DTO / implementation |
|---|---|---|
| `username` | ✓ present | ✓ required, 3–30 chars |
| `password` | `"pwd"` (3 chars) | required, **min 8 chars** |
| `email` | ✗ absent | **required**, valid email |
| `role` | `"shopper"` | **not accepted** — role is assigned server-side |

**Reason:** `RegisterDto` validates `username` (3–30), `password` (min 8), and
`email` (valid format). The `role` field is not in the DTO; passing it causes a 400
from the global `ValidationPipe(forbidNonWhitelisted: true)`. The spec example was
copy-paste inaccurate and would fail validation if used literally.
