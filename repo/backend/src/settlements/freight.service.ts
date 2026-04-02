import { Injectable } from '@nestjs/common';

export interface FreightParams {
  distanceMiles: number;
  weightLbs: number;
  dimWeightLbs: number;
  isOversized: boolean;
  isWeekend: boolean;
}

export interface FreightBreakdown {
  billableWeight: number;
  baseCost: number;
  perPoundCharge: number;
  oversizedSurcharge: number;
  subtotalBeforeWeekend: number;
  weekendSurcharge: number;
  subtotalBeforeTax: number;
  salesTax: number;
  total: number;
}

const TAX_RATE = 0.085;
const PER_POUND_RATE = 0.08;
const OVERSIZED_FEE = 15.0;
const WEEKEND_RATE = 0.05;

@Injectable()
export class FreightService {
  calculate(params: FreightParams): FreightBreakdown {
    const billableWeight = Math.max(params.weightLbs, params.dimWeightLbs);

    let baseCost: number;
    if (params.distanceMiles <= 50) baseCost = 5;
    else if (params.distanceMiles <= 200) baseCost = 12;
    else if (params.distanceMiles <= 500) baseCost = 25;
    else baseCost = 45;

    const perPoundCharge = round(billableWeight * PER_POUND_RATE);
    const oversizedSurcharge = params.isOversized ? OVERSIZED_FEE : 0;
    const subtotalBeforeWeekend = round(baseCost + perPoundCharge + oversizedSurcharge);
    const weekendSurcharge = params.isWeekend
      ? round(subtotalBeforeWeekend * WEEKEND_RATE)
      : 0;
    const subtotalBeforeTax = round(subtotalBeforeWeekend + weekendSurcharge);
    const salesTax = round(subtotalBeforeTax * TAX_RATE);
    const total = round(subtotalBeforeTax + salesTax);

    return {
      billableWeight,
      baseCost,
      perPoundCharge,
      oversizedSurcharge,
      subtotalBeforeWeekend,
      weekendSurcharge,
      subtotalBeforeTax,
      salesTax,
      total,
    };
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
