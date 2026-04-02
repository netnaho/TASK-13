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
- **Description:** Register a new user account (shopper or vendor).
- **Body:** `{ "username": "shopper2", "password": "pwd", "role": "shopper" }`
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
- **Requires:** `multipart/form-data` with `file`

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
