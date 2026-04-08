import { apiGet, apiPost } from './axios';
import api from './axios';

export interface Settlement {
  id: string;
  vendorId: string;
  month: string;
  totalCharges: number;
  taxAmount: number;
  status: string;
  data: Record<string, unknown>;
  reviewerApprovedBy: string | null;
  financeApprovedBy: string | null;
  createdAt: string;
  vendor?: { id: string; username: string };
}

export interface SettlementDetail {
  settlement: Settlement;
  variance: { expected: number; actual: number; variance: number; variancePercent: number };
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

export interface FreightCalcRequest {
  distanceMiles: number;
  weightLbs: number;
  dimWeightLbs: number;
  isOversized: boolean;
  isWeekend: boolean;
}

export const settlementsApi = {
  getAll: (filters?: { month?: string; status?: string }) =>
    apiGet<Settlement[]>('/settlements', filters as Record<string, unknown>),
  getOne: (id: string) => apiGet<SettlementDetail>(`/settlements/${id}`),
  generateMonthly: (month: string) =>
    apiPost<Settlement[]>('/settlements/generate-monthly', { month }),
  approveStep1: (id: string) => apiPost<Settlement>(`/settlements/${id}/approve-step1`),
  approveStep2: (id: string) => apiPost<Settlement>(`/settlements/${id}/approve-step2`),
  reject: (id: string, reason: string) =>
    apiPost<Settlement>(`/settlements/${id}/reject`, { reason }),
  calculateFreight: (body: FreightCalcRequest) =>
    apiPost<FreightBreakdown>('/settlements/freight/calculate', body),
  exportCsv: async (id: string): Promise<void> => {
    const res = await api.get(`/settlements/export/${id}`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `settlement-${id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
