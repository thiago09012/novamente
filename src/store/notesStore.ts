import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { ulid } from 'ulid';

import { runtime } from '@/app/runtime';
import { MAX_TITLE_LENGTH } from '@/domain/constants';
import { buildLinks } from '@/domain/links';
import { docToPlainText } from '@/domain/content';
import { keyAtEnd, keyForIndex, planReorder } from '@/domain/order';
import { planDuplicate } from '@/domain/duplicate';
import { planRestore } from '@/domain/restore';
import { normalizeTags } from '@/domain/tags';
import { EMPTY_DOC } from '@/domain/content';
import { buildIndex, getDescendants, isAlive, moveBlockReason, wouldCreateCycle } from '@/domain/tree';
import type { ID, Link, Note, NoteContentNode } from '@/domain/types';

export const CATEGORY_PARENT_KEY = '__root__';

export function parentKey(parentId: ID | null): string {
  return parentId ?? CATEGORY_PARENT_KEY;
}

export interface NotesSnapshot {
  byId: Record<ID, Note>;
  childIds: Record<string, ID[]>;
}

export interface NotesHistoryEntry {
  label: 'create' | 'rename' | 'move' | 'reorder' | 'delete' | 'restore' | 'style' | 'tags' | 'duplicate';
  before: Note[];
  after: Note[];
  linkOwners?: ID[];
  beforeLinks?: Link[];
  afterLinks?: Link[];
}

const HISTORY_LIMIT = 200;

interface CreateNoteInput {
  parentId: ID | null;
  title?: string;
  icon?: string;
}

interface NotesState extends NotesSnapshot {
  links: Link[];
  historyPast: NotesHistoryEntry[];
  historyFuture: NotesHistoryEntry[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: unknown;
  load: () => Promise<void>;
  applyRemoteChanges: (
    upsert: readonly Note[],
    remove: readonly ID[],
    replaceLinkOwners?: readonly ID[],
    links?: readonly Link[],
  ) => void;
  createCategory: (title?: string) => Promise<Note>;
  createNote: (input: CreateNoteInput) => Promise<Note>;
  renameNote: (id: ID, title: string) => Promise<void>;
  saveNoteContent: (id: ID, content: NoteContentNode, tags: string[]) => Promise<void>;
  setNoteIcon: (id: ID, icon: string) => Promise<void>;
  setNoteColor: (id: ID, color: string | null) => Promise<void>;
  updateNotesStyle: (
    ids: readonly ID[],
    patch: Partial<Pick<Note, 'icon' | 'color'>>,
  ) => Promise<number>;
  addTagsToNotes: (ids: readonly ID[], tags: readonly string[], stripAccents?: boolean) => Promise<number>;
  reorderNote: (id: ID, targetIndex: number) => Promise<void>;
  moveNote: (id: ID, newParentId: ID | null, targetIndex?: number) => Promise<void>;
  moveNotes: (ids: readonly ID[], newParentId: ID) => Promise<number>;
  duplicateNote: (id: ID, withChildren?: boolean) => Promise<ID | null>;
  softDelete: (ids: readonly ID[]) => Promise<ID[]>;
  restoreNotes: (groupRoots: readonly ID[]) => Promise<ID[]>;
  deleteForever: (groupRoots: readonly ID[]) => Promise<number>;
  undo: () => Promise<ID | null>;
  redo: () => Promise<ID | null>;
}

function sortChildren(byId: Record<ID, Note>, ids: ID[]): ID[] {
  return ids.sort((a, b) => {
    const ka = byId[a]?.orderKey ?? '';
    const kb = byId[b]?.orderKey ?? '';
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/** Recalcula o mapa derivado parentId → filhos ordenados (nunca persistido). */
export function reindexChildren(byId: Record<ID, Note>): Record<string, ID[]> {
  const childIds: Record<string, ID[]> = {};
  for (const note of Object.values(byId)) {
    if (!isAlive(note)) continue;
    const key = parentKey(note.parentId);
    (childIds[key] ??= []).push(note.id);
  }
  for (const key of Object.keys(childIds)) childIds[key] = sortChildren(byId, childIds[key]);
  return childIds;
}

function withNotes(
  snapshot: NotesSnapshot,
  updated: readonly Note[],
  removed: readonly ID[] = [],
): NotesSnapshot {
  const byId = { ...snapshot.byId };
  for (const id of removed) delete byId[id];
  for (const note of updated) byId[note.id] = note;
  return { byId, childIds: reindexChildren(byId) };
}

function snapshotOf(state: NotesSnapshot): NotesSnapshot {
  return { byId: state.byId, childIds: state.childIds };
}

export function selectNote(state: NotesSnapshot, id: ID | null): Note | null {
  if (!id) return null;
  return state.byId[id] ?? null;
}

export function selectChildren(state: NotesSnapshot, parentId: ID | null): Note[] {
  const ids = state.childIds[parentKey(parentId)] ?? [];
  const result: Note[] = [];
  for (const id of ids) {
    const note = state.byId[id];
    if (note) result.push(note);
  }
  return result;
}

/**
 * Raízes da lixeira (ids estáveis) — o agrupamento é derivado depois,
 * para que o useShallow compare primitivos e não loops de arrays.
 */
export function selectTrashRootIds(state: NotesSnapshot): ID[] {
  const ids: ID[] = [];
  for (const note of Object.values(state.byId)) {
    if (note.deletedAt && (note.deletedRootId === null || note.deletedRootId === note.id)) {
      ids.push(note.id);
    }
  }
  return ids.sort((a, b) => (state.byId[b]?.deletedAt ?? 0) - (state.byId[a]?.deletedAt ?? 0));
}

/** Notas de um grupo da lixeira (raiz + excluídas em cascata dele). */
export function collectTrashGroup(byId: Record<ID, Note>, rootId: ID): Note[] {
  const root = byId[rootId];
  if (!root || !root.deletedAt) return [];
  const group: Note[] = [root];
  for (const note of Object.values(byId)) {
    if (note.deletedRootId === rootId && note.id !== rootId) group.push(note);
  }
  return group;
}

export function useCategories(): Note[] {
  return useNotesStore(useShallow((state) => selectChildren(state, null)));
}

export function useNoteById(id: ID | null): Note | null {
  return useNotesStore(useShallow((state) => selectNote(state, id)));
}

export function useChildren(parentId: ID | null): Note[] {
  return useNotesStore(useShallow((state) => selectChildren(state, parentId)));
}

export function useTrashRootIds(): ID[] {
  return useNotesStore(useShallow(selectTrashRootIds));
}

/** Total de notas na lixeira (contador do rodapé). */
export function useTrashCount(): number {
  return useNotesStore((state) =>
    Object.values(state.byId).reduce((total, note) => total + (note.deletedAt ? 1 : 0), 0),
  );
}

function expandDeletionGroups(byId: Record<ID, Note>, roots: readonly ID[]): Set<ID> {
  const group = new Set<ID>();
  for (const root of roots) {
    if (byId[root]) group.add(root);
    for (const note of Object.values(byId)) {
      if (note.deletedRootId !== null && note.deletedRootId === root) group.add(note.id);
    }
  }
  return group;
}

export const useNotesStore = create<NotesState>((set, get) => ({
  byId: {},
  childIds: {},
  links: [],
  historyPast: [],
  historyFuture: [],
  status: 'idle',
  error: null,

  load: async () => {
    set({ status: 'loading', error: null });
    try {
      const [notes, links] = await Promise.all([
        runtime().repos.notes.getAll(),
        runtime().repos.links.getAll(),
      ]);
      const byId: Record<ID, Note> = {};
      for (const note of notes) byId[note.id] = note;
      set({ byId, childIds: reindexChildren(byId), links, status: 'ready' });
    } catch (error) {
      set({ status: 'error', error });
      throw error;
    }
  },

  applyRemoteChanges: (upsert, remove, replaceLinkOwners = [], links = []) => {
    const state = get();
    const accepted = upsert.filter((note) => {
      const local = state.byId[note.id];
      return !local || note.updatedAt >= local.updatedAt;
    });
    const removed = remove.filter((id) => state.byId[id] !== undefined);
    const owners = new Set(replaceLinkOwners);
    const nextLinks = owners.size > 0
      ? [
          ...state.links.filter((link) => !owners.has(link.fromId)),
          ...links.filter((link) => owners.has(link.fromId)),
        ]
      : state.links;
    if (accepted.length === 0 && removed.length === 0 && owners.size === 0) return;
    set({
      ...withNotes(snapshotOf(state), accepted, removed),
      links: nextLinks,
      historyPast: [],
      historyFuture: [],
    });
  },

  createCategory: async (title) => {
    return get().createNote({
      parentId: null,
      title: title ?? 'Nova categoria',
      icon: 'folder',
    });
  },

  createNote: async (input) => {
    const state = get();
    if (input.parentId && !state.byId[input.parentId]) {
      throw new Error('Pai inexistente.');
    }
    const siblings = selectChildren(state, input.parentId);
    const now = Date.now();
    const note: Note = {
      id: makeId(),
      parentId: input.parentId,
      orderKey: keyAtEnd(siblings),
      title: (input.title ?? '').slice(0, MAX_TITLE_LENGTH),
      content: EMPTY_DOC,
      contentText: '',
      icon: input.icon ?? (input.parentId === null ? 'folder' : 'circle'),
      color: null,
      tags: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deletedRootId: null,
    };
    set(withNotes(snapshotOf(state), [note]));
    const historyEntry = recordHistory(set, 'create', [], [note]);
    try {
      await runtime().repos.notes.put(note);
    } catch (error) {
      set(snapshotOf(state));
      discardHistory(set, historyEntry);
      throw error;
    }
    return note;
  },

  renameNote: async (id, title) => {
    const state = get();
    const note = state.byId[id];
    if (!note) return;
    const nextTitle = title.slice(0, MAX_TITLE_LENGTH);
    if (note.title === nextTitle) return;
    const updated: Note = {
      ...note,
      title: nextTitle,
      updatedAt: Date.now(),
    };
    set(withNotes(snapshotOf(state), [updated]));
    const historyEntry = recordHistory(set, 'rename', [note], [updated]);
    try {
      await runtime().repos.notes.put(updated);
    } catch (error) {
      set(snapshotOf(state));
      discardHistory(set, historyEntry);
      throw error;
    }
  },

  saveNoteContent: async (id, content, tags) => {
    const state = get();
    const note = state.byId[id];
    if (!note || !isAlive(note)) return;
    const updated: Note = {
      ...note,
      content,
      contentText: docToPlainText(content),
      tags,
      updatedAt: Date.now(),
    };
    const links = buildLinks(id, content, makeId);
    const historyEntry =
      note.tags.length !== tags.length || note.tags.some((tag, index) => tag !== tags[index])
        ? recordHistory(set, 'tags', [note], [updated])
        : null;
    set({
      ...withNotes(snapshotOf(state), [updated]),
      links: [...state.links.filter((link) => link.fromId !== id), ...links],
    });
    try {
      await runtime().repos.notes.saveContent(updated, links);
    } catch (error) {
      set({ ...snapshotOf(state), links: state.links });
      if (historyEntry) discardHistory(set, historyEntry);
      throw error;
    }
  },

  setNoteIcon: async (id, icon) => {
    await patchNote(set, get, id, { icon });
  },

  setNoteColor: async (id, color) => {
    await patchNote(set, get, id, { color });
  },

  updateNotesStyle: async (ids, patch) => {
    const state = get();
    const before: Note[] = [];
    const after: Note[] = [];
    const now = Date.now();
    for (const id of new Set(ids)) {
      const note = state.byId[id];
      if (!note || !isAlive(note)) continue;
      if (
        (patch.icon === undefined || patch.icon === note.icon) &&
        (patch.color === undefined || patch.color === note.color)
      ) {
        continue;
      }
      before.push(note);
      after.push({ ...note, ...patch, updatedAt: now });
    }
    if (after.length === 0) return 0;

    set(withNotes(snapshotOf(state), after));
    const historyEntry = recordHistory(set, 'style', before, after);
    try {
      await runtime().repos.notes.putMany(after);
    } catch (error) {
      set(snapshotOf(state));
      discardHistory(set, historyEntry);
      throw error;
    }
    return after.length;
  },

  addTagsToNotes: async (ids, tags, stripAccents = false) => {
    const state = get();
    const additions = normalizeTags(tags, { stripAccents });
    if (additions.length === 0) return 0;
    const before: Note[] = [];
    const after: Note[] = [];
    for (const id of new Set(ids)) {
      const note = state.byId[id];
      if (!note || !isAlive(note)) continue;
      const nextTags = normalizeTags([...note.tags, ...additions], { stripAccents });
      if (nextTags.length === note.tags.length && nextTags.every((tag, index) => tag === note.tags[index])) continue;
      before.push(note);
      after.push({ ...note, tags: nextTags, updatedAt: Date.now() });
    }
    if (after.length === 0) return 0;
    set(withNotes(snapshotOf(state), after));
    const historyEntry = recordHistory(set, 'tags', before, after);
    try {
      await runtime().repos.notes.putMany(after);
    } catch (error) {
      set(snapshotOf(state));
      discardHistory(set, historyEntry);
      throw error;
    }
    return after.length;
  },

  reorderNote: async (id, targetIndex) => {
    const state = get();
    const note = state.byId[id];
    if (!note) return;
    const siblings = selectChildren(state, note.parentId);
    const plan = planReorder(siblings, id, targetIndex);
    if (plan.keys.size === 0) return;

    const now = Date.now();
    const updated = siblings
      .filter((sibling) => plan.keys.has(sibling.id))
      .map((sibling) => ({
        ...sibling,
        orderKey: plan.keys.get(sibling.id) as string,
        updatedAt: sibling.id === id ? now : sibling.updatedAt,
      }));

    set(withNotes(snapshotOf(state), updated));
    const historyEntry = recordHistory(
      set,
      'reorder',
      siblings.filter((sibling) => plan.keys.has(sibling.id)),
      updated,
    );
    try {
      await runtime().repos.notes.putMany(updated);
    } catch (error) {
      set(snapshotOf(state));
      discardHistory(set, historyEntry);
      throw error;
    }
  },

  moveNote: async (id, newParentId, targetIndex) => {
    const state = get();
    const note = state.byId[id];
    if (!note || !isAlive(note)) return;
    if (note.parentId === newParentId) {
      const siblings = selectChildren(state, newParentId);
      await get().reorderNote(id, targetIndex ?? siblings.length - 1);
      return;
    }
    const reason = moveBlockReason(buildIndex(Object.values(state.byId)), id, newParentId);
    if (reason) throw new Error(`Movimento de nota inválido: ${reason}`);
    const targetSiblings = selectChildren(state, newParentId).filter((sibling) => sibling.id !== id);
    const position = Math.max(0, Math.min(targetIndex ?? targetSiblings.length, targetSiblings.length));
    const updated: Note = {
      ...note,
      parentId: newParentId,
      orderKey: keyForIndex(targetSiblings, position),
      updatedAt: Date.now(),
    };
    set(withNotes(snapshotOf(state), [updated]));
    const historyEntry = recordHistory(set, 'move', [note], [updated]);
    try {
      await runtime().repos.notes.put(updated);
    } catch (error) {
      set(snapshotOf(state));
      discardHistory(set, historyEntry);
      throw error;
    }
  },

  moveNotes: async (ids, newParentId) => {
    const state = get();
    const destination = state.byId[newParentId];
    if (!destination || !isAlive(destination) || destination.parentId !== null) {
      throw new Error('Destino de movimento inválido.');
    }

    const selected = new Set(
      [...new Set(ids)].filter((id) => {
        const note = state.byId[id];
        return note !== undefined && isAlive(note);
      }),
    );
    const moving = [...selected]
      .map((id) => state.byId[id])
      .filter((note) => {
        let parentId = note.parentId;
        while (parentId) {
          if (selected.has(parentId)) return false;
          parentId = state.byId[parentId]?.parentId ?? null;
        }
        return true;
      });
    if (moving.length === 0) return 0;

    const index = buildIndex(Object.values(state.byId));
    for (const note of moving) {
      const reason = moveBlockReason(index, note.id, newParentId);
      if (reason) throw new Error(`Movimento de nota inválido: ${reason}`);
    }

    const movingIds = new Set(moving.map((note) => note.id));
    const destinationSiblings = selectChildren(state, newParentId).filter(
      (note) => !movingIds.has(note.id),
    );
    const now = Date.now();
    const after: Note[] = [];
    for (const note of moving) {
      const updated = {
        ...note,
        parentId: newParentId,
        orderKey: keyAtEnd(destinationSiblings),
        updatedAt: now,
      };
      destinationSiblings.push(updated);
      after.push(updated);
    }

    set(withNotes(snapshotOf(state), after));
    const historyEntry = recordHistory(set, 'move', moving, after);
    try {
      await runtime().repos.notes.putMany(after);
    } catch (error) {
      set(snapshotOf(state));
      discardHistory(set, historyEntry);
      throw error;
    }
    return after.length;
  },

  duplicateNote: async (id, withChildren = true) => {
    const state = get();
    const index = buildIndex(Object.values(state.byId));
    const plan = planDuplicate(index, id, { genId: makeId, now: Date.now() }, { withChildren });
    if (!plan) return null;

    const linkOwners = plan.notes.map((note) => note.id);
    const links = plan.notes.flatMap((note) => buildLinks(note.id, note.content, makeId));
    const nextLinks = [...state.links.filter((link) => !linkOwners.includes(link.fromId)), ...links];
    set({ ...withNotes(snapshotOf(state), plan.notes), links: nextLinks });
    const historyEntry = recordHistory(set, 'duplicate', [], plan.notes, linkOwners, [], links);
    try {
      await runtime().repos.notes.applyChanges(plan.notes, [], linkOwners, links);
    } catch (error) {
      set(snapshotOf(state));
      set({ links: state.links });
      discardHistory(set, historyEntry);
      throw error;
    }
    return plan.newRootId;
  },

  softDelete: async (ids) => {
    const state = get();
    const index = buildIndex(Object.values(state.byId));
    const now = Date.now();
    const touched = new Map<ID, ID>(); // id → deletedRootId

    for (const id of ids) {
      const root = state.byId[id];
      if (!root || !isAlive(root)) continue;
      touched.set(root.id, root.id);
      for (const descendant of getDescendants(index, id)) {
        if (isAlive(descendant)) touched.set(descendant.id, root.id);
      }
    }
    if (touched.size === 0) return [];

    const updated = [...touched.entries()].map(([id, rootId]) => ({
      ...state.byId[id],
      deletedAt: now,
      deletedRootId: rootId,
      updatedAt: now,
    }));

    set(withNotes(snapshotOf(state), updated));
    const historyEntry = recordHistory(
      set,
      'delete',
      updated.map((note) => state.byId[note.id]),
      updated,
    );
    try {
      await runtime().repos.notes.putMany(updated);
    } catch (error) {
      set(snapshotOf(state));
      discardHistory(set, historyEntry);
      throw error;
    }
    return [...touched.keys()];
  },

  restoreNotes: async (groupRoots) => {
    const state = get();
    const group = expandDeletionGroups(state.byId, groupRoots);
    if (group.size === 0) return [];

    const index = buildIndex(Object.values(state.byId));
    const plan = planRestore(index, [...group], null);
    if (plan.entries.length === 0) return [];

    const updated = plan.entries.map((entry) => {
      const note = state.byId[entry.id];
      return {
        ...note,
        parentId: entry.parentId,
        deletedAt: null,
        deletedRootId: null,
        updatedAt: Date.now(),
      };
    });

    set(withNotes(snapshotOf(state), updated));
    const historyEntry = recordHistory(
      set,
      'restore',
      updated.map((note) => state.byId[note.id]),
      updated,
    );
    try {
      await runtime().repos.notes.putMany(updated);
    } catch (error) {
      set(snapshotOf(state));
      discardHistory(set, historyEntry);
      throw error;
    }
    return updated.map((note) => note.id);
  },

  deleteForever: async (groupRoots) => {
    const state = get();
    const group = expandDeletionGroups(state.byId, groupRoots);
    if (group.size === 0) return 0;

    set(withNotes(snapshotOf(state), [], [...group]));
    try {
      await runtime().repos.notes.remove([...group]);
      for (const id of group) {
        await runtime().repos.links.replaceFrom(id, []);
      }
    } catch (error) {
      set(snapshotOf(state));
      throw error;
    }
    return group.size;
  },

  undo: async () => {
    const entry = get().historyPast.at(-1);
    if (!entry) return null;
    await applyHistory(set, get, entry, false);
    set((state) => ({
      historyPast: state.historyPast.slice(0, -1),
      historyFuture: [...state.historyFuture, entry].slice(-HISTORY_LIMIT),
    }));
    const target = entry.before[0] ?? entry.after[0];
    return target?.deletedAt === null ? target.id : target?.parentId ?? target?.id ?? null;
  },

  redo: async () => {
    const entry = get().historyFuture.at(-1);
    if (!entry) return null;
    await applyHistory(set, get, entry, true);
    set((state) => ({
      historyPast: [...state.historyPast, entry].slice(-HISTORY_LIMIT),
      historyFuture: state.historyFuture.slice(0, -1),
    }));
    const target = entry.after[0] ?? entry.before[0];
    return target?.deletedAt === null ? target.id : target?.parentId ?? target?.id ?? null;
  },
}));

function recordHistory(
  set: (partial: Partial<NotesState> | ((state: NotesState) => Partial<NotesState>)) => void,
  label: NotesHistoryEntry['label'],
  before: Note[],
  after: Note[],
  linkOwners: ID[] = [],
  beforeLinks: Link[] = [],
  afterLinks: Link[] = [],
): NotesHistoryEntry {
  const entry: NotesHistoryEntry = { label, before, after, linkOwners, beforeLinks, afterLinks };
  set((state) => ({
    historyPast: [...state.historyPast, entry].slice(-HISTORY_LIMIT),
    historyFuture: [],
  }));
  return entry;
}

function discardHistory(
  set: (partial: Partial<NotesState> | ((state: NotesState) => Partial<NotesState>)) => void,
  entry: NotesHistoryEntry,
): void {
  set((state) => ({
    historyPast: state.historyPast.filter((candidate) => candidate !== entry),
  }));
}

async function applyHistory(
  set: (partial: Partial<NotesState>) => void,
  get: () => NotesState,
  entry: NotesHistoryEntry,
  forward: boolean,
): Promise<void> {
  const previous = get();
  const target = forward ? entry.after : entry.before;
  const targetIds = new Set(target.map((note) => note.id));
  const changedIds = new Set([...entry.before, ...entry.after].map((note) => note.id));
  const removed = [...changedIds].filter((id) => !targetIds.has(id));
  const links = forward ? (entry.afterLinks ?? []) : (entry.beforeLinks ?? []);
  const historyTarget = entry.label === 'tags'
    ? target.map((note) => ({ ...previous.byId[note.id], tags: note.tags, updatedAt: note.updatedAt }))
    : target;
  const next = withNotes(snapshotOf(previous), historyTarget, removed);
  set({
    ...next,
    links: entry.linkOwners?.length
      ? [...previous.links.filter((link) => !entry.linkOwners?.includes(link.fromId)), ...links]
      : previous.links,
  });
  try {
    await runtime().repos.notes.applyChanges(historyTarget, removed, entry.linkOwners ?? [], links);
  } catch (error) {
    set({ ...snapshotOf(previous), links: previous.links });
    throw error;
  }
}

function makeId(): ID {
  return ulid();
}

async function patchNote(
  set: (partial: Partial<NotesState> | ((state: NotesState) => Partial<NotesState>)) => void,
  get: () => NotesState,
  id: ID,
  patch: Partial<Pick<Note, 'icon' | 'color'>>,
): Promise<void> {
  const state = get();
  const note = state.byId[id];
  if (!note) return;
  const updated: Note = { ...note, ...patch, updatedAt: Date.now() };
  const historyEntry = recordHistory(set, 'style', [note], [updated]);
  set(withNotes(snapshotOf(state), [updated]));
  try {
    await runtime().repos.notes.put(updated);
  } catch (error) {
    set(snapshotOf(state));
    discardHistory(set, historyEntry);
    throw error;
  }
}

/** Movimento proibido (domínio) — usado pela UI e pelo DnD. */
export function canMove(state: NotesSnapshot, id: ID, targetParentId: ID | null): boolean {
  const index = buildIndex(Object.values(state.byId));
  return !wouldCreateCycle(index, id, targetParentId);
}

/** Categorias vivas em ordem (fallback da categoria ativa). */
export function firstAliveCategory(state: NotesSnapshot): ID | null {
  return selectChildren(state, null)[0]?.id ?? null;
}
