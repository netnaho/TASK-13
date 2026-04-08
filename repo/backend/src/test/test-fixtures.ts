/**
 * test-fixtures.ts
 *
 * Shared fixture builders for backend integration specs.
 * Each helper inserts a minimal valid row and returns the saved entity so
 * tests can reference IDs.  Clean up by calling the entity repo's delete()
 * in afterAll — see the cleanup() helper below.
 */
import { DataSource } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { Listing, ListingStatus } from '../database/entities/listing.entity';
import { Conversation } from '../database/entities/conversation.entity';
import { Message, MessageType } from '../database/entities/message.entity';
import { Settlement, SettlementStatus } from '../database/entities/settlement.entity';
import { AuditLog } from '../database/entities/audit-log.entity';

// ── Unique ID helpers ─────────────────────────────────────────────────────────

/** Random 7-char suffix to avoid username/month collisions across parallel runs. */
export function uid(prefix = 't'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Returns a YYYY-MM string far in the future — safe for settlement uniqueness. */
export function futureMonth(): string {
  const year = 2090 + Math.floor(Math.random() * 9);
  const month = 1 + Math.floor(Math.random() * 12);
  return `${year}-${String(month).padStart(2, '0')}`;
}

// ── User ──────────────────────────────────────────────────────────────────────

export async function createTestUser(
  ds: DataSource,
  role: 'vendor' | 'shopper' | 'admin' | 'ops_reviewer' | 'finance_admin',
  overrides: Partial<User> = {},
): Promise<User> {
  const repo = ds.getRepository(User);
  const name = uid('u');
  return repo.save(
    repo.create({
      username: name,
      email: `${name}@test.local`,
      passwordHash: '$2b$10$placeholder_hash_for_tests_only',
      role: role as any,
      isActive: true,
      ...overrides,
    }),
  );
}

// ── Listing ───────────────────────────────────────────────────────────────────

export async function createTestListing(
  ds: DataSource,
  vendorId: string,
  status: ListingStatus = ListingStatus.ACTIVE,
  overrides: Partial<Listing> = {},
): Promise<Listing> {
  const repo = ds.getRepository(Listing);
  return repo.save(
    repo.create({
      title: uid('Listing'),
      description: 'Test listing description',
      breed: 'TestBreed',
      age: 3,
      region: 'Oregon',
      priceUsd: 500,
      photos: [],
      vendorId,
      status,
      sensitiveWordFlagged: false,
      ...overrides,
    }),
  );
}

// ── Conversation ──────────────────────────────────────────────────────────────

export async function createTestConversation(
  ds: DataSource,
  listingId: string,
  vendorId: string,
  shopperId: string,
): Promise<Conversation> {
  const repo = ds.getRepository(Conversation);
  return repo.save(
    repo.create({ listingId, vendorId, shopperIds: [shopperId] }),
  );
}

// ── Message ───────────────────────────────────────────────────────────────────

export async function createTestMessage(
  ds: DataSource,
  conversationId: string,
  senderId: string,
  content: string,
  overrides: Partial<Message> = {},
): Promise<Message> {
  const repo = ds.getRepository(Message);
  return repo.save(
    repo.create({
      conversationId,
      senderId,
      content,
      type: MessageType.TEXT,
      isInternal: false,
      ...overrides,
    }),
  );
}

// ── Settlement ────────────────────────────────────────────────────────────────

export async function createTestSettlement(
  ds: DataSource,
  vendorId: string,
  overrides: Partial<Settlement> = {},
): Promise<Settlement> {
  const repo = ds.getRepository(Settlement);
  return repo.save(
    repo.create({
      vendorId,
      month: futureMonth(),
      totalCharges: 100,
      taxAmount: 8.5,
      status: SettlementStatus.PENDING,
      data: {},
      ...overrides,
    }),
  );
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

/**
 * Delete entities by ID.  Silently ignores entities that don't exist (useful
 * for afterAll where partial setup may have occurred on test failure).
 */
export async function cleanup(
  ds: DataSource,
  EntityClass: any,
  ...ids: (string | undefined)[]
): Promise<void> {
  const validIds = ids.filter(Boolean) as string[];
  if (validIds.length === 0) return;
  await ds.getRepository(EntityClass).delete(validIds).catch(() => {/* ignore */});
}

/**
 * Delete all rows created by a test suite using the supplied entity and IDs.
 * Wraps cleanup in a best-effort catch so that test infrastructure failures
 * don't mask actual assertion failures.
 */
export async function cleanupAll(
  ds: DataSource,
  entries: Array<{ entity: any; ids: string[] }>,
): Promise<void> {
  for (const { entity, ids } of entries) {
    await cleanup(ds, entity, ...ids);
  }
}
