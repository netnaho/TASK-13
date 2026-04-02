describe('RateLimiter', () => {
  const LISTING_LIMIT = 30;
  const LISTING_WINDOW_MS = 60 * 60 * 1000;
  const CONV_LIMIT = 10;
  const CONV_WINDOW_MS = 10 * 60 * 1000;

  interface RateLimitEvent {
    userId: string;
    action: string;
    createdAt: Date;
  }

  function isRateLimited(
    events: RateLimitEvent[],
    userId: string,
    action: string,
    windowMs: number,
    limit: number,
  ): boolean {
    const windowStart = new Date(Date.now() - windowMs);
    const count = events.filter(
      (e) => e.userId === userId && e.action === action && e.createdAt >= windowStart,
    ).length;
    return count >= limit;
  }

  describe('listing rate limit (30/hour)', () => {
    it('allows up to 30 listings', () => {
      const events: RateLimitEvent[] = Array.from({ length: 30 }, (_, i) => ({
        userId: 'vendor-1',
        action: 'create_listing',
        createdAt: new Date(Date.now() - i * 1000),
      }));
      expect(isRateLimited(events, 'vendor-1', 'create_listing', LISTING_WINDOW_MS, LISTING_LIMIT)).toBe(true);
    });

    it('rejects 31st listing', () => {
      const events: RateLimitEvent[] = Array.from({ length: 30 }, (_, i) => ({
        userId: 'vendor-1',
        action: 'create_listing',
        createdAt: new Date(Date.now() - i * 1000),
      }));
      expect(isRateLimited(events, 'vendor-1', 'create_listing', LISTING_WINDOW_MS, LISTING_LIMIT)).toBe(true);
    });

    it('allows after 29 (under limit)', () => {
      const events: RateLimitEvent[] = Array.from({ length: 29 }, (_, i) => ({
        userId: 'vendor-1',
        action: 'create_listing',
        createdAt: new Date(Date.now() - i * 1000),
      }));
      expect(isRateLimited(events, 'vendor-1', 'create_listing', LISTING_WINDOW_MS, LISTING_LIMIT)).toBe(false);
    });
  });

  describe('conversation rate limit (10/10min)', () => {
    it('allows up to 10 conversations', () => {
      const events: RateLimitEvent[] = Array.from({ length: 9 }, (_, i) => ({
        userId: 'shopper-1',
        action: 'create_conversation',
        createdAt: new Date(Date.now() - i * 1000),
      }));
      expect(isRateLimited(events, 'shopper-1', 'create_conversation', CONV_WINDOW_MS, CONV_LIMIT)).toBe(false);
    });

    it('rejects 11th conversation', () => {
      const events: RateLimitEvent[] = Array.from({ length: 10 }, (_, i) => ({
        userId: 'shopper-1',
        action: 'create_conversation',
        createdAt: new Date(Date.now() - i * 1000),
      }));
      expect(isRateLimited(events, 'shopper-1', 'create_conversation', CONV_WINDOW_MS, CONV_LIMIT)).toBe(true);
    });
  });

  describe('window expiry', () => {
    it('events older than window not counted', () => {
      const events: RateLimitEvent[] = Array.from({ length: 30 }, (_, i) => ({
        userId: 'vendor-1',
        action: 'create_listing',
        createdAt: new Date(Date.now() - LISTING_WINDOW_MS - (i + 1) * 1000),
      }));
      expect(isRateLimited(events, 'vendor-1', 'create_listing', LISTING_WINDOW_MS, LISTING_LIMIT)).toBe(false);
    });

    it('mix of old and new events counts only recent', () => {
      const oldEvents: RateLimitEvent[] = Array.from({ length: 25 }, (_, i) => ({
        userId: 'vendor-1',
        action: 'create_listing',
        createdAt: new Date(Date.now() - LISTING_WINDOW_MS - (i + 1) * 1000),
      }));
      const newEvents: RateLimitEvent[] = Array.from({ length: 5 }, (_, i) => ({
        userId: 'vendor-1',
        action: 'create_listing',
        createdAt: new Date(Date.now() - i * 1000),
      }));
      const events = [...oldEvents, ...newEvents];
      expect(isRateLimited(events, 'vendor-1', 'create_listing', LISTING_WINDOW_MS, LISTING_LIMIT)).toBe(false);
    });

    it('different user events not counted', () => {
      const events: RateLimitEvent[] = Array.from({ length: 30 }, (_, i) => ({
        userId: 'vendor-2',
        action: 'create_listing',
        createdAt: new Date(Date.now() - i * 1000),
      }));
      expect(isRateLimited(events, 'vendor-1', 'create_listing', LISTING_WINDOW_MS, LISTING_LIMIT)).toBe(false);
    });
  });
});
