# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Full-stack offline pet marketplace (`petmarket/`). NestJS backend + React frontend + PostgreSQL. Fully Dockerized. No external services.

## Commands

```bash
# Start everything (builds images, runs migrations + seed, starts all services)
cd petmarket && docker compose up --build

# Run all tests
./petmarket/run_tests.sh
```

Services after startup: frontend:3000, backend:3001, postgres:5432.

## Monorepo Layout

```
├── backend/src/
│   ├── main.ts                    # Bootstrap: ValidationPipe, global filter/interceptor, CORS
│   ├── app.module.ts              # Root module: ConfigModule, TypeOrmModule, all feature modules
│   ├── common/                    # Shared: filters, guards, decorators, interceptors, logger
│   ├── database/entities/         # 11 TypeORM entities
│   ├── database/seed.ts           # Seed runs on app bootstrap via AuthService
│   └── {auth,users,listings,conversations,campaigns,settlements,credits,audit,exports}/
├── frontend/src/
│   ├── api/axios.ts               # Global Axios instance + typed helpers (apiGet/apiPost/apiPatch)
│   ├── api/index.ts               # All API calls — domain functions grouped by resource
│   ├── store/auth.store.ts        # Zustand: user/token/role, persisted to sessionStorage
│   ├── components/                # Layout, Sidebar, ProtectedRoute, Toaster
│   └── pages/                     # 9 pages with real API wiring
├── docker-compose.yml
├── run_tests.sh
└── README.md
```

## Tech Stack

**Backend:** NestJS + TypeScript, TypeORM + PostgreSQL 16, class-validator/class-transformer, bcrypt, JWT (`@nestjs/jwt`), Winston, Jest

**Frontend:** React 18 + Vite + TypeScript, TailwindCSS v3, TanStack React Query, React Router v6, Zustand, Axios, React Hook Form + Zod

## Architecture

### Backend
- Strict layering: Controller → Service → Repository. No DB calls in controllers, no business logic in controllers.
- All responses wrapped by `ResponseInterceptor` → `{code:200, msg:"OK", data}`. All errors caught by `HttpExceptionFilter` → `{code, msg, timestamp}`.
- All DTOs use class-validator. `ValidationPipe(whitelist:true, forbidNonWhitelisted:true)` is global.
- `JwtAuthGuard` validates Bearer tokens; `RolesGuard` reads `@Roles()` decorator. Both must be applied together on protected routes.
- `AuditService` logs SHA-256 hash-chained entries — import via `AuditModule` (exported provider).
- DB seed runs via `AuthService.onApplicationBootstrap()` — idempotent (checks existence before insert).

### Frontend
- All API calls go through typed functions in `src/api/index.ts` — never inline axios in components.
- All async state uses React Query. Loading skeleton + error state with retry button on every data-fetching component.
- All forms use React Hook Form + Zod. Inline field errors, disabled + spinner on submit.
- `toast()` (from `Toaster.tsx`) for every API success and error.
- `ProtectedRoute` wraps authenticated pages. Pass `allowedRoles` for role-gated routes.

## Roles

| Role | Access |
|------|--------|
| `shopper` | Browse listings, start conversations, view own credit score |
| `vendor` | Manage own listings, handle conversations, view settlements |
| `admin` | Full access |
| `ops_reviewer` | Step 1 of settlement approval only |
| `finance_admin` | Step 2 of settlement approval only |

## Key Business Rules

- **Sensitive word filter:** blocks listing publish → `status=pending_review` + `sensitiveWordFlagged=true`
- **Rate limits:** 30 listings/hour/vendor; 10 new conversations/10min/account → HTTP 429
- **Settlement approval:** strictly two-step — ops_reviewer first, then finance_admin
- **Export jobs:** max 2 concurrent (`queued` or `running`); files expire after 7 days
- **Audit logs:** append-only, SHA-256 hash-chained, each entry references `prevHash`
- **Credit score:** `(successRate×0.5 - disputeRate×0.3 - cancellationRate×0.2) × 1000`, clamped 0–1000
- **Data masking:** phone → last 4 digits; address → city+state; for non-admin roles

## API Response Format

```typescript
// Success
{ code: 200, msg: "OK", data: <payload> }

// Paginated data
{ code: 200, msg: "OK", data: { items: [], total: 0, page: 1, limit: 20, totalPages: 0 } }

// Error
{ code: 400, msg: "Validation failed: title is required", timestamp: "2024-01-01T00:00:00Z" }
```

## Seed Accounts

| Username | Password    | Role    |
|----------|-------------|---------|
| admin    | admin123    | admin   |
| vendor   | vendor123   | vendor  |
| shopper  | shopper123  | shopper |

## Environment Variables (all have safe defaults in docker-compose.yml)

| Variable | Default | Purpose |
|----------|---------|---------|
| `JWT_SECRET` | `local_dev_jwt_secret_change_in_prod` | JWT signing |
| `FIELD_ENCRYPTION_KEY` | `0123456789abcdef0123456789abcdef` | AES-256 key (32 hex chars) |
| `DB_HOST/PORT/USER/PASSWORD/NAME` | postgres service defaults | TypeORM connection |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | CORS allow-origin |
| `BCRYPT_ROUNDS` | `10` | bcrypt work factor |
