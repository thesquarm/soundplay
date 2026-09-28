import React, { useEffect } from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div
      aria-live="polite"
      className="fixed top-20 right-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100vw-32px)] sm:w-96 pointer-events-none"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
};

interface ToastItemProps {
  toast: ToastMessage;
  onDismiss: () => void;
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss();
    }, toast.duration ?? 5000);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  const config = {
    info: {
      bg: 'bg-zinc-950/95 border-zinc-800 text-zinc-100',
      icon: <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
    },
    success: {
      bg: 'bg-emerald-950/95 border-emerald-800 text-emerald-100',
      icon: <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
    },
    warning: {
      bg: 'bg-amber-950/95 border-amber-800 text-amber-100',
      icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
    },
    error: {
      bg: 'bg-red-950/95 border-red-800 text-red-100',
      icon: <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
    }
  }[toast.type];

  return (
    <div
      role="alert"
      className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-2xl backdrop-blur-md transition-all duration-200 animate-slide-left select-none text-xs font-sans leading-relaxed ${config.bg}`}
    >
      {config.icon}
      <div className="flex-1 font-medium break-words">
        {toast.message}
      </div>
      <button
        onClick={onDismiss}
        className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
        title="Dismiss notification"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
