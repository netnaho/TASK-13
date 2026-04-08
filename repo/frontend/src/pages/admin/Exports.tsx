import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { exportsApi, type ExportJob } from '../../api';
import { toast } from '../../components/Toaster';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import { formatDateTime, getErrorMessage } from '../../lib/utils';
import { getProgressBarState, shouldShowProgressBar } from '../../lib/export-progress';

const EXPORT_TYPES = ['listings', 'conversations', 'settlements', 'audit'];

export default function AdminExports() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [exportType, setExportType] = useState('listings');

  const { data, isLoading } = useQuery({
    queryKey: ['exports'],
    queryFn: () => exportsApi.getAll(),
    refetchInterval: 5000,
  });

  const createMutation = useMutation({
    mutationFn: (type: string) => exportsApi.create(type),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exports'] });
      toast('Export job queued');
      setShowForm(false);
    },
    onError: (err) => toast(getErrorMessage(err), 'error'),
  });

  return (
    <div>
      <PageHeader title="Data Exports" subtitle="Export data to CSV files">
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-[#1a56db] text-white px-4 py-2 rounded-lg text-sm font-semibold"
        >
          {showForm ? 'Cancel' : '+ New Export'}
        </button>
      </PageHeader>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-4">
          <h3 className="font-semibold text-sm">Create New Export</h3>
          <div>
            <label className="block text-sm font-medium mb-1">Export Type</label>
            <select
              value={exportType}
              onChange={(e) => setExportType(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64"
            >
              {EXPORT_TYPES.map((t) => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => createMutation.mutate(exportType)}
            disabled={createMutation.isPending}
            className="bg-[#1a56db] text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
          >
            {createMutation.isPending ? 'Creating...' : 'Start Export'}
          </button>
          <p className="text-xs text-gray-400">Max 2 concurrent jobs. Files expire after 7 days.</p>
        </div>
      )}

      <DataTable
        columns={[
          {
            key: 'type',
            header: 'Type',
            render: (r: ExportJob) => (
              <span className="font-medium text-sm">{String(r.params?.type ?? 'unknown')}</span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            render: (r: ExportJob) => {
              const bar = getProgressBarState(r.status, r.progressPercent);
              return (
                <div className="flex items-center gap-2">
                  <StatusBadge status={r.status} />
                  {shouldShowProgressBar(r.status) && (
                    <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-[#1a56db] rounded-full${bar.indeterminate ? ' animate-pulse' : ''}`}
                        style={{ width: bar.width }}
                      />
                    </div>
                  )}
                </div>
              );
            },
          },
          {
            key: 'createdAt',
            header: 'Created',
            sortable: true,
            render: (r: ExportJob) => <span className="text-xs">{formatDateTime(r.createdAt)}</span>,
          },
          {
            key: 'expiresAt',
            header: 'Expires',
            render: (r: ExportJob) => (
              <span className="text-xs text-gray-400">{r.expiresAt ? formatDateTime(r.expiresAt) : '—'}</span>
            ),
          },
          {
            key: 'actions',
            header: '',
            render: (r: ExportJob) => (
              r.status === 'done' && r.expiresAt && new Date(r.expiresAt) > new Date() ? (
                <button
                  onClick={() => exportsApi.download(r.id)}
                  className="text-xs bg-[#0e9f6e] text-white px-3 py-1 rounded font-medium"
                >
                  Download
                </button>
              ) : r.status === 'expired' ? (
                <span className="text-xs text-gray-400">Expired</span>
              ) : null
            ),
          },
        ]}
        data={(data ?? []) as any[]}
        loading={isLoading}
        emptyMessage="No export jobs yet"
      />
    </div>
  );
}
