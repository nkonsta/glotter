'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type ToastVariant = 'success' | 'error' | 'info';

export interface ToastOptions {
  title?: string;
  description?: string;
  variant?: ToastVariant;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

export interface Toast extends Required<Pick<ToastOptions, 'variant'>> {
  id: string;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs: number;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timers = timersRef.current;
    const handle = timers.get(id);
    if (handle) {
      window.clearTimeout(handle);
      timers.delete(id);
    }
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    const id = Math.random().toString(36).slice(2);
    const next: Toast = {
      id,
      title: options.title,
      description: options.description,
      actionLabel: options.actionLabel,
      onAction: options.onAction,
      variant: options.variant ?? 'info',
      durationMs: options.durationMs ?? 4000,
    };
    setToasts(prev => [...prev, next]);
    const handle = window.setTimeout(() => dismiss(id), next.durationMs);
    timersRef.current.set(id, handle);
    return id;
  }, [dismiss]);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((h) => window.clearTimeout(h));
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed z-[60] bottom-4 right-4 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    // Pause auto-dismiss on hover is handled by provider timers; here we only change pointer-events
  }, [hovered]);

  const variantBar = toast.variant === 'success'
    ? 'bg-success'
    : toast.variant === 'error'
      ? 'bg-danger'
      : 'bg-info';

  const role = toast.variant === 'error' ? 'alert' : 'status';
  const ariaLive = toast.variant === 'error' ? 'assertive' : 'polite';

  return (
    <div
      role={role}
      aria-live={ariaLive}
      aria-atomic="true"
      className="pointer-events-auto w-[360px] max-w-[92vw] rounded-xl border border-border bg-surface-elevated shadow-card overflow-hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={`h-1 ${variantBar}`} />
      <div className="p-3.5">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {toast.title && (
              <div className="text-sm font-semibold text-foreground truncate">{toast.title}</div>
            )}
            {toast.description && (
              <div className="text-sm text-muted mt-0.5 break-words">{toast.description}</div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {toast.actionLabel && toast.onAction && (
              <button
                onClick={toast.onAction}
                className="px-2.5 py-1 text-sm font-medium rounded-md border border-border bg-surface hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {toast.actionLabel}
              </button>
            )}
            <button
              aria-label="Close notification"
              onClick={onDismiss}
              className="p-1 rounded-md text-muted hover:text-foreground hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

