import { ulid } from 'ulid';

import { EMPTY_DOC, docToPlainText } from './content';
import { keyAtEnd } from './order';
import { isAlive } from './tree';
import type { ID, Note, NoteContentNode } from './types';

const MAX_CONTENT_DEPTH = 80;

export interface NoteRepairResult {
  notes: Note[];
  recoveredIds: ID[];
  normalizedContentIds: ID[];
  recoveryCategoryId: ID | null;
}

function sanitizeContent(value: unknown, depth = 0, seen = new Set<object>()): NoteContentNode | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    depth > MAX_CONTENT_DEPTH ||
    seen.has(value)
  ) {
    return null;
  }
  seen.add(value);
  const input = value as Record<string, unknown>;
  if (typeof input.type !== 'string' || input.type.length === 0) return null;
  if (input.text !== undefined && typeof input.text !== 'string') return null;
  if (input.attrs !== undefined && (typeof input.attrs !== 'object' || input.attrs === null || Array.isArray(input.attrs))) return null;

  if (input.content !== undefined) {
    if (!Array.isArray(input.content)) return null;
    for (const child of input.content) {
      const safe = sanitizeContent(child, depth + 1, seen);
      if (!safe) return null;
    }
  }

  if (input.marks !== undefined) {
    if (!Array.isArray(input.marks)) return null;
    for (const mark of input.marks) {
      if (typeof mark !== 'object' || mark === null || Array.isArray(mark)) return null;
      const item = mark as Record<string, unknown>;
      if (typeof item.type !== 'string') return null;
      if (
        item.attrs !== undefined &&
        (typeof item.attrs !== 'object' || item.attrs === null || Array.isArray(item.attrs))
      ) {
        return null;
      }
    }
  }

  seen.delete(value);
  return value as NoteContentNode;
}

export function repairNoteGraph(input: readonly Note[], now = Date.now()): NoteRepairResult {
  const normalizedContentIds: ID[] = [];
  const notes = input.map((note) => {
    let content = sanitizeContent(note.content);
    if (!content || content.type !== 'doc') content = EMPTY_DOC;
    let contentText = '';
    try {
      contentText = docToPlainText(content);
    } catch {
      content = EMPTY_DOC;
    }
    if (content !== note.content || contentText !== note.contentText) {
      normalizedContentIds.push(note.id);
      return { ...note, content, contentText };
    }
    return note;
  });

  const byId = new Map(notes.map((note) => [note.id, note]));
  const recovered = new Set<ID>();
  for (const note of notes) {
    if (note.parentId !== null && !byId.has(note.parentId)) recovered.add(note.id);
  }

  const globallyVisited = new Set<ID>();
  for (const note of notes) {
    if (globallyVisited.has(note.id)) continue;
    const path: ID[] = [];
    const pathIndex = new Map<ID, number>();
    let currentId: ID | null = note.id;
    while (currentId && byId.has(currentId) && !globallyVisited.has(currentId)) {
      const seenAt = pathIndex.get(currentId);
      if (seenAt !== undefined) {
        const cycleRoot = path.slice(seenAt).sort((left, right) => left.localeCompare(right))[0];
        if (cycleRoot) recovered.add(cycleRoot);
        break;
      }
      pathIndex.set(currentId, path.length);
      path.push(currentId);
      currentId = byId.get(currentId)?.parentId ?? null;
    }
    for (const id of path) globallyVisited.add(id);
  }

  if (recovered.size === 0) {
    return { notes, recoveredIds: [], normalizedContentIds, recoveryCategoryId: null };
  }

  const existingRecovery = notes.find(
    (note) => note.parentId === null && note.title === 'Recuperadas' && isAlive(note),
  );
  const rootNotes = notes.filter((note) => note.parentId === null && isAlive(note));
  const recoveryId = existingRecovery?.id ?? ulid();
  const nextNotes = existingRecovery
    ? [...notes]
    : [
        ...notes,
        {
          id: recoveryId,
          parentId: null,
          orderKey: keyAtEnd(rootNotes),
          title: 'Recuperadas',
          content: EMPTY_DOC,
          contentText: '',
          icon: 'folder',
          color: null,
          tags: [],
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          deletedRootId: null,
        },
      ];

  const recoveredSiblings = nextNotes.filter((note) => note.parentId === recoveryId && isAlive(note));
  const repairedNotes = nextNotes.map((note) => {
    if (!recovered.has(note.id)) return note;
    const repaired = {
      ...note,
      parentId: recoveryId,
      orderKey: keyAtEnd(recoveredSiblings),
      updatedAt: now,
    };
    recoveredSiblings.push(repaired);
    return repaired;
  });

  return {
    notes: repairedNotes,
    recoveredIds: [...recovered],
    normalizedContentIds,
    recoveryCategoryId: recoveryId,
  };
}