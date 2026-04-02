import { apiGet, apiPost, apiDelete, PaginatedResponse } from './axios';

export interface QueryFilter {
  field: string;
  op: 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'in';
  value: unknown;
}

export interface PowerQueryRequest {
  entity: string;
  filters?: QueryFilter[];
  sort?: { field: string; dir: string };
  page?: number;
  limit?: number;
}

export interface SavedQuery {
  id: string;
  userId: string;
  name: string;
  params: Record<string, unknown>;
  createdAt: string;
}

export const queryApi = {
  execute: (body: PowerQueryRequest) =>
    apiPost<PaginatedResponse<Record<string, unknown>>>('/query', body),
  save: (name: string, params: Record<string, unknown>) =>
    apiPost<SavedQuery>('/query/save', { name, params }),
  getSaved: () => apiGet<SavedQuery[]>('/query/saved'),
  deleteSaved: (id: string) => apiDelete(`/query/saved/${id}`),
};
