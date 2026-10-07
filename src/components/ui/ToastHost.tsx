import { useEffect, useState } from 'react';

import { t } from '@/i18n';
import { useUiStore, type Toast } from '@/store/uiStore';

import { Icon } from './Icon';

const DURATION_MS = 4000;

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useUiStore((state) => state.dismissToast);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || toast.persistent) return;
    const timer = setTimeout(() => dismiss(toast.id), DURATION_MS);
    return () => clearTimeout(timer);
  }, [paused, toast.persistent, toast.id, dismiss, toast.actionLabel]);

  return (
    <div
      className={`pointer-events-auto flex min-h-11 max-w-96 items-center gap-3 rounded-[var(--radius)] border px-3 py-2 text-sm shadow-[var(--shadow)] ${
        toast.tone === 'error'
          ? 'border-danger bg-danger-bg text-danger'
          : 'border-accent bg-bg-raised text-text'
      }`}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <Icon name={toast.tone === 'error' ? 'info' : 'check'} size={16} className="shrink-0" />
      <span className="min-w-0 flex-1">{toast.message}</span>
      {toast.actionLabel && toast.onAction ? (
        <button
          type="button"
          className="shrink-0 rounded-[var(--radius-sm)] px-2 py-1 font-medium text-accent hover:bg-bg-hover"
          onClick={() => {
            toast.onAction?.();
            dismiss(toast.id);
          }}
        >
          {toast.actionLabel}
        </button>
      ) : null}
    </div>
  );
}

/** Pilha de avisos (máx. 3, 4 s, pausam no hover) com região viva. */
export function ToastHost() {
  const toasts = useUiStore((state) => state.toasts);
  return (
    <div
      className="pointer-events-none fixed right-6 bottom-6 z-[100] flex flex-col items-end gap-2"
      role="status"
      aria-live="polite"
      aria-label={t('a11y.regiaoNoticias')}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
