import { memo } from 'react';

import type { ID } from '@/domain/types';
import type { LayoutEdge } from './layout';

export interface CanvasEdgesProps {
  edges: readonly LayoutEdge[];
  linkEdges?: readonly LayoutEdge[];
  /** Ids dos nós cujo caminho raiz→atual deve ser realçado. */
  highlight: ReadonlySet<ID>;
  width: number;
  height: number;
}

/**
 * Arestas hierárquicas em um único `<svg>` (Bézier pai→filho).
 * O caminho da raiz até o nó atual ganha destaque (§5.3 Arestas).
 */
export const CanvasEdges = memo(function CanvasEdges({
  edges,
  linkEdges = [],
  highlight,
  width,
  height,
}: CanvasEdgesProps) {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute top-0 left-0 overflow-visible"
      width={width}
      height={height}
    >
      {edges.map((edge) => {
        const active = highlight.has(edge.childId);
        const midX = (edge.x1 + edge.x2) / 2;
        return (
          <path
            key={edge.id}
            d={`M ${edge.x1} ${edge.y1} C ${midX} ${edge.y1}, ${midX} ${edge.y2}, ${edge.x2} ${edge.y2}`}
            fill="none"
            stroke={active ? 'var(--accent)' : 'var(--border-strong)'}
            strokeWidth={active ? 2.5 : 1.5}
            strokeOpacity={active ? 1 : 0.55}
            strokeLinecap="round"
          />
        );
      })}
      {linkEdges.map((edge) => {
        const midX = (edge.x1 + edge.x2) / 2;
        return (
          <path
            key={`link-${edge.id}`}
            data-testid="wikilink-edge"
            d={`M ${edge.x1} ${edge.y1} C ${midX} ${edge.y1}, ${midX} ${edge.y2}, ${edge.x2} ${edge.y2}`}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            strokeOpacity={0.7}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
});
