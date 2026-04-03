import { ListingStatus } from '../database/entities/listing.entity';

/**
 * Roles that can see listings regardless of moderation status.
 * Vendor and shopper see only ACTIVE unless they own the listing (vendor case handled below).
 */
const PRIVILEGED_ROLES = new Set(['admin', 'ops_reviewer', 'finance_admin']);

/**
 * Single-source visibility policy for a listing.
 *
 * Rules (checked in priority order):
 *  1. Privileged internal roles (admin, ops_reviewer, finance_admin) → always visible.
 *  2. Active listings → visible to everyone including unauthenticated.
 *  3. Vendor who owns the listing → can see own non-active listing.
 *  4. Everything else → not visible (return 404 to avoid revealing existence).
 */
export function canViewListing(
  listing: { status: ListingStatus; vendorId: string },
  requesterRole: string | undefined,
  requesterId: string | undefined,
): boolean {
  if (requesterRole && PRIVILEGED_ROLES.has(requesterRole)) return true;
  if (listing.status === ListingStatus.ACTIVE) return true;
  if (requesterRole === 'vendor' && requesterId && requesterId === listing.vendorId) return true;
  return false;
}
