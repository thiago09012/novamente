import { repairNoteGraph, type NoteRepairResult } from '@/domain/repair';
import type { Note } from '@/domain/types';

export interface GraphRepairPlan {
  result: NoteRepairResult;
  /** Notas novas ou alteradas (comparadas por referência — o sanitizador preserva objetos válidos). */
  changed: Note[];
}

export const EMPTY_REPAIR: NoteRepairResult = {
  notes: [],
  recoveredIds: [],
  normalizedContentIds: [],
  recoveryCategoryId: null,
};

/** Calcula o reparo sem persistir. `changed` é o que precisa ir ao banco. */
export function planGraphRepair(all: readonly Note[]): GraphRepairPlan {
  const result = repairNoteGraph(all);
  if (result.recoveredIds.length === 0 && result.normalizedContentIds.length === 0) {
    return { result, changed: [] };
  }
  const before = new Map(all.map((note) => [note.id, note]));
  const changed = result.notes.filter((note) => before.get(note.id) !== note);
  return { result, changed };
}
