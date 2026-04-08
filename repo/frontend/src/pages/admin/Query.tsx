import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryApi, exportsApi, type QueryFilter, type PowerQueryRequest, type SavedQuery } from '../../api';
import { toast } from '../../components/Toaster';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import { getErrorMessage } from '../../lib/utils';

const ENTITIES = ['listings', 'conversations', 'settlements'] as const;
const OPS = ['eq', 'gt', 'lt', 'gte', 'lte', 'contains', 'in'] as const;

const FIELDS: Record<string, string[]> = {
  listings: ['title', 'breed', 'region', 'priceUsd', 'age', 'rating', 'status'],
  conversations: ['listingId', 'vendorId', 'isArchived', 'isDisputed'],
  settlements: ['vendorId', 'month', 'totalCharges', 'status'],
};

interface FilterRow {
  field: string;
  op: string;
  value: string;
}

export default function AdminQuery() {
  const qc = useQueryClient();
  const [entity, setEntity] = useState<string>('listings');
  const [filterRows, setFilterRows] = useState<FilterRow[]>([]);
  const [sortField, setSortField] = useState('');
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('DESC');
  const [page, setPage] = useState(1);
  const [saveName, setSaveName] = useState('');
  const [results, setResults] = useState<{ items: Record<string, unknown>[]; total: number; totalPages: number } | null>(null);

  const { data: savedQueries } = useQuery({
    queryKey: ['saved-queries'],
    queryFn: () => queryApi.getSaved(),
  });

  const executeMutation = useMutation({
    mutationFn: (req: PowerQueryRequest) => queryApi.execute(req),
    onSuccess: (res) => setResults({ items: res.items, total: res.total, totalPages: res.totalPages }),
    onError: (err) => toast(getErrorMessage(err), 'error'),
  });

  const saveMutation = useMutation({
    mutationFn: () => queryApi.save(saveName, { entity, filters: filterRows, sortField, sortDir }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['saved-queries'] }); toast('Query saved'); setSaveName(''); },
    onError: (err) => toast(getErrorMessage(err), 'error'),
  });

  const deleteSavedMutation = useMutation({
    mutationFn: (id: string) => queryApi.deleteSaved(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['saved-queries'] }); toast('Deleted'); },
  });

  const exportMutation = useMutation({
    mutationFn: () => exportsApi.create(entity, { filters: filterRows }),
    onSuccess: () => toast('Export job created'),
    onError: (err) => toast(getErrorMessage(err), 'error'),
  });

  const addFilter = () => setFilterRows([...filterRows, { field: FIELDS[entity]?.[0] ?? '', op: 'eq', value: '' }]);
  const removeFilter = (idx: number) => setFilterRows(filterRows.filter((_, i) => i !== idx));
  const updateFilter = (idx: number, key: keyof FilterRow, val: string) => {
    const updated = [...filterRows];
    updated[idx] = { ...updated[idx], [key]: val };
    setFilterRows(updated);
  };

  const runQuery = () => {
    const filters: QueryFilter[] = filterRows
      .filter((f) => f.field && f.value)
      .map((f) => ({
        field: f.field,
        op: f.op as QueryFilter['op'],
        value: f.op === 'in' ? f.value.split(',').map(s => s.trim()) : isNaN(Number(f.value)) ? f.value : Number(f.value),
      }));

    executeMutation.mutate({
      entity,
      filters: filters.length > 0 ? filters : undefined,
      sort: sortField ? { field: sortField, dir: sortDir } : undefined,
      page,
      limit: 20,
    });
  };

  const loadSaved = (sq: SavedQuery) => {
    const p = sq.params as { entity?: string; filters?: FilterRow[]; sortField?: string; sortDir?: string };
    if (p.entity) setEntity(p.entity);
    if (p.filters) setFilterRows(p.filters);
    if (p.sortField) setSortField(p.sortField);
    if (p.sortDir) setSortDir(p.sortDir as 'ASC' | 'DESC');
  };

  const fields = FIELDS[entity] ?? [];

  const resultColumns = results?.items?.[0]
    ? Object.keys(results.items[0]).map((key) => ({ key, header: key, sortable: true }))
    : [];

  return (
    <div className="flex gap-6">
      <div className="flex-1">
        <PageHeader title="Power Query">
          <button
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
            className="border border-gray-300 px-3 py-2 rounded-lg text-sm hover:bg-gray-50"
          >
            Export Results
          </button>
        </PageHeader>

        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-4">
          <div className="flex gap-1 border-b border-gray-200 pb-3">
            {ENTITIES.map((e) => (
              <button
                key={e}
                onClick={() => { setEntity(e); setFilterRows([]); setResults(null); }}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  entity === e ? 'bg-[#1a56db] text-white' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {e}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {filterRows.map((f, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select value={f.field} onChange={(e) => updateFilter(idx, 'field', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                  {fields.map((ff) => <option key={ff} value={ff}>{ff}</option>)}
                </select>
                <select value={f.op} onChange={(e) => updateFilter(idx, 'op', e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                  {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <input
                  value={f.value}
                  onChange={(e) => updateFilter(idx, 'value', e.target.value)}
                  placeholder="Value"
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm flex-1"
                />
                <button onClick={() => removeFilter(idx)} className="text-[#f05252] text-sm font-bold px-2">&times;</button>
              </div>
            ))}
            <button onClick={addFilter} className="text-[#1a56db] text-sm font-medium hover:underline">
              + Add Filter
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-500">Sort by:</label>
            <select value={sortField} onChange={(e) => setSortField(e.target.value)} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
              <option value="">Default</option>
              {fields.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <select value={sortDir} onChange={(e) => setSortDir(e.target.value as 'ASC' | 'DESC')} className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
              <option value="ASC">ASC</option>
              <option value="DESC">DESC</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={runQuery}
              disabled={executeMutation.isPending}
              className="bg-[#1a56db] text-white px-6 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
            >
              {executeMutation.isPending ? 'Running...' : 'Run Query'}
            </button>
            <div className="flex items-center gap-2">
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Query name"
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-40"
              />
              <button
                onClick={() => saveMutation.mutate()}
                disabled={!saveName.trim()}
                className="border border-gray-300 px-3 py-1.5 rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>

        {results && (
          <DataTable
            columns={resultColumns}
            data={results.items}
            total={results.total}
            page={page}
            totalPages={results.totalPages}
            onPageChange={(p) => { setPage(p); runQuery(); }}
          />
        )}
      </div>

      <aside className="w-56 flex-shrink-0 hidden xl:block">
        <h3 className="font-semibold text-sm text-gray-900 mb-3">Saved Queries</h3>
        <div className="space-y-2">
          {savedQueries?.length === 0 && <p className="text-xs text-gray-400">No saved queries</p>}
          {savedQueries?.map((sq: SavedQuery) => (
            <div key={sq.id} className="bg-white rounded-lg border border-gray-200 p-3">
              <p className="text-sm font-medium text-gray-900">{sq.name}</p>
              <div className="flex gap-2 mt-2">
                <button onClick={() => loadSaved(sq)} className="text-xs text-[#1a56db] hover:underline">Load</button>
                <button onClick={() => deleteSavedMutation.mutate(sq.id)} className="text-xs text-[#f05252] hover:underline">Delete</button>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
