import { apiGet, apiPost } from './axios';

export interface CreditScore {
  id: string;
  userId: string;
  score: number;
  transactionSuccessRate: number;
  disputeRate: number;
  cancellationRate: number;
  computedAt: string;
}

export const creditsApi = {
  getMyScore: () => apiGet<CreditScore>('/credits/me'),
  getScore: (userId: string) => apiGet<CreditScore>(`/credits/${userId}`),
  compute: (userId: string) => apiPost<CreditScore>(`/credits/compute/${userId}`),
};
