# PetMarket System Design Document

## 1. Executive Summary
The PetMarket Operations & Risk Management System is a fully offline, air-gapped web application built to facilitate a pet marketplace and service catalog. The system provides role-based access for Shoppers, Vendors, and Operations Admins. It includes comprehensive listing discovery, an in-app conversation workspace, robust credit and risk control frameworks, offshore settlement engines with two-step approval, and tamper-evident audit logging. The application operates securely without dependencies on external internet services.

## 2. Architecture Overview
The system follows a modern decoupled, three-tier architecture fully containerized for offline deployment.

- **Frontend:** Built with React and Vite. Designed as a Single Page Application (SPA) offering rapid keyword search, autocomplete, typo correction, and responsive interfaces optimized for local networks.
- **Backend:** Developed with NestJS (Node.js). Exposes RESTful APIs and utilizes modular architecture emphasizing isolation of concerns, Role-Based Access Control (RBAC), and deep input validation.
- **Database:** PostgreSQL 16 acts as the solitary source of truth. It handles transactional relational data, vector/search indices (via ILIKE and structured queries), background job queues, and securely localized IP/risk datasets.

## 3. Core System Modules (Backend)

The NestJS backend is cleanly divided into functional domain modules:

### 3.1 Authentication & Security (`src/auth`, `src/users`)
- **Local Authentication:** Username/password only. Passwords are salted and hashed using `bcrypt` (work factor: 10).
- **Session Management:** JSON Web Tokens (JWT) for stateless session handling.
- **Data Encryption:** AES-256 encryption at rest for sensitive PII. Masked by default in API responses unless explicit permissions are provided.
- **RBAC:** Enforced at the controller level distinguishing between `admin`, `vendor`, and `shopper` contexts.

### 3.2 Listings & Catalog (`src/listings`)
- **Discovery Engine:** Provides multi-dimensional filtering (breed, age, region, price range USD, rating, new arrivals < 14 days).
- **Fallback Logic:** Delivers trending rankings and similar breed recommendations if searches yield no results.
- **Moderation:** Integrated with a sensitive-word filtering pipeline that flags prohibitable terms and shifts listings to a review-required state.

### 3.3 Conversations Workspace (`src/conversations`)
- **Real-Time Collaboration:** Supports text messaging and robust handling of recorded offline voice notes (uploaded as local audio files).
- **Contextual Management:** Deeply tied to listing contexts with support for internal admin/vendor shared notes, and canned responses configured by Ops Admins.
- **Operations:** Thread archiving and highly searchable full-text history.

### 3.4 Settlements & Charges (`src/settlements`)
- **Offline Freight Calculation:** Uses tiered rules blending physical distance, billable weight, and dimensional weight. Includes dynamic surcharges (Oversized +$15.00, Weekend +5%).
- **Statement Generation:** Automatically generates monthly statements on the 1st day of the month.
- **Approval Workflow:** Strict two-step workflow requiring consecutive approvals (`Ops Reviewer` → `Finance Admin`).
- **Accounting:** Variance reconciliation and sales tax incorporation.

### 3.5 Risk & Credit Framework (`src/risk`, `src/credits`)
- **Credit Scoring:** Computes localized credit scores for Vendors/Shoppers using trailing 90-day metrics (transaction success rate, dispute rate, cancellation rate).
- **Risk Control:** Tracks and flags anomalous behaviors locally, including frequent duplicate reposts, multi-account device fingerprint footprints, and strict IP risk evaluation—all without external dataset pings.
- **Rate-Limiting:** Enforces application-specific thresholds (e.g., max 30 listings/hour, max 10 new conversations/10 mins) per account.

### 3.6 Data Query & Exports (`src/query`, `src/exports`)
- **Admins Query Builder:** Allows creating complex chained conditions, saved custom lists, and sortable columns.
- **Asynchronous Exports:** Heavy CSV/Excel exports are offloaded to background job queues stored in PostgreSQL. 
- **Concurrency & Compliance:** Process concurrency is capped mechanically (e.g., 2 exports concurrently). Exported artifacts expire out of the volume after 7 days automatically. Files embed permission-based PII watermarking/masking (last 4 phone digits).

### 3.7 Audit & Compliance (`src/audit`)
- **Append-Only Tamper Evidence:** End-to-end traceability for critical `CREATE/UPDATE/DELETE/IMPORT/APPROVE` actions.
- **Cryptography:** Logs are chained cryptographically using SHA-256 hashing to guarantee tamper-evident verification.
- **Retention:** Architected for a strict 7-year immutable retention policy with an integrated admin console for verified queries.

## 4. Frontend Architecture (React + Vite)
- **State Management:** Robust contextual states for User sessions, listings caches, and real-time conversation sync.
- **API Integration:** Standardized Axios implementations pointing to `/api` with Bearer Token interceptors.
- **Routing:** Route trees guarded by high-order components to redirect unauthenticated or erroneously permissioned users from restricted views like the `Operations Console`.
- **UI UX Strategies:** Includes clear asynchronous loading states, job queue progress bars, and high responsiveness.

## 5. Deployment & Data Persistence
- **Dockerized Environment:** `docker-compose.yml` mounts entire environments locally, establishing private networks between Node APIs and PostgreSQL instances.
- **Automatic Initialization:** Seeds default operational data, local test users (`admin`, `vendor`, `shopper`), and required initial schemas precisely on boot. Uses local storage volumes strictly mapping outbound ports only for local `localhost:3000` interaction.
