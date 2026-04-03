import { canViewListing } from '../backend/src/listings/listing-visibility.policy';
import { ListingStatus } from '../backend/src/database/entities/listing.entity';

const OWNER_ID = 'vendor-uuid-owner';
const OTHER_VENDOR_ID = 'vendor-uuid-other';
const SHOPPER_ID = 'shopper-uuid-1';
const ADMIN_ID = 'admin-uuid-1';

function makeListing(status: ListingStatus, vendorId = OWNER_ID) {
  return { status, vendorId };
}

describe('canViewListing — visibility policy', () => {
  // ── Active listings ────────────────────────────────────────────────────────

  describe('active listing', () => {
    const listing = makeListing(ListingStatus.ACTIVE);

    it('unauthenticated (public) can view', () => {
      expect(canViewListing(listing, undefined, undefined)).toBe(true);
    });

    it('shopper can view', () => {
      expect(canViewListing(listing, 'shopper', SHOPPER_ID)).toBe(true);
    });

    it('non-owner vendor can view', () => {
      expect(canViewListing(listing, 'vendor', OTHER_VENDOR_ID)).toBe(true);
    });

    it('owner vendor can view', () => {
      expect(canViewListing(listing, 'vendor', OWNER_ID)).toBe(true);
    });

    it('admin can view', () => {
      expect(canViewListing(listing, 'admin', ADMIN_ID)).toBe(true);
    });
  });

  // ── Pending review listing ─────────────────────────────────────────────────

  describe('pending_review listing', () => {
    const listing = makeListing(ListingStatus.PENDING_REVIEW);

    it('shopper is denied → false', () => {
      expect(canViewListing(listing, 'shopper', SHOPPER_ID)).toBe(false);
    });

    it('unauthenticated (public) is denied → false', () => {
      expect(canViewListing(listing, undefined, undefined)).toBe(false);
    });

    it('non-owner vendor is denied → false', () => {
      expect(canViewListing(listing, 'vendor', OTHER_VENDOR_ID)).toBe(false);
    });

    it('vendor with no requesterId is denied → false', () => {
      expect(canViewListing(listing, 'vendor', undefined)).toBe(false);
    });

    it('owner vendor is allowed → true', () => {
      expect(canViewListing(listing, 'vendor', OWNER_ID)).toBe(true);
    });

    it('admin is allowed → true', () => {
      expect(canViewListing(listing, 'admin', ADMIN_ID)).toBe(true);
    });

    it('ops_reviewer is allowed → true', () => {
      expect(canViewListing(listing, 'ops_reviewer', 'ops-uuid')).toBe(true);
    });

    it('finance_admin is allowed → true', () => {
      expect(canViewListing(listing, 'finance_admin', 'fin-uuid')).toBe(true);
    });
  });

  // ── Archived listing ───────────────────────────────────────────────────────

  describe('archived listing', () => {
    const listing = makeListing(ListingStatus.ARCHIVED);

    it('shopper is denied', () => {
      expect(canViewListing(listing, 'shopper', SHOPPER_ID)).toBe(false);
    });

    it('non-owner vendor is denied', () => {
      expect(canViewListing(listing, 'vendor', OTHER_VENDOR_ID)).toBe(false);
    });

    it('owner vendor is allowed', () => {
      expect(canViewListing(listing, 'vendor', OWNER_ID)).toBe(true);
    });

    it('admin is allowed', () => {
      expect(canViewListing(listing, 'admin', ADMIN_ID)).toBe(true);
    });
  });
});
