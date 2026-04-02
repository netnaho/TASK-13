import { apiGet, apiPost } from './axios';

export interface AuditLog {
  id: string;
  action: string;
  actorId: string;
  actorUsername?: string;
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  hash: string;
  createdAt: string;
}

export interface AuditFilters {
  actorId?: string;
  entityType?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  keyword?: string;
  page?: number;
  limit?: number;
}

export interface VerifyResult {
  valid: boolean;
  entry: AuditLog;
}

export const auditApi = {
  getAll: (filters?: AuditFilters) =>
    apiGet<{ items: AuditLog[]; total: number }>('/admin/audit', filters as Record<string, unknown>),
  verify: (id: string) => apiGet<VerifyResult>(`/admin/audit/${id}/verify`),
  exportAudit: (filters?: Partial<AuditFilters>) =>
    apiPost<{ id: string }>('/admin/audit/export', filters),
};
