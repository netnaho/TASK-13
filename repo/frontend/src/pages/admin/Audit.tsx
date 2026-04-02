import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { auditApi, type AuditLog, type AuditFilters } from '../../api';
import { toast } from '../../components/Toaster';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import { formatDateTime, getErrorMessage } from '../../lib/utils';

export default function AdminAudit() {
  const [filters, setFilters] = useState<AuditFilters>({ page: 1, limit: 50 });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [verifyResults, setVerifyResults] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['audit', filters],
    queryFn: () => auditApi.getAll(filters),
  });

  const verifyMutation = useMutation({
    mutationFn: (id: string) => auditApi.verify(id),
    onSuccess: (res, id) => {
      setVerifyResults((prev) => ({ ...prev, [id]: res.valid }));
      toast(res.valid ? 'Hash integrity verified' : 'Hash integrity FAILED!', res.valid ? 'success' : 'error');
    },
    onError: (err) => toast(getErrorMessage(err), 'error'),
  });

  const exportMutation = useMutation({
    mutationFn: () => auditApi.exportAudit(filters),
    onSuccess: (res) => toast(`Export job created: ${res.id}`),
    onError: (err) => toast(getErrorMessage(err), 'error'),
  });

  return (
    <div>
      <PageHeader title="Audit Logs">
        <button
          onClick={() => exportMutation.mutate()}
          disabled={exportMutation.isPending}
          className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
        >
          Export Audit Log
        </button>
      </PageHeader>

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          placeholder="Actor ID"
          onChange={(e) => setFilters(f => ({ ...f, actorId: e.target.value || undefined, page: 1 }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-40"
        />
        <select
          onChange={(e) => setFilters(f => ({ ...f, entityType: e.target.value || undefined, page: 1 }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Types</option>
          {['user', 'listing', 'conversation', 'message', 'settlement', 'campaign', 'sensitive_word', 'canned_response'].map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input
          placeholder="Action"
          onChange={(e) => setFilters(f => ({ ...f, action: e.target.value || undefined, page: 1 }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-40"
        />
        <input
          type="date"
          onChange={(e) => setFilters(f => ({ ...f, startDate: e.target.value || undefined, page: 1 }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          type="date"
          onChange={(e) => setFilters(f => ({ ...f, endDate: e.target.value || undefined, page: 1 }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          placeholder="Keyword in data"
          onChange={(e) => setFilters(f => ({ ...f, keyword: e.target.value || undefined, page: 1 }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-40"
        />
      </div>

      <DataTable
        columns={[
          { key: 'createdAt', header: 'Time', sortable: true, render: (r: AuditLog) => <span className="text-xs">{formatDateTime(r.createdAt)}</span> },
          { key: 'actorUsername', header: 'Actor', render: (r: AuditLog) => <span className="text-xs font-medium">{r.actorUsername ?? r.actorId.slice(0, 8)}</span> },
          { key: 'action', header: 'Action', render: (r: AuditLog) => <span className="font-mono text-xs">{r.action}</span> },
          { key: 'entityType', header: 'Entity', render: (r: AuditLog) => <span className="text-xs">{r.entityType}{r.entityId ? ` #${r.entityId.slice(0, 8)}` : ''}</span> },
          { key: 'hash', header: 'Hash', render: (r: AuditLog) => <span className="font-mono text-[10px] text-gray-400">{r.hash.slice(0, 16)}...</span> },
          {
            key: 'actions',
            header: '',
            render: (r: AuditLog) => (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  className="text-xs text-[#1a56db] hover:underline"
                >
                  {expandedId === r.id ? 'Hide' : 'Data'}
                </button>
                <button
                  onClick={() => verifyMutation.mutate(r.id)}
                  className="text-xs text-gray-500 hover:underline"
                >
                  {verifyResults[r.id] === true ? '✅' : verifyResults[r.id] === false ? '❌' : 'Verify'}
                </button>
              </div>
            ),
          },
        ]}
        data={(data?.items ?? []) as any[]}
        total={data?.total}
        page={filters.page ?? 1}
        totalPages={Math.ceil((data?.total ?? 0) / (filters.limit ?? 50))}
        onPageChange={(p) => setFilters(f => ({ ...f, page: p }))}
        loading={isLoading}
      />

      {expandedId && data?.items.find(i => i.id === expandedId) && (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Before</p>
              <pre className="text-xs bg-gray-50 rounded p-3 overflow-auto max-h-48">
                {JSON.stringify(data?.items.find(i => i.id === expandedId)?.before, null, 2) ?? 'null'}
              </pre>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">After</p>
              <pre className="text-xs bg-gray-50 rounded p-3 overflow-auto max-h-48">
                {JSON.stringify(data?.items.find(i => i.id === expandedId)?.after, null, 2) ?? 'null'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
