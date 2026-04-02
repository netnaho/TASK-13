import { useEffect, useState } from 'react';
import { cn } from '../lib/utils';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning';
}

type ToastFn = (message: string, type?: 'success' | 'error' | 'warning') => void;
let addToastFn: ToastFn = () => {};

export function toast(message: string, type: 'success' | 'error' | 'warning' = 'success') {
  addToastFn(message, type);
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    addToastFn = (message, type = 'success') => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
    };
  }, []);

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'px-4 py-3 rounded-lg shadow-lg text-sm text-white',
            t.type === 'success' && 'bg-[#0e9f6e]',
            t.type === 'error' && 'bg-[#f05252]',
            t.type === 'warning' && 'bg-[#e3a008] text-gray-900',
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
