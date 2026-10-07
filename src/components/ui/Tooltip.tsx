import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

export interface TooltipProps {
  /** Conteúdo do tooltip (curto, nunca essencial sozinho). */
  label: ReactNode;
  children: ReactElement<{ 'aria-describedby'?: string }>;
  placement?: 'top' | 'bottom' | 'right';
  delayMs?: number;
}

const PLACEMENTS: Record<NonNullable<TooltipProps['placement']>, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

/**
 * Tooltip acessível: abre no hover e no foco de teclado, fecha no Esc,
 * e sempre complementa (nunca é a única forma de entender o controle).
 */
export function Tooltip({ label, children, placement = 'top', delayMs = 350 }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delayMs);
  }, [delayMs]);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, hide]);

  const child = cloneElement(children, { 'aria-describedby': open ? id : undefined });

  return (
    <span
      className="relative inline-flex"
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocusCapture={show}
      onBlurCapture={hide}
    >
      {child}
      {open ? (
        <span
          role="tooltip"
          id={id}
          className={`pointer-events-none absolute z-50 max-w-60 rounded-[var(--radius-sm)] border border-border bg-bg-raised px-2 py-1 text-xs leading-snug text-text shadow-[var(--shadow)] ${PLACEMENTS[placement]}`}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
