import type { ID, Note } from './types';

export const TRASH_RETENTION_DAYS = 30;
export const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = TRASH_RETENTION_DAYS * DAY_MS;

/** IDs de grupos completos vencidos; um membro do grupo não expira sozinho. */
export function expiredTrashIds(notes: readonly Note[], now: number): ID[] {
  const byId = new Map(notes.map((note) => [note.id, note]));
  const expiredRoots = notes.filter(
    (note) =>
      note.deletedAt !== null &&
      (note.deletedRootId === null || note.deletedRootId === note.id) &&
      note.deletedAt <= now - RETENTION_MS,
  );
  const ids = new Set<ID>();
  for (const root of expiredRoots) {
    ids.add(root.id);
    for (const note of notes) {
      if (note.deletedRootId === root.id) ids.add(note.id);
    }
  }
  return [...ids].filter((id) => byId.has(id));
}

/** Dias corridos restantes até a exclusão definitiva (arredondados para cima). */
export function trashDaysRemaining(deletedAt: number, now: number): number {
  return Math.max(0, Math.ceil((deletedAt + RETENTION_MS - now) / DAY_MS));
}
