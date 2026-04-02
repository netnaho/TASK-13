import { FreightService, FreightParams } from '../backend/src/settlements/freight.service';

const service = new FreightService();

function calc(overrides: Partial<FreightParams> = {}) {
  return service.calculate({
    distanceMiles: 100,
    weightLbs: 10,
    dimWeightLbs: 5,
    isOversized: false,
    isWeekend: false,
    ...overrides,
  });
}

describe('FreightService', () => {
  describe('base cost tiers', () => {
    it('0-50 miles → $5', () => {
      expect(calc({ distanceMiles: 30 }).baseCost).toBe(5);
      expect(calc({ distanceMiles: 50 }).baseCost).toBe(5);
    });

    it('51-200 miles → $12', () => {
      expect(calc({ distanceMiles: 51 }).baseCost).toBe(12);
      expect(calc({ distanceMiles: 200 }).baseCost).toBe(12);
    });

    it('201-500 miles → $25', () => {
      expect(calc({ distanceMiles: 201 }).baseCost).toBe(25);
      expect(calc({ distanceMiles: 500 }).baseCost).toBe(25);
    });

    it('500+ miles → $45', () => {
      expect(calc({ distanceMiles: 501 }).baseCost).toBe(45);
      expect(calc({ distanceMiles: 1000 }).baseCost).toBe(45);
    });
  });

  describe('billable weight', () => {
    it('uses actual weight when greater than dim weight', () => {
      expect(calc({ weightLbs: 20, dimWeightLbs: 10 }).billableWeight).toBe(20);
    });

    it('uses dim weight when greater than actual weight', () => {
      expect(calc({ weightLbs: 10, dimWeightLbs: 25 }).billableWeight).toBe(25);
    });

    it('equal weights uses either (max)', () => {
      expect(calc({ weightLbs: 15, dimWeightLbs: 15 }).billableWeight).toBe(15);
    });
  });

  describe('oversized surcharge', () => {
    it('adds exactly $15.00 when oversized', () => {
      expect(calc({ isOversized: true }).oversizedSurcharge).toBe(15);
    });

    it('$0 when not oversized', () => {
      expect(calc({ isOversized: false }).oversizedSurcharge).toBe(0);
    });
  });

  describe('weekend surcharge', () => {
    it('is exactly 5% of subtotal before weekend', () => {
      const result = calc({ isWeekend: true });
      expect(result.weekendSurcharge).toBe(
        Math.round(result.subtotalBeforeWeekend * 0.05 * 100) / 100,
      );
    });

    it('is $0 on weekdays', () => {
      expect(calc({ isWeekend: false }).weekendSurcharge).toBe(0);
    });
  });

  describe('sales tax', () => {
    it('is 8.5% of pre-tax total', () => {
      const result = calc();
      expect(result.salesTax).toBe(
        Math.round(result.subtotalBeforeTax * 0.085 * 100) / 100,
      );
    });
  });

  describe('combined scenario', () => {
    it('300mi, 20lbs, dimWeight 25lbs, oversized, weekend', () => {
      const result = calc({
        distanceMiles: 300,
        weightLbs: 20,
        dimWeightLbs: 25,
        isOversized: true,
        isWeekend: true,
      });

      expect(result.billableWeight).toBe(25);
      expect(result.baseCost).toBe(25);
      expect(result.perPoundCharge).toBe(2);
      expect(result.oversizedSurcharge).toBe(15);
      expect(result.subtotalBeforeWeekend).toBe(42);
      expect(result.weekendSurcharge).toBe(2.1);
      expect(result.subtotalBeforeTax).toBe(44.1);
      expect(result.salesTax).toBe(3.75);
      expect(result.total).toBe(47.85);
    });
  });

  describe('edge cases', () => {
    it('0 distance and 0 weight', () => {
      const result = calc({ distanceMiles: 0, weightLbs: 0, dimWeightLbs: 0 });
      expect(result.baseCost).toBe(5);
      expect(result.billableWeight).toBe(0);
      expect(result.perPoundCharge).toBe(0);
      expect(result.total).toBeGreaterThan(0);
    });
  });
});
