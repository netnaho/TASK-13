import { apiGet, apiPost } from './axios';
import api from './axios';

export interface ExportJob {
  id: string;
  requesterId: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'expired';
  filePath: string | null;
  params: Record<string, unknown>;
  expiresAt: string | null;
  createdAt: string;
  /** 0–100 progress percentage. Null on legacy rows or before processing starts. */
  progressPercent?: number | null;
  /** Human-readable stage label set by the backend processor. */
  progressStage?: string | null;
}

export const exportsApi = {
  getAll: () => apiGet<ExportJob[]>('/exports/jobs'),
  create: (type: string, filters?: Record<string, unknown>) =>
    apiPost<ExportJob>('/exports/jobs', { type, filters }),
  getStatus: (id: string) => apiGet<ExportJob>(`/exports/jobs/${id}`),
  download: async (id: string): Promise<void> => {
    const res = await api.get(`/exports/jobs/${id}/download`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export-${id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
