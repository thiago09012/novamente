import { generateNKeysBetween } from 'fractional-indexing';
import { describe, expect, it } from 'vitest';

import { EMPTY_DOC } from '@/domain/content';
import type { ID, Note } from '@/domain/types';
import { buildLayout } from './layout';

function makeWideTree() {
  const now = 1_700_000_000_000;
  const rootId = 'category';
  const notes: Note[] = [];
  const childIds: Record<string, ID[]> = { [rootId]: [] };
  let parents = [rootId];

  for (let depth = 0; depth < 4; depth += 1) {
    const nextParents: ID[] = [];
    for (const parentId of parents) {
      const ids = Array.from({ length: 20 }, (_, index) => `${parentId}-${depth}-${index}`);
      childIds[parentId] = ids;
      const keys = generateNKeysBetween(null, null, ids.length);
      ids.forEach((id, index) => {
        notes.push({
          id,
          parentId,
          orderKey: keys[index],
          title: `Nota nível ${depth + 1} item ${index + 1}`,
          content: EMPTY_DOC,
          contentText: '',
          icon: 'circle',
          color: null,
          tags: [],
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          deletedRootId: null,
        });
        if (index === 0) nextParents.push(id);
      });
    }
    parents = nextParents;
  }

  return { rootId, notes, childIds };
}

describe('buildLayout', () => {
  it('mantém nós sem sobreposição numa árvore larga de quatro níveis', () => {
    const { rootId, notes, childIds } = makeWideTree();
    const byId = Object.fromEntries(notes.map((note) => [note.id, note]));
    const expanded = Object.fromEntries(notes.map((note) => [note.id, true]));
    const layout = buildLayout({
      rootId,
      byId,
      childIds,
      expanded,
      nodeHeight: 44,
      measure: (text) => text.length * 7,
    });

    expect(layout.nodes).toHaveLength(80);
    const byColumn = new Map<number, typeof layout.nodes>();
    for (const node of layout.nodes) {
      const column = byColumn.get(node.depth) ?? [];
      column.push(node);
      byColumn.set(node.depth, column);
    }
    for (const nodes of byColumn.values()) {
      const sorted = [...nodes].sort((a, b) => a.y - b.y);
      for (let index = 1; index < sorted.length; index += 1) {
        expect(sorted[index].y).toBeGreaterThanOrEqual(sorted[index - 1].y + sorted[index - 1].height);
      }
    }
  });

  it('posiciona em uma passagem um nível largo recolhido e preserva os badges', () => {
    const notes: Note[] = Array.from({ length: 3 }, (_, index) => ({
      id: `child-${index}`,
      parentId: 'category',
      orderKey: `key-${index}`,
      title: `Filho ${index}`,
      content: EMPTY_DOC,
      contentText: '',
      icon: 'circle',
      color: null,
      tags: [],
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
      deletedRootId: null,
    }));
    const byId = Object.fromEntries(notes.map((note) => [note.id, note]));
    const layout = buildLayout({
      rootId: 'category',
      byId,
      childIds: { category: notes.map((note) => note.id), 'child-1': ['grandchild'] },
      expanded: {},
      nodeHeight: 44,
      measure: () => 20,
    });

    expect(layout.nodes.map((node) => node.y)).toEqual([0, 56, 112]);
    expect(layout.nodes.map((node) => node.posinset)).toEqual([1, 2, 3]);
    expect(layout.nodes[1]).toMatchObject({ hasChildren: true, childCount: 1, setsize: 3 });
    expect(layout.edges).toEqual([]);
  });
});
