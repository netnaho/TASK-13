# PetMarket

Full-stack pet marketplace — NestJS backend, React frontend, PostgreSQL. Fully Dockerized, offline, no external services.

## Quick Start

```bash
git clone <repo-url> && cd petmarket
docker compose up --build
```

All services start automatically. DB schema syncs and seed data loads on first boot.

## Services

| Service    | URL                   | Description                                |
|------------|-----------------------|--------------------------------------------|
| Frontend   | http://localhost:3000 | React + Vite UI                            |
| Backend    | http://localhost:3001 | NestJS REST API (prefix: `/api`)           |
| PostgreSQL | localhost:5433        | PostgreSQL 16 (user: petmarket) — host port 5433 maps to container port 5432 |

## Default Accounts

| Username | Password    | Role    |
|----------|-------------|---------|
| admin    | admin123    | admin   |
| vendor   | vendor123   | vendor  |
| shopper  | shopper123  | shopper |

## Creating Operational Role Accounts

The `ops_reviewer` and `finance_admin` roles are required for the two-step settlement
approval workflow. These roles are not seeded by default. Bootstrap them as follows:

```bash
# 1. Get admin token
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.data.token')

# 2. Register a new user (gets shopper role by default)
curl -s -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"reviewer1","password":"reviewer123","email":"reviewer1@petmarket.local"}' | jq .

# 3. Get the new user's ID
USER_ID=$(curl -s http://localhost:3001/api/users \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data.items[] | select(.username=="reviewer1") | .id')

# 4. Promote to ops_reviewer (admin only)
curl -s -X PATCH http://localhost:3001/api/users/$USER_ID/role \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"role":"ops_reviewer"}' | jq .

# 5. Repeat steps 2-4 for finance_admin
curl -s -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"finance1","password":"finance123","email":"finance1@petmarket.local"}' | jq .

FINANCE_ID=$(curl -s http://localhost:3001/api/users \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data.items[] | select(.username=="finance1") | .id')

curl -s -X PATCH http://localhost:3001/api/users/$FINANCE_ID/role \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"role":"finance_admin"}' | jq .
```

Role assignments are audit-logged with action `user.role_changed` for accountability.

**Security note:** Admin cannot perform settlement approval steps (separation of duties
is technically enforced — not just documented). Only `ops_reviewer` can do step 1 and
only `finance_admin` can do step 2, and the two approvers must be different users.

## Running Tests

```bash
# All tests (unit + API — requires backend running)
bash run_tests.sh

# Unit tests only
cd unit_tests && bash run_unit_tests.sh

# API tests only (backend must be running)
cd API_tests && bash run_api_tests.sh
```

## API Verification

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.data.token')

# 2. List listings
curl -s http://localhost:3001/api/listings | jq '.data.items | length'

# 3. Create listing (vendor)
VTOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"vendor","password":"vendor123"}' | jq -r '.data.token')

curl -s -X POST http://localhost:3001/api/listings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $VTOKEN" \
  -d '{"title":"Test Poodle","description":"Healthy poodle puppy","breed":"Poodle","age":3,"region":"Oregon","priceUsd":900}' | jq .

# 4. Create export job
curl -s -X POST http://localhost:3001/api/exports/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"type":"listings"}' | jq .

# 5. Verify audit integrity
AUDIT_ID=$(curl -s http://localhost:3001/api/admin/audit \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data.items[0].id')

curl -s http://localhost:3001/api/admin/audit/$AUDIT_ID/verify \
  -H "Authorization: Bearer $TOKEN" | jq .
```

## Architecture Overview

| Module          | Description                                                        |
|-----------------|--------------------------------------------------------------------|
| **Auth**        | JWT login/register, bcrypt passwords, AES-256 field encryption     |
| **Listings**    | Full search (ILIKE, filters, sort), suggest, sensitive word filter  |
| **Conversations** | Messaging with internal notes, rate limiting, canned responses   |
| **Settlements** | Freight calculator, monthly generation, two-step approval          |
| **Campaigns**   | Announcement/carousel/recommendation management, sensitive words   |
| **Credits**     | Score computation from settlements, disputes, cancellations        |
| **Audit**       | SHA-256 hash-chained logs, filtered search, integrity verification |
| **Exports**     | Background CSV generation, max 2 concurrent, 7-day expiry          |
| **Risk**        | Multi-account device detection, IP risk, frequent repost flagging  |
| **Query**       | Dynamic filter builder, saved queries, result export               |

## Environment Variables

| Variable             | Default (local dev only)                 | Description            |
|----------------------|------------------------------------------|------------------------|
| `PORT`               | `3001`                                   | Backend listen port    |
| `DB_HOST`            | `postgres`                               | Database hostname      |
| `DB_PORT`            | `5432`                                   | Database port          |
| `DB_USER`            | `petmarket`                              | Database user          |
| `DB_PASSWORD`        | **required in production** (`petmarket_secret` local only) | Database password — app refuses to start in production without a non-default value |
| `DB_NAME`            | `petmarket`                              | Database name          |
| `JWT_SECRET`         | **required in production** (dev default) | JWT signing key — app refuses to start in production without a non-default value |
| `FIELD_ENCRYPTION_KEY` | **required in production** (dev default) | AES-256 encryption key — app refuses to start in production without a non-default value |
| `BCRYPT_ROUNDS`      | `10`                                     | bcrypt work factor     |
| `FRONTEND_ORIGIN`    | `http://localhost:3000`                  | CORS allowed origin    |
| `VITE_API_BASE_URL`  | `http://localhost:3001`                  | Frontend API base URL  |
| `NODE_ENV`           | `development`                            | `production` disables schema auto-sync and enforces all secret requirements |

## API Response Format

```json
{ "code": 200, "msg": "OK", "data": {} }
```

Errors:
```json
{ "code": 400, "msg": "Validation failed", "timestamp": "2024-01-01T00:00:00Z" }
```
