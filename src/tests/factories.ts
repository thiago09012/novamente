import { generateNKeysBetween } from 'fractional-indexing';
import { ulid } from 'ulid';

import { EMPTY_DOC } from '@/domain/content';
import type { ID, Note, NoteContentNode } from '@/domain/types';

export interface NoteSeed {
  id?: ID;
  parentId?: ID | null;
  orderKey?: string;
  title?: string;
  content?: NoteContentNode;
  contentText?: string;
  icon?: string;
  color?: string | null;
  tags?: string[];
  deletedAt?: number | null;
  deletedRootId?: ID | null;
  now?: number;
  createdAt?: number;
  updatedAt?: number;
}

export function makeNote(seed: NoteSeed = {}): Note {
  const now = seed.now ?? 1_700_000_000_000;
  return {
    id: seed.id ?? ulid(),
    parentId: seed.parentId ?? null,
    orderKey: seed.orderKey ?? 'a0',
    title: seed.title ?? 'Nota',
    content: seed.content ?? EMPTY_DOC,
    contentText: seed.contentText ?? '',
    icon: seed.icon ?? 'circle',
    color: seed.color ?? null,
    tags: seed.tags ?? [],
    createdAt: seed.createdAt ?? now,
    updatedAt: seed.updatedAt ?? now,
    deletedAt: seed.deletedAt ?? null,
    deletedRootId: seed.deletedRootId ?? null,
  };
}

/** Monta uma árvore de teste a partir de uma descrição compacta. */
export function makeTree(
  spec: Record<
    string,
    {
      parent?: string | null;
      title?: string;
      deletedAt?: number | null;
      deletedRootId?: ID | null;
    }
  >,
): Note[] {
  const ids = Object.keys(spec);
  const keys = generateNKeysBetween(null, null, ids.length);
  return ids.map((key, i) => {
    const entry = spec[key];
    const parentId =
      entry.parent === undefined ? null : entry.parent === null ? null : entry.parent;
    return makeNote({
      id: key,
      parentId,
      orderKey: keys[i],
      title: entry.title ?? key,
      deletedAt: entry.deletedAt ?? null,
      deletedRootId: entry.deletedRootId ?? null,
    });
  });
}
