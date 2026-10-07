import { hierarchy, tree, type HierarchyNode } from 'd3-hierarchy';

import { NODE_LABEL_MAX } from '@/domain/constants';
import type { ID, Note } from '@/domain/types';

/**
 * Layout puro do canvas (Fase 2).
 * - árvore "tidy" via d3-hierarchy (nodeSize) sobre os NÓS VISÍVEIS;
 * - coluna horizontal dinâmica por profundidade (largura medida + folga);
 * - sem dependência de React/Dexie — medidor de texto é injetado (testável).
 */

export const COLUMN_GAP_PX = 64;
export const ROW_GAP_PX = 12;
export const MIN_NODE_WIDTH_PX = 160;
/**
 * Largura do "chrome" do nó (padding, botão de expandir, ícone, indicador
 * de conteúdo, badge de filhos). Mede apenas o rótulo.
 */
export const NODE_CHROME_PX = 116;

export type MeasureText = (text: string) => number;

export interface LayoutNode {
  id: ID;
  /** Categoria (raiz da árvore) ou id do nó pai — nunca null nos nós desenhados. */
  parentId: ID;
  /** Profundidade visível: filhos diretos da categoria = 0. */
  depth: number;
  /** Canto superior esquerdo no mundo. */
  x: number;
  y: number;
  width: number;
  height: number;
  hasChildren: boolean;
  /** Nº de filhos diretos vivos (badge quando recolhido). */
  childCount: number;
  expanded: boolean;
  /** aria-posinset/aria-setsize entre os irmãos visíveis. */
  posinset: number;
  setsize: number;
}

export interface LayoutEdge {
  id: ID;
  parentId: ID;
  childId: ID;
  /** Origem real do link (só em arestas de wikilink; difere de parentId). */
  fromId?: ID;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface TreeLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  /** Menor caixa que contém todos os nós (mundo). */
  width: number;
  height: number;
}

export interface LayoutInput {
  /** Categoria ativa (raiz da árvore; não desenhada como nó). */
  rootId: ID;
  byId: Record<ID, Note>;
  /** Mapa derivado parentId → filhos vivos ordenados (notesStore.childIds). */
  childIds: Record<string, ID[]>;
  expanded: Record<ID, boolean>;
  nodeHeight: number;
  measure: MeasureText;
  /** Estimativa conservadora para um nível extremamente largo. */
  approximateMeasure?: MeasureText;
  /**
   * Só invalida o memo do layout (a fonte muda as larguras medidas).
   * Ignorado pelo cálculo em si.
   */
  fontTick?: number;
}

export function displayLabel(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length === 0) return 'Sem título';
  return trimmed;
}

export function truncateLabel(label: string): string {
  if (label.length <= NODE_LABEL_MAX) return label;
  return `${label.slice(0, NODE_LABEL_MAX - 1)}…`;
}

function parentKey(parentId: ID | null): string {
  return parentId ?? '__root__';
}

function childrenFor(input: LayoutInput, id: ID): ID[] {
  return input.childIds[parentKey(id)] ?? [];
}

function hasLiveChildren(input: LayoutInput, id: ID): boolean {
  return childrenFor(input, id).length > 0;
}

/** Calcula o layout completo dos nós visíveis. */
export function buildLayout(input: LayoutInput): TreeLayout {
  const { rootId, byId, expanded, nodeHeight, measure } = input;

  const roots = childrenFor(input, rootId);
  if (roots.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  // Um nível extremamente largo recolhido pode ser calculado direto das
  // listas ordenadas, sem alocar Row/HierarchyNode para cada nota.
  if (roots.length >= 1000 && roots.every((id) => !expanded[id])) {
    const measureWidth = input.approximateMeasure ?? measure;
    let width = MIN_NODE_WIDTH_PX;
    const nodes = roots.map((id, index): LayoutNode => {
      const note = byId[id];
      const label = truncateLabel(displayLabel(note?.title ?? ''));
      const childCount = childrenFor(input, id).length;
      const nodeWidth = Math.max(MIN_NODE_WIDTH_PX, NODE_CHROME_PX + measureWidth(label));
      width = Math.max(width, nodeWidth);
      return {
        id,
        parentId: rootId,
        depth: 0,
        x: 0,
        y: index * (nodeHeight + ROW_GAP_PX),
        width: nodeWidth,
        height: nodeHeight,
        hasChildren: childCount > 0,
        childCount,
        expanded: false,
        posinset: index + 1,
        setsize: roots.length,
      };
    });
    return {
      nodes,
      edges: [],
      width,
      height: roots.length * (nodeHeight + ROW_GAP_PX) - ROW_GAP_PX,
    };
  }

  // 1. Monta as linhas visíveis (só desce em nós expandidos).
  type Row = { id: ID; children: Row[]; width: number };
  const widthMeasure =
    roots.length >= 1000 && input.approximateMeasure ? input.approximateMeasure : measure;
  const buildRow = (id: ID): Row => {
    const note = byId[id];
    const label = truncateLabel(displayLabel(note?.title ?? ''));
    const width = Math.max(MIN_NODE_WIDTH_PX, NODE_CHROME_PX + widthMeasure(label));
    const row: Row = { id, children: [], width };
    if (expanded[id]) {
      row.children = childrenFor(input, id).map(buildRow);
    }
    return row;
  };
  const rows = roots.map(buildRow);

  // 2. Separação tidy: nodeSize([passo vertical, 1]) e reatribui x por coluna.
  const rowPitch = nodeHeight + ROW_GAP_PX;
  // Árvore larga recolhida: folhas do nível visível têm espaçamento uniforme,
  // então o resultado tidy pode ser produzido em uma passagem sem criar 5 mil
  // HierarchyNodes nem percorrer o mesmo conjunto nas fases do algoritmo d3.
  if (rows.every((row) => row.children.length === 0)) {
    const nodes = rows.map((row, index): LayoutNode => {
      const childCount = childrenFor(input, row.id).length;
      return {
        id: row.id,
        parentId: rootId,
        depth: 0,
        x: 0,
        y: index * rowPitch,
        width: row.width,
        height: nodeHeight,
        hasChildren: childCount > 0,
        childCount,
        expanded: expanded[row.id] === true,
        posinset: index + 1,
        setsize: rows.length,
      };
    });
    const width = rows.reduce((max, row) => Math.max(max, row.width), 0);
    return { nodes, edges: [], width, height: rows.length * rowPitch - ROW_GAP_PX };
  }

  const root = hierarchy<Row>({ id: rootId, children: rows, width: 0 }, (d) => d.children);
  tree<Row>().nodeSize([rowPitch, 1])(root);

  // 3. Largura de coluna por profundidade = maior nó + folga.
  const columnWidths: number[] = [];
  root.each((d) => {
    if (d.depth === 0) return;
    const index = d.depth - 1;
    const width = d.data.width + COLUMN_GAP_PX;
    columnWidths[index] = Math.max(columnWidths[index] ?? 0, width);
  });
  // Última coluna não precisa da folga à direita.
  if (columnWidths.length > 0) {
    columnWidths[columnWidths.length - 1] -= COLUMN_GAP_PX;
  }

  const columnX: number[] = [];
  let acc = 0;
  for (let i = 0; i < columnWidths.length; i += 1) {
    columnX[i] = acc;
    acc += columnWidths[i];
  }
  const totalWidth = acc;

  // 4. Posições finais (normaliza y para começar em 0).
  const raw: Array<{ d: HierarchyNode<Row>; yCenter: number }> = [];
  let minCenter = Infinity;
  let maxCenter = -Infinity;
  root.each((d) => {
    if (d.depth === 0) return;
    const yCenter = d.x ?? 0;
    raw.push({ d, yCenter });
    if (yCenter < minCenter) minCenter = yCenter;
    if (yCenter > maxCenter) maxCenter = yCenter;
  });

  const nodes: LayoutNode[] = [];
  const nodeById = new Map<ID, LayoutNode>();
  const siblingsAt = new Map<string, number[]>();

  for (const { d, yCenter } of raw) {
    const row = d.data;
    const childCount = hasLiveChildren(input, row.id)
      ? childrenFor(input, row.id).length
      : 0;
    const node: LayoutNode = {
      id: row.id,
      parentId: d.parent && d.parent.depth > 0 ? d.parent.data.id : rootId,
      depth: d.depth - 1,
      x: columnX[d.depth - 1] ?? 0,
      y: yCenter - minCenter - nodeHeight / 2,
      width: row.width,
      height: nodeHeight,
      hasChildren: hasLiveChildren(input, row.id),
      childCount,
      expanded: expanded[row.id] === true,
      posinset: 0,
      setsize: 0,
    };
    nodes.push(node);
    nodeById.set(row.id, node);
    const siblings = siblingsAt.get(node.parentId) ?? [];
    siblings.push(nodes.length - 1);
    siblingsAt.set(node.parentId, siblings);
  }

  for (const indices of siblingsAt.values()) {
    indices.forEach((nodeIndex, i) => {
      const node = nodes[nodeIndex];
      node.posinset = i + 1;
      node.setsize = indices.length;
    });
  }

  const edges: LayoutEdge[] = [];
  for (const node of nodes) {
    if (node.parentId === rootId) continue;
    const parent = nodeById.get(node.parentId);
    if (!parent) continue;
    edges.push({
      id: `${node.parentId}->${node.id}`,
      parentId: parent.id,
      childId: node.id,
      x1: parent.x + parent.width,
      y1: parent.y + parent.height / 2,
      x2: node.x,
      y2: node.y + node.height / 2,
    });
  }

  const height = maxCenter - minCenter + nodeHeight;
  return { nodes, edges, width: totalWidth, height };
}

/** Caminho (ids) da categoria até a nó, inclusive — para realçar arestas. */
export function pathToNode(nodes: readonly LayoutNode[], id: ID): Set<ID> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const path = new Set<ID>();
  let current = byId.get(id);
  const guard = new Set<ID>();
  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    path.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/** Retângulo em coordenadas de mundo usado pelo culling. */
export interface WorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function intersects(a: WorldRect, b: WorldRect): boolean {
  return (
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
  );
}

export function nodeRect(node: LayoutNode): WorldRect {
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}
