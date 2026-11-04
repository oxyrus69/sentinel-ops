'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Toast notifications.
 *
 * Bottom-right on desktop, top on mobile. Auto-dismisses after 5s; errors stay
 * until dismissed. Announced through an ARIA live region so screen readers hear
 * the result of an action that did not move focus.
 */

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastContextValue {
  toast: (input: Omit<Toast, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLE: Record<ToastTone, { border: string; icon: string; Icon: typeof Info }> = {
  success: { border: 'border-l-status-healthy', icon: 'text-status-healthy', Icon: CheckCircle2 },
  error: { border: 'border-l-status-critical', icon: 'text-status-critical', Icon: XCircle },
  warning: { border: 'border-l-status-warning', icon: 'text-status-warning', Icon: AlertTriangle },
  info: { border: 'border-l-status-info', icon: 'text-status-info', Icon: Info },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (input: Omit<Toast, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev.slice(-3), { ...input, id }]);

      // Errors persist until dismissed; everything else self-clears.
      if (input.tone !== 'error') {
        const timer = setTimeout(() => dismiss(id), 5000);
        timers.current.set(id, timer);
      }
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      dismiss,
      success: (title, description) => toast({ tone: 'success', title, description }),
      error: (title, description) => toast({ tone: 'error', title, description }),
      warning: (title, description) => toast({ tone: 'warning', title, description }),
      info: (title, description) => toast({ tone: 'info', title, description }),
    }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-3 top-3 z-[100] flex flex-col gap-2 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-auto sm:w-[360px]"
      >
        {toasts.map((t) => {
          const style = TONE_STYLE[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex items-start gap-2.5 rounded-md border border-border-strong border-l-[3px] bg-surface-overlay p-3',
                style.border,
              )}
            >
              <style.Icon aria-hidden="true" className={cn('mt-0.5 h-4 w-4 shrink-0', style.icon)} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-text-primary">{t.title}</p>
                {t.description ? (
                  <p className="mt-0.5 text-[12px] leading-relaxed text-text-secondary">
                    {t.description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Tutup notifikasi"
                className="shrink-0 cursor-pointer rounded-sm p-0.5 text-text-muted transition-colors duration-fast hover:text-text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast harus dipakai di dalam ToastProvider.');
  return ctx;
}
