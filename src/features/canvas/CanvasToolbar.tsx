import { useRef, useState } from 'react';

import { Icon } from '@/components/ui/Icon';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { Tooltip } from '@/components/ui/Tooltip';
import { t } from '@/i18n';

export interface CanvasToolbarProps {
  zoom: number;
  onCenter: () => void;
  onFit: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onExpandLevel: (level: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  wideView: boolean;
  onToggleWideView: () => void;
  showWideViewToggle?: boolean;
}

const MAX_LEVEL = 5;

function ToolButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-muted transition-colors hover:bg-bg-hover hover:text-text"
      >
        <Icon name={icon} size={15} />
      </button>
    </Tooltip>
  );
}

/** Ferramentas flutuantes do canvas (topo) + controles de zoom (base). */
export function CanvasToolbar({
  zoom,
  onCenter,
  onFit,
  onExpandAll,
  onCollapseAll,
  onExpandLevel,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  wideView,
  onToggleWideView,
  showWideViewToggle = true,
}: CanvasToolbarProps) {
  const [levelMenu, setLevelMenu] = useState<{ rect: DOMRect; el: HTMLButtonElement } | null>(
    null,
  );
  const levelButtonRef = useRef<HTMLButtonElement>(null);

  const levelItems: MenuItem[] = Array.from({ length: MAX_LEVEL }, (_, index) => {
    const level = index + 1;
    return {
      id: `level-${level}`,
      label: t('canvas.nivelOpcao', { n: level }),
      icon: <Icon name="list-tree" size={14} />,
      onSelect: () => onExpandLevel(level),
    };
  });

  return (
    <>
      <div
        role="toolbar"
        aria-label={t('a11y.ferramentasCanvas')}
        className="absolute top-2 right-2 z-20 flex items-center gap-0.5 rounded-[var(--radius-lg)] border border-border bg-material-strong p-1 shadow-[var(--shadow)] backdrop-blur-xl"
      >
        <ToolButton icon="target" label={t('canvas.centralizar')} onClick={onCenter} />
        <ToolButton icon="scan" label={t('canvas.ajustarTela')} onClick={onFit} />
        <ToolButton
          icon="chevrons-up-down"
          label={t('canvas.expandirTudo')}
          onClick={onExpandAll}
        />
        <ToolButton icon="minimize" label={t('canvas.recolherTudo')} onClick={onCollapseAll} />
        <Tooltip label={t('canvas.expandirNivel')}>
          <button
            ref={levelButtonRef}
            type="button"
            aria-label={t('canvas.expandirNivel')}
            aria-haspopup="menu"
            onClick={() => {
              const el = levelButtonRef.current;
              if (el) setLevelMenu({ rect: el.getBoundingClientRect(), el });
            }}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-muted transition-colors hover:bg-bg-hover hover:text-text"
          >
            <Icon name="layers" size={15} />
          </button>
        </Tooltip>
        {showWideViewToggle ? (
          <ToolButton
            icon={wideView ? 'minimize' : 'maximize'}
            label={wideView ? t('canvas.restaurarVisao') : t('canvas.ampliarVisao')}
            onClick={onToggleWideView}
          />
        ) : null}
      </div>

      <div
        role="group"
        aria-label={t('a11y.controleZoom')}
        className="absolute bottom-3 left-3 z-20 flex items-center gap-0.5 rounded-[var(--radius-lg)] border border-border bg-material-strong p-1 shadow-[var(--shadow)] backdrop-blur-xl"
      >
        <ToolButton icon="zoom-out" label={t('canvas.zoomAfastar')} onClick={onZoomOut} />
        <button
          type="button"
          onClick={onZoomReset}
          aria-label={t('canvas.zoomReset')}
          title={t('canvas.zoomReset')}
          className="h-8 min-w-12 rounded-[var(--radius-sm)] px-1 text-xs tabular-nums text-muted transition-colors hover:bg-bg-hover hover:text-text"
        >
          {t('canvas.zoomPorcentagem', { n: Math.round(zoom * 100) })}
        </button>
        <ToolButton icon="zoom-in" label={t('canvas.zoomAproximar')} onClick={onZoomIn} />
      </div>

      {levelMenu ? (
        <Menu
          items={levelItems}
          label={t('canvas.expandirNivel')}
          anchor={levelMenu.rect}
          onClose={() => setLevelMenu(null)}
          returnFocusTo={levelMenu.el}
        />
      ) : null}
    </>
  );
}
