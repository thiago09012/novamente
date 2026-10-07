import { memo, useMemo } from 'react';

import { useSettingsStore } from '@/store/settingsStore';
import { selectViewById, useViewStore } from '@/store/viewStore';
import { useLayoutStore } from './layoutStore';
import { useSidebarAnchorStore } from '@/features/sidebar/sidebarAnchorStore';

const LINE_MARGIN = 240;

/**
 * Linhas Bézier que saem da borda direita da sidebar (na altura do item
 * ativo) até a borda esquerda de cada filho direto da categoria (§5.2).
 * Overlay `fixed` em todo o app; recalcua em scroll/resize/pan/zoom/layout.
 */
export const SidebarLines = memo(function SidebarLines() {
  const anchor = useSidebarAnchorStore((state) => state.anchor);
  const boxes = useLayoutStore((state) => state.boxes);
  const rootChildren = useLayoutStore((state) => state.rootChildren);
  const viewport = useLayoutStore((state) => state.viewport);
  const rootId = useSettingsStore((state) => state.settings.lastCategoryId);
  const view = useViewStore((state) => selectViewById(state, rootId));

  const paths = useMemo(() => {
    if (!anchor || !viewport || !rootId || rootChildren.length === 0) return [];

    const result: string[] = [];
    const top = -LINE_MARGIN;
    const bottom = viewport.height + LINE_MARGIN;
    const right = viewport.width + LINE_MARGIN;

    for (const id of rootChildren) {
      const box = boxes.get(id);
      if (!box) continue;
      const x2 = viewport.left + view.panX + box.x * view.zoom;
      const y2 = viewport.top + view.panY + (box.y + box.height / 2) * view.zoom;
      // Filhos fora da área visível não geram linha (culling das linhas).
      if (y2 < viewport.top + top || y2 > viewport.top + bottom) continue;
      if (x2 > viewport.left + right) continue;
      const x1 = anchor.x;
      const y1 = anchor.y;
      const midX = (x1 + x2) / 2;
      result.push(`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`);
    }
    return result;
  }, [anchor, boxes, rootChildren, viewport, rootId, view.panX, view.panY, view.zoom]);

  if (paths.length === 0) return null;

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-30"
      width="100%"
      height="100%"
      data-testid="sidebar-lines"
    >
      {paths.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke="var(--border-strong)"
          strokeWidth={1.5}
          strokeOpacity={anchor?.inView === false ? 0.3 : 0.6}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
});
