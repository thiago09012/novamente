import { memo } from 'react';

import type { ID } from '@/domain/types';
import type { LayoutEdge } from './layout';

export interface CanvasEdgesProps {
  edges: readonly LayoutEdge[];
  linkEdges?: readonly LayoutEdge[];
  /** Ids dos nós cujo caminho raiz→atual deve ser realçado. */
  highlight: ReadonlySet<ID>;
  /** Nó selecionado: arestas que o tocam disparam a "sinapse" (glow + fluxo). */
  selectedId?: ID | null;
  width: number;
  height: number;
}

/**
 * Arestas do grafo em um único `<svg>` — o elemento-assinatura da identidade.
 * Hierarquia: 1px sólida sutil. Wikilinks: 1.2px tracejados azuis. Aresta que
 * toca o nó selecionado: 1.8px com glow e animação de fluxo (desligada com
 * movimento reduzido via `.edge-flow`).
 */
export const CanvasEdges = memo(function CanvasEdges({
  edges,
  linkEdges = [],
  highlight,
  selectedId = null,
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
            stroke={active ? 'var(--accent)' : 'var(--edge-tree)'}
            strokeWidth={active ? 1.8 : 1}
            strokeLinecap="round"
          />
        );
      })}
      {linkEdges.map((edge) => {
        const active =
          selectedId !== null &&
          (edge.childId === selectedId || edge.fromId === selectedId);
        const midX = (edge.x1 + edge.x2) / 2;
        return (
          <path
            key={`link-${edge.id}`}
            data-testid="wikilink-edge"
            d={`M ${edge.x1} ${edge.y1} C ${midX} ${edge.y1}, ${midX} ${edge.y2}, ${edge.x2} ${edge.y2}`}
            fill="none"
            stroke={active ? 'var(--accent)' : 'var(--edge-link)'}
            strokeWidth={active ? 1.8 : 1.2}
            strokeDasharray={active ? '4 5' : '3 5'}
            strokeLinecap="round"
            className={active ? 'edge-flow' : undefined}
            style={
              active ? { filter: 'drop-shadow(0 0 8px var(--glow))' } : undefined
            }
          />
        );
      })}
    </svg>
  );
});
