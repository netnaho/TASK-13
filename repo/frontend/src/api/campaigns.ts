import { apiGet, apiPost, apiPut, apiDelete } from './axios';

export interface Campaign {
  id: string;
  title: string;
  type: 'announcement' | 'carousel' | 'recommendation';
  startTime: string;
  endTime: string;
  slotIndex: number;
  data: Record<string, unknown>;
  status: 'draft' | 'active' | 'paused' | 'ended';
  createdAt: string;
}

export interface SensitiveWord {
  id: string;
  word: string;
  createdAt: string;
}

export const campaignsApi = {
  getAll: (filters?: Record<string, unknown>) =>
    apiGet<Campaign[]>('/admin/campaigns', filters),
  getActive: () => apiGet<Campaign[]>('/campaigns/active'),
  create: (body: Partial<Campaign>) => apiPost<Campaign>('/admin/campaigns', body),
  update: (id: string, body: Partial<Campaign>) => apiPut<Campaign>(`/admin/campaigns/${id}`, body),
  remove: (id: string) => apiDelete(`/admin/campaigns/${id}`),
  getSensitiveWords: () => apiGet<SensitiveWord[]>('/admin/sensitive-words'),
  addSensitiveWord: (word: string) => apiPost<SensitiveWord>('/admin/sensitive-words', { word }),
  removeSensitiveWord: (id: string) => apiDelete(`/admin/sensitive-words/${id}`),
};
