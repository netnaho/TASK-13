import { cn } from '../lib/utils';

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  draft: 'bg-gray-100 text-gray-600',
  pending: 'bg-yellow-100 text-yellow-700',
  pending_review: 'bg-yellow-100 text-yellow-700',
  reviewer_approved: 'bg-blue-100 text-blue-700',
  finance_approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  queued: 'bg-gray-100 text-gray-600',
  running: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  expired: 'bg-gray-100 text-gray-400',
  archived: 'bg-gray-100 text-gray-500',
  paused: 'bg-yellow-100 text-yellow-700',
  ended: 'bg-gray-100 text-gray-500',
};

export default function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={cn('inline-flex px-2 py-0.5 rounded-full text-xs font-medium', style)}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
