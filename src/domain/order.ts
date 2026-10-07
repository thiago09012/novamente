import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

import { MAX_ORDER_KEY_LENGTH } from './constants';
import type { ID, Note } from './types';

/** Chave fracionária entre dois vizinhos (null = início/fim). */
export function orderKeyBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after);
}

/** Chave para inserir na posição `index` de `siblings` já ordenados. */
export function keyForIndex(siblings: readonly Note[], index: number): string {
  const position = Math.max(0, Math.min(index, siblings.length));
  const before = position > 0 ? siblings[position - 1].orderKey : null;
  const after = position < siblings.length ? siblings[position].orderKey : null;
  return generateKeyBetween(before, after);
}

/** Chave da próxima posição (novo filho/irmão no fim). */
export function keyAtEnd(siblings: readonly Note[]): string {
  return keyForIndex(siblings, siblings.length);
}

/** Chaves longas demais exigem reindexação dos irmãos em transação. */
export function needsReindex(siblings: readonly Note[]): boolean {
  return siblings.some((note) => note.orderKey.length > MAX_ORDER_KEY_LENGTH);
}

/** Novas chaves equidistantes para um conjunto de irmãos. */
export function reindexKeys(count: number): string[] {
  return generateNKeysBetween(null, null, Math.max(count, 1));
}

export interface ReorderPlan {
  /** Somente as chaves que mudam. */
  keys: Map<ID, string>;
  /** true = todos os irmãos foram reindexados. */
  reindexed: boolean;
}

/**
 * Move `movingId` para `targetIndex` entre os irmãos
 * (`targetIndex` = posição final desejada, de 0 a n-1).
 * Se a chave resultante ficar longa demais, reindexa o conjunto inteiro.
 */
export function planReorder(
  siblings: readonly Note[],
  movingId: ID,
  targetIndex: number,
): ReorderPlan {
  const moving = siblings.find((note) => note.id === movingId);
  if (!moving) return { keys: new Map(), reindexed: false };

  const others = siblings.filter((note) => note.id !== movingId);
  const position = Math.max(0, Math.min(targetIndex, others.length));
  const key = keyForIndex(others, position);

  if (key.length <= MAX_ORDER_KEY_LENGTH && !needsReindex(siblings)) {
    return { keys: new Map([[movingId, key]]), reindexed: false };
  }

  const ordered = [...others.slice(0, position), moving, ...others.slice(position)];
  const fresh = reindexKeys(ordered.length);
  const keys = new Map<ID, string>();
  ordered.forEach((note, i) => keys.set(note.id, fresh[i]));
  return { keys, reindexed: true };
}
