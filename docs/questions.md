# Business Logic Questions Log

## 1. Disconnected Operations and Media Storage
**Question:** The prompt emphasizes "fully offline operation" and "local audio files" but requires features typically dependent on external APIs, such as device fingerprinting and IP risk flags ("stored locally; no external lookups"). How should the application be deployed and how are media files and security telemetry managed?
**My Understanding:** The system is intended to run on a closed Intranet/local network. Media uploads (voice notes) must be handled through native browser APIs, uploaded directly to the backend, and stored on a local disk or local object storage. IP risk rules and device spoofing detection must rely on local databases (like an offline MaxMind GeoIP dataset) and client-side canvas/WebGL fingerprinting hashes sent during authentication.
**Solution:** I will configure the NestJS application to use a local disk storage provider for media, bundle an offline IP dataset for risk evaluation, and build a local state table for device fingerprint tracking without any third-party SaaS dependencies.

## 2. Distance Calculation for Freight Estimates
**Question:** The system calculates freight estimates using "tiered rules combining distance in miles" but operates purely offline. How do we compute distance without relying on external routing APIs like Google Maps?
**My Understanding:** Since the application operates without external internet access, dynamic routing is not possible. Distance must be calculated using a pre-populated, static geo-coordinate or zip-code distance matrix stored in PostgreSQL, allowing point-to-point rectilinear or Haversine distance computations.
**Solution:** I will implement a local shipping zone and coordinate table (e.g., origin/destination zip code mapping) to compute the distance in miles using the Haversine formula directly in the PostgreSQL database or backend logic.

## 3. Tracking Transactions Without Online Payments
**Question:** A credit score is calculated using "transaction success rate, dispute rate, and cancellation rate," yet the system specifies "without integrating online payments." How does the system accurately update these states if the financial exchange happens off-platform?
**My Understanding:** Vendors and Shoppers must manually manage the lifecycle of a listing inquiry into a transaction through the in-app conversation workspace. The system relies on self-reported event triggers (e.g., Vendor marking an item "Sold," or Shopper opening a "Dispute" ticket) to transition order states.
**Solution:** I will introduce a lightweight order state machine within the conversation workspace that allows both parties to explicitly confirm "Transaction Completed", "Canceled", or "Disputed", which will emit events to asynchronously update the 90-day trailing metrics.

## 4. Role Segregation for Settlement Approvals
**Question:** The prompt lists three top-level roles (Shoppers, Vendors, Operations Admins) but mentions "routes settlements through a two-step approval (Ops Reviewer then Finance Admin)." Are these distinct foundational roles or sub-roles under Operations Admin?
**My Understanding:** Ops Reviewer and Finance Admin are not separate top-tier roles but rather specific, mutually exclusive permission scopes within the "Operations Admins" category to ensure sufficient segregation of duties.
**Solution:** I will implement declarative Role-Based Access Control (RBAC) in NestJS using custom scopes (e.g., `SETTLEMENT_REVIEW`, `SETTLEMENT_APPROVE`). An Admin cannot hold both permissions concurrently to satisfy minimum compliance standards.

## 5. Review-Required State for Moderation
**Question:** "sensitive-word filtering that blocks publishing when prohibited terms appear, prompting a review-required state". What happens to the content during this state and who is notified?
**My Understanding:** Content that hits the sensitive word filter should not be hard-rejected immediately, but rather saved as a "Pending Review" draft. It remains invisible to Shoppers. Operations Admins need a dedicated moderation queue to manually approve or permanently block the content.
**Solution:** I will add a `status` enum (`DRAFT`, `PUBLISHED`, `PENDING_REVIEW`, `REJECTED`) to the listings and conversation message entities, and create a Content Moderation Queue interface for Admins to easily approve or reject flagged items.

## 6. Export Concurrency and Lifetime
**Question:** "Data query exports are executed as background jobs ... concurrency capped (for example, 2 exports at a time) and automatic expiration of export files after 7 days." How does the system handle a burst of export requests if concurrency is at max capacity?
**My Understanding:** Export requests should be queued and processed asynchronously. The UI will show a pending state until a worker frees up. A cron job will periodically sweep the disk to enforce the 7-day retention policy.
**Solution:** I will implement a PostgreSQL-backed job queue to throttle export workers to a concurrency of 2. I'll add a separate scheduled worker in NestJS (using `@nestjs/schedule`) to prune expired export files and records daily.
