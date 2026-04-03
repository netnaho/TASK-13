import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationsApi, type Message, type CannedResponse } from '../api';
import { useAuthStore } from '../store/auth.store';
import { toast } from '../components/Toaster';
import PageHeader from '../components/PageHeader';
import { cn, formatDateTime, getErrorMessage } from '../lib/utils';

export default function Conversations() {
  const { user, role } = useAuthStore();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data: convs, isLoading, isError, refetch } = useQuery({
    queryKey: ['conversations', keyword, showArchived, startDate, endDate],
    queryFn: () => conversationsApi.getAll({
      keyword: keyword || undefined,
      archived: showArchived || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
  });

  const { data: activeConv, isLoading: msgsLoading } = useQuery({
    queryKey: ['conversation', activeId],
    queryFn: () => conversationsApi.getOne(activeId!),
    enabled: !!activeId,
    refetchInterval: 5000,
  });

  const { data: cannedResponses } = useQuery({
    queryKey: ['canned-responses'],
    queryFn: () => conversationsApi.getCannedResponses(),
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      conversationsApi.sendMessage(activeId!, { type: 'text', content, isInternal }),
    onSuccess: () => {
      setInput('');
      setIsInternal(false);
      qc.invalidateQueries({ queryKey: ['conversation', activeId] });
    },
    onError: (err) => toast(getErrorMessage(err), 'error'),
  });

  const voiceInputRef = useRef<HTMLInputElement>(null);

  const voiceMutation = useMutation({
    mutationFn: (file: File) => conversationsApi.uploadVoice(activeId!, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation', activeId] });
      toast('Voice message sent');
    },
    onError: (err) => toast(getErrorMessage(err), 'error'),
  });

  const archiveMutation = useMutation({
    mutationFn: () => conversationsApi.archive(activeId!),
    onSuccess: () => {
      toast('Conversation archived');
      qc.invalidateQueries({ queryKey: ['conversations'] });
      setActiveId(null);
    },
    onError: (err) => toast(getErrorMessage(err), 'error'),
  });

  const canSeeInternalNotes = role === 'vendor' || role === 'admin';
  const messages = (activeConv?.messages ?? []).filter(
    (m) => !m.isInternal || canSeeInternalNotes,
  );

  return (
    <div className="h-[calc(100vh-8rem)]">
      <PageHeader title="Conversations" />
      <div className="flex h-[calc(100%-3rem)] gap-4">
        {/* List */}
        <aside className="w-72 flex-shrink-0 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-3 border-b border-gray-100 space-y-2">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Search conversations..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">From</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">To</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-500">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded"
              />
              Show archived
            </label>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-3 space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 skeleton" />)}</div>
            ) : isError ? (
              <div className="p-4 text-center">
                <p className="text-sm text-red-500 mb-2">Failed to load conversations</p>
                <button onClick={() => refetch()} className="text-xs text-[#1a56db] underline">Retry</button>
              </div>
            ) : convs?.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No conversations</p>
            ) : (
              convs?.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={cn(
                    'w-full text-left p-3 border-b border-gray-50 hover:bg-gray-50 transition-colors',
                    activeId === c.id && 'bg-blue-50 border-l-2 border-l-[#1a56db]',
                  )}
                >
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {c.listing?.title ?? `Listing #${c.listingId.slice(0, 8)}`}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(c.createdAt)}</p>
                  {c.isArchived && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">archived</span>}
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Chat */}
        <div className="flex-1 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
          {!activeId ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              Select a conversation
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm text-gray-900">
                    {activeConv?.conversation.listing?.title ?? 'Conversation'}
                  </p>
                </div>
                {(role === 'vendor' || role === 'admin') && (
                  <button
                    onClick={() => archiveMutation.mutate()}
                    className="text-xs text-gray-500 hover:text-[#f05252] border border-gray-200 px-3 py-1 rounded-lg"
                  >
                    Archive
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {msgsLoading && <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 skeleton" />)}</div>}
                {messages.map((m: Message) => (
                  <div
                    key={m.id}
                    className={cn(
                      'max-w-[75%] rounded-xl px-4 py-2.5 text-sm',
                      m.isInternal
                        ? 'bg-yellow-50 border border-yellow-200 text-yellow-900 ml-auto'
                        : m.senderId === user?.id
                          ? 'bg-[#1a56db] text-white ml-auto'
                          : 'bg-gray-100 text-gray-900',
                    )}
                  >
                    {m.isInternal && <span className="text-[10px] font-semibold text-yellow-600 block mb-1">🔒 Internal Note</span>}
                    {m.type === 'voice' && m.audioUrl ? (
                      <audio controls src={m.audioUrl} className="max-w-full" />
                    ) : (
                      <p>{m.content}</p>
                    )}
                    <p className={cn('text-[10px] mt-1', m.senderId === user?.id ? 'text-white/60' : 'text-gray-400')}>
                      {formatDateTime(m.createdAt)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="p-3 border-t border-gray-100 space-y-2">
                {(role === 'vendor' || role === 'admin') && (
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-gray-500">
                      <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="rounded" />
                      Internal note
                    </label>
                    {cannedResponses && cannedResponses.length > 0 && (
                      <select
                        onChange={(e) => { if (e.target.value) setInput(e.target.value); e.target.value = ''; }}
                        className="text-xs border border-gray-200 rounded px-2 py-1"
                      >
                        <option value="">Insert canned response...</option>
                        {cannedResponses.map((cr: CannedResponse) => (
                          <option key={cr.id} value={cr.body}>{cr.title}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && input.trim()) {
                        e.preventDefault();
                        sendMutation.mutate(input.trim());
                      }
                    }}
                    placeholder={isInternal ? 'Add internal note...' : 'Type a message...'}
                    rows={2}
                    className={cn(
                      'flex-1 border rounded-lg px-3 py-2 text-sm resize-none',
                      isInternal ? 'border-yellow-300 bg-yellow-50' : 'border-gray-300',
                    )}
                  />
                  <button
                    onClick={() => { if (input.trim()) sendMutation.mutate(input.trim()); }}
                    disabled={sendMutation.isPending || !input.trim()}
                    className="bg-[#1a56db] text-white px-4 rounded-lg text-sm font-medium disabled:opacity-60 self-end h-10"
                  >
                    Send
                  </button>
                  <input
                    ref={voiceInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) voiceMutation.mutate(file);
                      e.target.value = '';
                    }}
                  />
                  <button
                    onClick={() => voiceInputRef.current?.click()}
                    disabled={voiceMutation.isPending}
                    className="bg-gray-100 text-gray-600 px-3 rounded-lg text-sm font-medium disabled:opacity-60 self-end h-10"
                    title="Send voice message"
                  >
                    Voice
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
