import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
}

export interface MenuProps {
  items: MenuItem[];
  label: string;
  onClose: () => void;
  /** Coordenadas de viewport (menu de contexto / pressão longa). */
  position?: { x: number; y: number };
  /** Retângulo do gatilho (menu ancorado em botão). */
  anchor?: DOMRect;
  /** Elemento a receber o foco de volta ao fechar. */
  returnFocusTo?: HTMLElement | null;
}

/**
 * Menu suspensível com teclado completo (setas, Home/End, Esc),
 * posicionamento com clamp na viewport e devolução de foco.
 */
export function Menu({ items, label, onClose, position, anchor, returnFocusTo }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [style, setStyle] = useState<{ left: number; top: number }>({
    left: position?.x ?? anchor?.left ?? 0,
    top: position?.y ?? anchor?.bottom ?? 0,
  });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    let left = position?.x ?? anchor?.left ?? 0;
    let top = position?.y ?? anchor?.bottom ?? 0;
    if (left + rect.width > viewportW - 8) left = Math.max(8, viewportW - rect.width - 8);
    if (position && anchor === undefined) left = Math.max(8, left);
    if (top + rect.height > viewportH - 8) {
      const above = (position?.y ?? anchor?.top ?? 0) - rect.height;
      top = above > 8 ? above : Math.max(8, viewportH - rect.height - 8);
    }
    setStyle({ left, top });
  }, [position, anchor]);

  useEffect(() => {
    const node = ref.current;
    node?.focus({ preventScroll: true });

    const onPointerDown = (event: PointerEvent) => {
      if (node && !node.contains(event.target as Node)) onClose();
    };
    const onScroll = () => onClose();

    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  useEffect(() => {
    if (returnFocusTo) return () => returnFocusTo.focus({ preventScroll: true });
    return undefined;
  }, [returnFocusTo]);

  const enabled = items.filter((item) => !item.disabled);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'Tab') {
      onClose();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (enabled.length === 0) return;
      const current = enabled.findIndex((item) => item.id === activeId);
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const next =
        current === -1
          ? delta > 0
            ? 0
            : enabled.length - 1
          : (current + delta + enabled.length) % enabled.length;
      setActiveId(enabled[next]?.id ?? null);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      setActiveId(enabled[0]?.id ?? null);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      setActiveId(enabled[enabled.length - 1]?.id ?? null);
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      className="fixed z-[80] min-w-52 overflow-hidden rounded-[var(--radius)] border border-border bg-bg-raised p-1 shadow-[var(--shadow-lg)] outline-none"
      style={{ left: style.left, top: style.top }}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => {
        const isActive = !item.disabled && item.id === activeId;
        return (
          <div key={item.id}>
            {item.separatorBefore ? <div className="my-1 h-px bg-border" role="separator" /> : null}
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              data-active={isActive || undefined}
              className={`flex h-10 w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 text-left text-sm transition-colors ${
                item.danger ? 'text-danger hover:bg-danger-bg' : 'text-text hover:bg-bg-hover'
              } disabled:opacity-40`}
              onPointerEnter={() => !item.disabled && setActiveId(item.id)}
              onClick={() => {
                item.onSelect();
                onClose();
              }}
            >
              {item.icon ? <span className="flex w-4 justify-center">{item.icon}</span> : null}
              <span className="truncate">{item.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
