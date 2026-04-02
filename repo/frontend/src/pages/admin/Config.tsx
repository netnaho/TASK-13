import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { campaignsApi, conversationsApi, type Campaign, type SensitiveWord, type CannedResponse } from '../../api';
import { toast } from '../../components/Toaster';
import PageHeader from '../../components/PageHeader';
import DataTable from '../../components/DataTable';
import StatusBadge from '../../components/StatusBadge';
import { formatDateTime, getErrorMessage } from '../../lib/utils';

const tabs = ['Campaigns', 'Sensitive Words', 'Canned Responses'] as const;

export default function AdminConfig() {
  const [activeTab, setActiveTab] = useState<typeof tabs[number]>('Campaigns');

  return (
    <div>
      <PageHeader title="Platform Config" />
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t
                ? 'border-[#1a56db] text-[#1a56db]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      {activeTab === 'Campaigns' && <CampaignsTab />}
      {activeTab === 'Sensitive Words' && <SensitiveWordsTab />}
      {activeTab === 'Canned Responses' && <CannedResponsesTab />}
    </div>
  );
}

const campaignSchema = z.object({
  title: z.string().min(1),
  type: z.enum(['announcement', 'carousel', 'recommendation']),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  slotIndex: z.coerce.number().min(1).max(10).optional(),
  status: z.enum(['draft', 'active']).optional(),
});

function CampaignsTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => campaignsApi.getAll(),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(campaignSchema),
  });

  const createMutation = useMutation({
    mutationFn: (d: z.infer<typeof campaignSchema>) => campaignsApi.create(d as Partial<Campaign>),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast('Campaign created'); setShowForm(false); reset(); },
    onError: (err) => toast(getErrorMessage(err), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['campaigns'] }); toast('Campaign deleted'); },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm(!showForm)} className="bg-[#1a56db] text-white px-4 py-2 rounded-lg text-sm font-semibold">
          {showForm ? 'Cancel' : '+ New Campaign'}
        </button>
      </div>
      {showForm && (
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d as z.infer<typeof campaignSchema>))} className="bg-white border rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <input {...register('title')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              {errors.title && <p className="text-[#f05252] text-xs mt-1">{String(errors.title.message)}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select {...register('type')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="announcement">Announcement</option>
                <option value="carousel">Carousel</option>
                <option value="recommendation">Recommendation</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Start Time</label>
              <input type="datetime-local" {...register('startTime')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End Time</label>
              <input type="datetime-local" {...register('endTime')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Slot (1-10)</label>
              <input type="number" {...register('slotIndex')} min={1} max={10} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select {...register('status')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="draft">Draft</option>
                <option value="active">Active</option>
              </select>
            </div>
          </div>
          <button type="submit" disabled={createMutation.isPending} className="bg-[#1a56db] text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60">
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </button>
        </form>
      )}
      <DataTable
        columns={[
          { key: 'title', header: 'Title', sortable: true },
          { key: 'type', header: 'Type', render: (r: Campaign) => <StatusBadge status={r.type} /> },
          { key: 'status', header: 'Status', render: (r: Campaign) => <StatusBadge status={r.status} /> },
          { key: 'startTime', header: 'Start', render: (r: Campaign) => <span className="text-xs">{formatDateTime(r.startTime)}</span> },
          { key: 'endTime', header: 'End', render: (r: Campaign) => <span className="text-xs">{formatDateTime(r.endTime)}</span> },
          {
            key: 'actions', header: '', render: (r: Campaign) => (
              <button onClick={() => deleteMutation.mutate(r.id)} className="text-xs text-[#f05252] hover:underline">Delete</button>
            ),
          },
        ]}
        data={(data ?? []) as any[]}
        loading={isLoading}
      />
    </div>
  );
}

function SensitiveWordsTab() {
  const qc = useQueryClient();
  const [newWord, setNewWord] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['sensitive-words'],
    queryFn: () => campaignsApi.getSensitiveWords(),
  });

  const addMutation = useMutation({
    mutationFn: (word: string) => campaignsApi.addSensitiveWord(word),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sensitive-words'] }); toast('Word added'); setNewWord(''); },
    onError: (err) => toast(getErrorMessage(err), 'error'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => campaignsApi.removeSensitiveWord(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sensitive-words'] }); toast('Word removed'); },
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={newWord}
          onChange={(e) => setNewWord(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && newWord.trim()) addMutation.mutate(newWord.trim()); }}
          placeholder="Add sensitive word..."
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
        />
        <button
          onClick={() => { if (newWord.trim()) addMutation.mutate(newWord.trim()); }}
          disabled={addMutation.isPending}
          className="bg-[#1a56db] text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
        >
          Add
        </button>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {isLoading ? (
          <div className="flex gap-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 w-20 skeleton rounded-full" />)}</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data?.map((w: SensitiveWord) => (
              <span key={w.id} className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 px-3 py-1.5 rounded-full text-sm font-medium">
                {w.word}
                <button onClick={() => removeMutation.mutate(w.id)} className="text-red-400 hover:text-red-600 font-bold">&times;</button>
              </span>
            ))}
            {data?.length === 0 && <p className="text-gray-400 text-sm">No sensitive words configured</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function CannedResponsesTab() {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['canned-responses'],
    queryFn: () => conversationsApi.getCannedResponses(),
  });

  const createMutation = useMutation({
    mutationFn: () => conversationsApi.createCannedResponse({ title, body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['canned-responses'] });
      toast('Canned response created');
      setTitle('');
      setBody('');
    },
    onError: (err) => toast(getErrorMessage(err), 'error'),
  });

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
        <h3 className="font-semibold text-sm">Add Canned Response</h3>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Response body"
          rows={3}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending || !title.trim() || !body.trim()}
          className="bg-[#1a56db] text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
        >
          {createMutation.isPending ? 'Creating...' : 'Add Response'}
        </button>
      </div>
      <DataTable
        columns={[
          { key: 'title', header: 'Title', sortable: true },
          { key: 'body', header: 'Body', render: (r: CannedResponse) => <span className="text-xs text-gray-500 line-clamp-1">{r.body}</span> },
          { key: 'createdAt', header: 'Created', render: (r: CannedResponse) => <span className="text-xs">{formatDateTime(r.createdAt)}</span> },
        ]}
        data={(data ?? []) as any[]}
        loading={isLoading}
      />
    </div>
  );
}
