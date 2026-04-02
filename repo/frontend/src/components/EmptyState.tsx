interface Props {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <svg className="w-20 h-20 text-gray-300 mb-4" fill="none" viewBox="0 0 80 80">
        <rect x="10" y="20" width="60" height="45" rx="6" stroke="currentColor" strokeWidth="2" fill="none" />
        <line x1="25" y1="35" x2="55" y2="35" stroke="currentColor" strokeWidth="2" />
        <line x1="25" y1="45" x2="45" y2="45" stroke="currentColor" strokeWidth="2" />
        <circle cx="40" cy="15" r="6" stroke="currentColor" strokeWidth="2" fill="none" />
      </svg>
      <h3 className="text-lg font-semibold text-gray-700 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-400 mb-4 max-w-xs">{description}</p>}
      {action}
    </div>
  );
}
