import { MAX_DEPTH } from './constants';
import type { ID, Note } from './types';

/** Mapa de consulta por id. Construído uma vez por mutação/carregamento. */
export type NoteIndex = ReadonlyMap<ID, Note>;

export interface ChildrenOptions {
  /** Inclui notas na lixeira (padrão: false). */
  includeDeleted?: boolean;
}

export function buildIndex(notes: readonly Note[]): NoteIndex {
  return new Map(notes.map((note) => [note.id, note]));
}

export function isCategory(note: Note): boolean {
  return note.parentId === null;
}

export function isAlive(note: Note): boolean {
  return note.deletedAt === null;
}

function byOrderKey(a: Note, b: Note): number {
  return a.orderKey < b.orderKey ? -1 : a.orderKey > b.orderKey ? 1 : 0;
}

export function childrenOf(
  index: NoteIndex,
  parentId: ID | null,
  options: ChildrenOptions = {},
): Note[] {
  const result: Note[] = [];
  for (const note of index.values()) {
    if (note.parentId !== parentId) continue;
    if (!options.includeDeleted && !isAlive(note)) continue;
    result.push(note);
  }
  return result.sort(byOrderKey);
}

export function liveNotes(index: NoteIndex): Note[] {
  return [...index.values()].filter(isAlive);
}

export function categories(index: NoteIndex, options: ChildrenOptions = {}): Note[] {
  return childrenOf(index, null, options);
}

export function getDescendants(index: NoteIndex, id: ID, options: ChildrenOptions = {}): Note[] {
  const result: Note[] = [];
  const childrenByParent = new Map<ID | null, Note[]>();
  for (const note of index.values()) {
    if (!options.includeDeleted && !isAlive(note)) continue;
    const siblings = childrenByParent.get(note.parentId) ?? [];
    siblings.push(note);
    childrenByParent.set(note.parentId, siblings);
  }
  for (const siblings of childrenByParent.values()) siblings.sort(byOrderKey);

  const roots = childrenByParent.get(id) ?? [];
  const stack = [...roots].reverse();
  const visited = new Set<ID>([id]);
  while (stack.length > 0) {
    const note = stack.pop() as Note;
    if (visited.has(note.id)) continue;
    visited.add(note.id);
    result.push(note);
    const children = childrenByParent.get(note.id) ?? [];
    for (let childIndex = children.length - 1; childIndex >= 0; childIndex -= 1) {
      stack.push(children[childIndex]);
    }
  }
  return result;
}

/** Caminho do nó até a raiz, inclusive o próprio nó (raiz primeiro). */
export function getPath(index: NoteIndex, id: ID): Note[] {
  const path: Note[] = [];
  let current = index.get(id);
  const guard = new Set<ID>();
  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    path.unshift(current);
    current = current.parentId ? index.get(current.parentId) : undefined;
  }
  return path;
}

/** Profundidade: categoria = 0, primeiro nível sob a categoria = 1. */
export function depthOf(index: NoteIndex, id: ID): number {
  return Math.max(0, getPath(index, id).length - 1);
}

export function isDescendantOf(index: NoteIndex, candidateId: ID, ancestorId: ID): boolean {
  let current = index.get(candidateId);
  const guard = new Set<ID>();
  while (current && current.parentId && !guard.has(current.id)) {
    guard.add(current.id);
    if (current.parentId === ancestorId) return true;
    current = index.get(current.parentId);
  }
  return false;
}

/**
 * Mover `noteId` para baixo de `newParentId` criaria ciclo?
 * Regra de domínio (não só de UI): mover para si mesmo ou para descendente é proibido.
 */
export function wouldCreateCycle(index: NoteIndex, noteId: ID, newParentId: ID | null): boolean {
  if (newParentId === null) return false;
  if (noteId === newParentId) return true;
  return isDescendantOf(index, newParentId, noteId);
}

/** Razão pela qual um movimento é inválido, ou null se permitido. */
export function moveBlockReason(
  index: NoteIndex,
  noteId: ID,
  newParentId: ID | null,
): 'self' | 'descendant' | 'depth' | null {
  if (newParentId !== null && noteId === newParentId) return 'self';
  if (newParentId !== null && isDescendantOf(index, newParentId, noteId)) return 'descendant';
  const parentId = newParentId === null ? 0 : depthOf(index, newParentId);
  const localDepth = depthOf(index, noteId);
  const subtree = getDescendants(index, noteId);
  const deepest = subtree.reduce((max, note) => Math.max(max, depthOf(index, note.id)), localDepth);
  const relativeMax = deepest - localDepth;
  if (parentId + 1 + relativeMax > MAX_DEPTH) return 'depth';
  return null;
}

/** Contagem de descendentes vivos (dado derivado, nunca armazenado). */
export function countDescendants(index: NoteIndex, id: ID): number {
  const childrenByParent = new Map<ID | null, ID[]>();
  for (const note of index.values()) {
    if (!isAlive(note)) continue;
    const siblings = childrenByParent.get(note.parentId) ?? [];
    siblings.push(note.id);
    childrenByParent.set(note.parentId, siblings);
  }

  const stack = [...(childrenByParent.get(id) ?? [])];
  const visited = new Set<ID>([id]);
  let count = 0;
  while (stack.length > 0) {
    const currentId = stack.pop() as ID;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    count += 1;
    const children = childrenByParent.get(currentId);
    if (children) {
      for (const childId of children) stack.push(childId);
    }
  }
  return count;
}

/** Notas cujo parentId não existe (referências órfãs). */
export function findOrphans(notes: readonly Note[]): Note[] {
  const ids = new Set(notes.map((note) => note.id));
  return notes.filter((note) => note.parentId !== null && !ids.has(note.parentId));
}

/** true se, seguindo os pais a partir de `start`, volta-se a `start` (ciclo real). */
function isInCycle(parentOf: Map<ID, ID | null>, start: ID): boolean {
  let current: ID | null = parentOf.get(start) ?? null;
  const seen = new Set<ID>();
  while (current) {
    if (current === start) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    current = parentOf.get(current) ?? null;
  }
  return false;
}

/** Retorna ids que participam de algum ciclo pai/filho. */
export function detectCycles(notes: readonly Note[]): ID[] {
  const parentOf = new Map<ID, ID | null>(notes.map((note) => [note.id, note.parentId]));
  return [...parentOf.keys()].filter((id) => isInCycle(parentOf, id));
}

/**
 * Detecta e quebra ciclos (dados importados/corrompidos), promovendo a nota
 * culpada para categoria (parentId = null). Sempre termina: cada passo remove
 * ao menos um ciclo.
 */
export function breakCycles(notes: readonly Note[]): { notes: Note[]; broken: ID[] } {
  const parentOf = new Map<ID, ID | null>(notes.map((note) => [note.id, note.parentId]));
  const broken: ID[] = [];

  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...parentOf.keys()]) {
      if (parentOf.get(id) !== null && isInCycle(parentOf, id)) {
        parentOf.set(id, null);
        broken.push(id);
        changed = true;
      }
    }
  }

  const fixed = notes.map((note) => {
    const parentId = parentOf.get(note.id) ?? null;
    return parentId === note.parentId ? note : { ...note, parentId };
  });
  return { notes: fixed, broken };
}
