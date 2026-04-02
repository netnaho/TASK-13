import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settlementsApi, type Settlement } from '../../api';
import { useAuthStore } from '../../store/auth.store';
import { toast } from '../../components/Toaster';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import { formatCurrency, getErrorMessage } from '../../lib/utils';

export default function AdminSettlements() {
  const { role } = useAuthStore();
  const qc = useQueryClient();
  const [month, setMonth] = useState('');
  const [filters, setFilters] = useState<{ month?: string; status?: string }>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['settlements', filters],
    queryFn: () => settlementsApi.getAll(filters),
  });

  const { data: detail } = useQuery({
    queryKey: ['settlement-detail', expandedId],
    queryFn: () => settlementsApi.getOne(expandedId!),
    enabled: !!expandedId,
  });

  const generateMutation = useMutation({
    mutationFn: (m: string) => settlementsApi.generateMonthly(m),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['settlements'] });
      toast(`Generated ${res.length} settlement(s)`);
    },
    onError: (err) => toast(getErrorMessage(err), 'error'),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => {
      if (role === 'ops_reviewer') return settlementsApi.approveStep1(id);
      if (role === 'finance_admin') return settlementsApi.approveStep2(id);
      return settlementsApi.approve(id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settlements'] }); toast('Approved!'); },
    onError: (err) => toast(getErrorMessage(err), 'error'),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => settlementsApi.reject(id, 'Rejected by reviewer'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settlements'] }); toast('Rejected'); },
    onError: (err) => toast(getErrorMessage(err), 'error'),
  });

  return (
    <div>
      <PageHeader title="Settlements">
        {role === 'admin' && (
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={() => { if (month) generateMutation.mutate(month); }}
              disabled={generateMutation.isPending || !month}
              className="bg-[#1a56db] text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
            >
              {generateMutation.isPending ? 'Generating...' : 'Generate Monthly'}
            </button>
          </div>
        )}
      </PageHeader>

      <div className="flex gap-2 mb-4">
        <select
          onChange={(e) => setFilters(f => ({ ...f, status: e.target.value || undefined }))}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="reviewer_approved">Reviewer Approved</option>
          <option value="finance_approved">Finance Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <DataTable
        columns={[
          { key: 'vendorId', header: 'Vendor', sortable: true, render: (r: Settlement) => <span className="font-mono text-xs">{r.vendorId.slice(0, 8)}</span> },
          { key: 'month', header: 'Month', sortable: true },
          { key: 'totalCharges', header: 'Total', sortable: true, render: (r: Settlement) => formatCurrency(Number(r.totalCharges)) },
          { key: 'taxAmount', header: 'Tax', render: (r: Settlement) => formatCurrency(Number(r.taxAmount)) },
          { key: 'status', header: 'Status', render: (r: Settlement) => <StatusBadge status={r.status} /> },
          {
            key: 'actions',
            header: 'Actions',
            render: (r: Settlement) => (
              <div className="flex items-center gap-2">
                {r.status === 'pending' && (role === 'ops_reviewer' || role === 'admin') && (
                  <button onClick={() => approveMutation.mutate(r.id)} className="text-xs bg-blue-600 text-white px-2 py-1 rounded">
                    Step 1
                  </button>
                )}
                {r.status === 'reviewer_approved' && (role === 'finance_admin' || role === 'admin') && (
                  <button onClick={() => approveMutation.mutate(r.id)} className="text-xs bg-green-600 text-white px-2 py-1 rounded">
                    Step 2
                  </button>
                )}
                {(r.status === 'pending' || r.status === 'reviewer_approved') && (
                  <button onClick={() => rejectMutation.mutate(r.id)} className="text-xs text-[#f05252] hover:underline">
                    Reject
                  </button>
                )}
                <button
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  className="text-xs text-gray-500 hover:underline"
                >
                  {expandedId === r.id ? 'Collapse' : 'Details'}
                </button>
                <button
                  onClick={() => settlementsApi.exportCsv(r.id)}
                  className="text-xs text-[#1a56db] hover:underline"
                >
                  CSV
                </button>
              </div>
            ),
          },
        ]}
        data={(data ?? []) as any[]}
        loading={isLoading}
      />

      {expandedId && detail && (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-sm mb-3">Variance Reconciliation</h3>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div className="text-center">
              <p className="text-gray-500">Expected</p>
              <p className="text-lg font-bold">{formatCurrency(detail.variance.expected)}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-500">Actual</p>
              <p className="text-lg font-bold">{formatCurrency(detail.variance.actual)}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-500">Variance</p>
              <p className="text-lg font-bold">{formatCurrency(detail.variance.variance)}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-500">Variance %</p>
              <p className="text-lg font-bold">{detail.variance.variancePercent.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
