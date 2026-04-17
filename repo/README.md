# PetMarket

Full-stack pet marketplace — NestJS backend, React frontend, PostgreSQL. Fully Dockerized, offline, no external services.

## Quick Start

Clone the repository and start all services with Docker Compose:

```bash
git clone <your-repo-url>   # e.g. git clone https://github.com/acme/petmarket.git
cd petmarket
docker-compose up --build
```

> **Note:** Both `docker-compose up --build` (Compose v1) and `docker compose up --build` (Compose v2 plugin) work. Use whichever is installed on your system. No local runtime installs (`npm`, `node`, `pip`, etc.) are required — everything runs inside Docker containers.

All services start automatically. DB schema syncs and seed data loads on first boot.

## Services

| Service    | URL                   | Description                                |
|------------|-----------------------|--------------------------------------------|
| Frontend   | http://localhost:3000 | React + Vite UI                            |
| Backend    | http://localhost:3001 | NestJS REST API (prefix: `/api`)           |
| PostgreSQL | localhost:5433        | PostgreSQL 16 (user: petmarket) — host port 5433 maps to container port 5432 |

## Demo Credentials (All Roles)

All five system roles are seeded automatically on first boot. No manual steps required.

| Username   | Email                          | Password      | Role           | Access                              |
|------------|--------------------------------|---------------|----------------|-------------------------------------|
| `admin`    | admin@petmarket.local          | `admin123`    | admin          | Full access to all features         |
| `vendor`   | vendor@petmarket.local         | `vendor123`   | vendor         | Manage listings, conversations, settlements |
| `shopper`  | shopper@petmarket.local        | `shopper123`  | shopper        | Browse listings, start conversations |
| `reviewer1`| reviewer1@petmarket.local      | `reviewer123` | ops_reviewer   | Settlement approval step 1 only     |
| `finance1` | finance1@petmarket.local       | `finance123`  | finance_admin  | Settlement approval step 2 only     |

> **Security note:** Admin cannot perform settlement approval steps (separation of duties is technically enforced). Only `ops_reviewer` can approve step 1 and only `finance_admin` can approve step 2, and the two approvers must be different users.

## Web UI Verification Flow

After `docker-compose up --build` completes, verify the application end-to-end in your browser:

### 1. Login
- Open http://localhost:3000
- You will see the **PetMarket** login screen
- Enter `vendor` / `vendor123` and click **Sign in**
- You are redirected to the **Listings** page

### 2. Browse and Create a Listing (vendor)
- On the Listings page, click **+ New Listing**
- Fill in: Title, Breed, Region, Age, Price, Description
- Click **Create Listing**
- The new listing card appears in the grid immediately

### 3. Start a Conversation (shopper)
- Log out (clear session storage or open incognito)
- Login as `shopper` / `shopper123`
- Click any listing card to open its detail page
- Click **Contact Vendor** — you are redirected to the Conversations page
- Type a message and press Enter — the message appears in the thread

### 4. Trigger an Export Job (admin)
- Login as `admin` / `admin123` — you are redirected to the admin Config page
- Navigate to http://localhost:3000/admin/exports
- Click **+ New Export**, select an export type, click **Start Export**
- The job appears in the table with a **queued** status badge

### 5. Two-Step Settlement Approval
- Login as `reviewer1` / `reviewer123` and navigate to http://localhost:3000/admin/settlements
- Approve a pending settlement (step 1)
- Login as `finance1` / `finance123` and approve the same settlement (step 2)
- Settlement status changes to **finance_approved**

## Running Tests

All test stages run inside Docker containers — no local `npm`, `node`, or Playwright install required.

### Default suite (unit + frontend + backend)

```bash
# Builds test images and runs all containerized stages.
bash run_tests.sh
```

### Individual stages

```bash
bash run_tests.sh unit       # Pure unit tests (containerized, no DB)
bash run_tests.sh frontend   # Frontend Vitest unit tests (containerized, no DB)
bash run_tests.sh backend    # Backend Jest + postgres (auto-started in container)
bash run_tests.sh api        # API curl smoke tests (full stack must be running on :3001)
bash run_tests.sh e2e        # Playwright E2E in container (full stack must be running)
```

### API smoke tests

```bash
docker-compose up --build    # start the full stack
bash run_tests.sh api        # run curl tests against :3001
# or run both:
bash run_tests.sh all-with-api
```

### E2E tests (Playwright)

```bash
# 1. Start the full stack
docker-compose up --build

# 2. Run E2E (Playwright runs inside a container — no local install needed)
bash run_tests.sh e2e
# or combined with all other stages:
bash run_tests.sh all-with-e2e
```

### How it works

`run_tests.sh` uses `docker compose --profile test run` for every stage. Each test image installs its dependencies at **image build time** — nothing is installed at runtime on the host. The `api` stage runs `curl`/`jq` inside an Alpine container; the `e2e` stage runs Playwright inside the official Playwright container image. No local Node, npm, or Playwright installation is ever required.

## API Verification

```bash
# 1. Login (admin)
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.data.token')

# 2. List listings (public)
curl -s http://localhost:3001/api/listings | jq '.data.items | length'

# 3. Create listing (vendor)
VTOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"vendor","password":"vendor123"}' | jq -r '.data.token')

curl -s -X POST http://localhost:3001/api/listings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $VTOKEN" \
  -d '{"title":"Test Poodle","description":"Healthy poodle puppy","breed":"Poodle","age":3,"region":"Oregon","priceUsd":900}' | jq .

# 4. Create export job (admin)
curl -s -X POST http://localhost:3001/api/exports/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"type":"listings"}' | jq .

# 5. Verify audit integrity
AUDIT_ID=$(curl -s http://localhost:3001/api/admin/audit \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data.items[0].id')

curl -s http://localhost:3001/api/admin/audit/$AUDIT_ID/verify \
  -H "Authorization: Bearer $TOKEN" | jq .

# 6. Settlement approval flow (two-step)
RTOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"reviewer1","password":"reviewer123"}' | jq -r '.data.token')

FTOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"finance1","password":"finance123"}' | jq -r '.data.token')

# Generate monthly settlements (admin)
MONTH=$(date +%Y-%m)
curl -s -X POST http://localhost:3001/api/settlements/generate-monthly \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"month\":\"$MONTH\"}" | jq '.data.generatedCount'

# Get a settlement ID
SETTLE_ID=$(curl -s http://localhost:3001/api/settlements \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].id')

# Step 1: ops_reviewer approves
curl -s -X POST http://localhost:3001/api/settlements/$SETTLE_ID/approve-step1 \
  -H "Authorization: Bearer $RTOKEN" | jq '.data.status'

# Step 2: finance_admin approves (different user — SoD enforced)
curl -s -X POST http://localhost:3001/api/settlements/$SETTLE_ID/approve-step2 \
  -H "Authorization: Bearer $FTOKEN" | jq '.data.status'
# → "finance_approved"

# Export approved settlement as CSV (vendor or admin)
curl -s http://localhost:3001/api/settlements/export/$SETTLE_ID \
  -H "Authorization: Bearer $TOKEN" \
  -o settlement-export.csv
head -2 settlement-export.csv
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
| `DB_PASSWORD`        | **required in production** (`petmarket_secret` local only) | Database password      |
| `DB_NAME`            | `petmarket`                              | Database name          |
| `JWT_SECRET`         | **required in production** (dev default) | JWT signing key        |
| `FIELD_ENCRYPTION_KEY` | **required in production** (dev default) | AES-256 encryption key |
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
