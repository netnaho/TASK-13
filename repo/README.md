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
| PostgreSQL | localhost:5432        | PostgreSQL 16 (user: petmarket)            |

## Default Accounts

| Username | Password    | Role    |
|----------|-------------|---------|
| admin    | admin123    | admin   |
| vendor   | vendor123   | vendor  |
| shopper  | shopper123  | shopper |

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

| Variable             | Default                                  | Description            |
|----------------------|------------------------------------------|------------------------|
| `PORT`               | `3001`                                   | Backend listen port    |
| `DB_HOST`            | `postgres`                               | Database hostname      |
| `DB_PORT`            | `5432`                                   | Database port          |
| `DB_USER`            | `petmarket`                              | Database user          |
| `DB_PASSWORD`        | `petmarket_secret`                       | Database password      |
| `DB_NAME`            | `petmarket`                              | Database name          |
| `JWT_SECRET`         | `petmarket_jwt_secret_change_in_prod`    | JWT signing key        |
| `FIELD_ENCRYPTION_KEY` | `petmarket_enc_key_32chars_padding`    | AES-256 encryption key |
| `BCRYPT_ROUNDS`      | `10`                                     | bcrypt work factor     |
| `FRONTEND_ORIGIN`    | `http://localhost:3000`                  | CORS allowed origin    |
| `VITE_API_BASE_URL`  | `http://localhost:3001`                  | Frontend API base URL  |

## API Response Format

```json
{ "code": 200, "msg": "OK", "data": {} }
```

Errors:
```json
{ "code": 400, "msg": "Validation failed", "timestamp": "2024-01-01T00:00:00Z" }
```
