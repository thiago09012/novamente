import type { ID } from './types';
import { isAlive, isCategory, type NoteIndex } from './tree';

export interface RestoreEntry {
  id: ID;
  parentId: ID | null;
}

export interface RestorePlan {
  entries: RestoreEntry[];
  /** Notas restauradas que não acharam pai vivo e caíram na recuperação. */
  recovered: ID[];
}

/**
 * Restaura um grupo de exclusão (subtree).
 * Regras (seção 5.6):
 * - volta ao pai original se o pai estiver vivo (ou for restaurado junto);
 * - senão, vai para a raiz da categoria viva mais próxima;
 * - se nenhuma categoria estiver viva, vai para a categoria de recuperação
 *   (ou vira categoria, quando não há recuperação).
 */
export function planRestore(
  index: NoteIndex,
  groupIds: readonly ID[],
  recoveryCategoryId: ID | null = null,
): RestorePlan {
  const group = new Set(groupIds);
  const entries: RestoreEntry[] = [];
  const recovered: ID[] = [];

  const effectivelyAlive = (id: ID): boolean => {
    if (group.has(id)) return true;
    const note = index.get(id);
    return note !== undefined && isAlive(note);
  };

  for (const id of group) {
    const note = index.get(id);
    if (!note || !note.deletedAt) continue;

    if (note.parentId === null) {
      entries.push({ id, parentId: null });
      continue;
    }

    if (effectivelyAlive(note.parentId)) {
      entries.push({ id, parentId: note.parentId });
      continue;
    }

    // Pai morto: sobe até a raiz da categoria viva mais próxima.
    let categoryRoot: ID | null = null;
    let cursor: ID | null = note.parentId;
    const guard = new Set<ID>();
    while (cursor && !guard.has(cursor)) {
      guard.add(cursor);
      const ancestor = index.get(cursor);
      if (!ancestor) break;
      if (effectivelyAlive(ancestor.id) && isCategory(ancestor)) {
        categoryRoot = ancestor.id;
        break;
      }
      cursor = ancestor.parentId;
    }

    if (categoryRoot === null && recoveryCategoryId && !group.has(recoveryCategoryId)) {
      categoryRoot = recoveryCategoryId;
      recovered.push(id);
    }
    entries.push({ id, parentId: categoryRoot });
  }

  return { entries, recovered };
}
