import { remapDocLinks } from './content';
import { keyAtEnd } from './order';
import type { ID, Note } from './types';
import { getDescendants, isAlive, type NoteIndex } from './tree';

export interface DuplicateOptions {
  /** Duplicar também os descendentes (padrão: true). */
  withChildren?: boolean;
  /** Prefixo do título novo (padrão: "Cópia de "). */
  titlePrefix?: string;
}

export interface DuplicateContext {
  genId: () => ID;
  now: number;
}

export interface DuplicatePlan {
  notes: Note[];
  /** Id da cópia raiz. */
  newRootId: ID;
}

/**
 * Plano de duplicação (seção 8.6):
 * - novos IDs para tudo;
 * - título "Cópia de …" na raiz;
 * - links internos ao subtree são reapontados para as cópias;
 * - links externos permanecem.
 */
export function planDuplicate(
  index: NoteIndex,
  rootId: ID,
  context: DuplicateContext,
  options: DuplicateOptions = {},
): DuplicatePlan | null {
  const root = index.get(rootId);
  if (!root || !isAlive(root)) return null;

  const withChildren = options.withChildren ?? true;
  const prefix = options.titlePrefix ?? 'Cópia de ';
  const source = withChildren ? [root, ...getDescendants(index, rootId).filter(isAlive)] : [root];

  const idMap = new Map<ID, ID>();
  for (const note of source) idMap.set(note.id, context.genId());

  const remapTargets = new Map<ID, { id: ID; title: string }>();
  for (const note of source) {
    const newId = idMap.get(note.id) as ID;
    remapTargets.set(note.id, {
      id: newId,
      title: note.id === rootId ? `${prefix}${note.title}` : note.title,
    });
  }

  const siblings = childrenOfSorted(index, root.parentId);
  const siblingsWithoutRoot = siblings.filter((note) => note.id !== rootId);
  const rootKey = keyAtEnd(siblingsWithoutRoot);

  const notes: Note[] = source.map((note) => {
    const newId = idMap.get(note.id) as ID;
    const parentId =
      note.id === rootId ? root.parentId : (idMap.get(note.parentId as ID) ?? note.parentId);
    const title = note.id === rootId ? `${prefix}${note.title}` : note.title;
    return {
      ...note,
      id: newId,
      parentId,
      orderKey: note.id === rootId ? rootKey : note.orderKey,
      title,
      content: remapDocLinks(note.content, remapTargets),
      createdAt: context.now,
      updatedAt: context.now,
      deletedAt: null,
      deletedRootId: null,
    };
  });

  return { notes, newRootId: idMap.get(rootId) as ID };
}

function childrenOfSorted(index: NoteIndex, parentId: ID | null): Note[] {
  return [...index.values()]
    .filter((note) => note.parentId === parentId && isAlive(note))
    .sort((a, b) => (a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0));
}
