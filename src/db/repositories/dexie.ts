import { SETTINGS_KEY, defaultSettings, sanitizeSettings } from '@/domain/settings';
import { publishDatabaseChange } from '@/db/sync';
import { isQuotaExceededError } from '@/db/storageErrors';
import { switchToMemoryOnly } from '@/app/runtime';

import type { MenteDatabase } from '../database';
import type {
  LinksRepository,
  MetaRepository,
  NotesRepository,
  Repositories,
  SettingsRepository,
  ViewsRepository,
} from './types';

async function withQuotaFallback<T>(
  write: () => Promise<T>,
  retryInMemory: (memory: Awaited<ReturnType<typeof switchToMemoryOnly>>) => Promise<T>,
): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (!isQuotaExceededError(error)) throw error;
    return retryInMemory(await switchToMemoryOnly());
  }
}

function createNotesRepository(db: MenteDatabase): NotesRepository {
  return {
    getAll: () => db.notes.toArray(),
    getById: (id) => db.notes.get(id),
    async put(note) {
      await withQuotaFallback(
        async () => { await db.notes.put(note); },
        (memory) => memory.repos.notes.put(note),
      );
      publishDatabaseChange({ kind: 'notes', upsert: [note], remove: [] });
    },
    async putMany(notes) {
      await withQuotaFallback(
        async () => { await db.notes.bulkPut([...notes]); },
        (memory) => memory.repos.notes.putMany(notes),
      );
      if (notes.length > 0) publishDatabaseChange({ kind: 'notes', upsert: [...notes], remove: [] });
    },
    async applyChanges(upsert, remove, replaceLinkOwners = [], links = []) {
      await withQuotaFallback(
        () =>
          db.transaction('rw', db.notes, db.links, async () => {
            if (upsert.length > 0) await db.notes.bulkPut([...upsert]);
            if (remove.length > 0) await db.notes.bulkDelete([...remove]);
            for (const id of replaceLinkOwners) await db.links.where('fromId').equals(id).delete();
            if (links.length > 0) await db.links.bulkAdd([...links]);
          }),
        (memory) => memory.repos.notes.applyChanges(upsert, remove, replaceLinkOwners, links),
      );
      if (upsert.length > 0 || remove.length > 0 || replaceLinkOwners.length > 0) {
        publishDatabaseChange({
          kind: 'notes',
          upsert: [...upsert],
          remove: [...remove],
          replaceLinkOwners: [...replaceLinkOwners],
          links: [...links],
        });
      }
    },
    async saveContent(note, links) {
      await withQuotaFallback(
        () =>
          db.transaction('rw', db.notes, db.links, async () => {
            await db.notes.put(note);
            await db.links.where('fromId').equals(note.id).delete();
            if (links.length > 0) await db.links.bulkAdd([...links]);
          }),
        (memory) => memory.repos.notes.saveContent(note, links),
      );
      publishDatabaseChange({
        kind: 'notes',
        upsert: [note],
        remove: [],
        replaceLinkOwners: [note.id],
        links: [...links],
      });
    },
    async remove(ids) {
      await withQuotaFallback(
        () => db.notes.bulkDelete([...ids]),
        (memory) => memory.repos.notes.remove(ids),
      );
      if (ids.length > 0) publishDatabaseChange({ kind: 'notes', upsert: [], remove: [...ids] });
    },
    count: () => db.notes.count(),
  };
}

function createLinksRepository(db: MenteDatabase): LinksRepository {
  return {
    getAll: () => db.links.toArray(),
    getByFrom: (fromId) => db.links.where('fromId').equals(fromId).toArray(),
    getByTo: (toId) => db.links.where('toId').equals(toId).toArray(),
    async replaceFrom(fromId, links) {
      await withQuotaFallback(
        () =>
          db.transaction('rw', db.links, async () => {
            await db.links.where('fromId').equals(fromId).delete();
            if (links.length > 0) await db.links.bulkAdd(links);
          }),
        (memory) => memory.repos.links.replaceFrom(fromId, links),
      );
      publishDatabaseChange({
        kind: 'notes',
        upsert: [],
        remove: [],
        replaceLinkOwners: [fromId],
        links: [...links],
      });
    },
  };
}

function createSettingsRepository(db: MenteDatabase): SettingsRepository {
  return {
    async get() {
      const row = await db.settings.get(SETTINGS_KEY);
      return sanitizeSettings(row);
    },
    async set(patch) {
      const row = await db.settings.get(SETTINGS_KEY);
      const merged = sanitizeSettings({ ...defaultSettings(), ...row, ...patch });
      await withQuotaFallback(
        async () => {
          await db.settings.put({ ...merged, key: SETTINGS_KEY });
          return merged;
        },
        (memory) => memory.repos.settings.set(patch),
      );
      publishDatabaseChange({ kind: 'settings', settings: merged });
      return merged;
    },
  };
}

function createViewsRepository(db: MenteDatabase): ViewsRepository {
  return {
    get: (rootId) => db.views.get(rootId),
    async put(view) {
      await withQuotaFallback(
        async () => { await db.views.put(view); },
        (memory) => memory.repos.views.put(view),
      );
      publishDatabaseChange({ kind: 'view', rootId: view.rootId, view });
    },
    async remove(rootId) {
      await withQuotaFallback(
        () => db.views.delete(rootId),
        (memory) => memory.repos.views.remove(rootId),
      );
      publishDatabaseChange({ kind: 'view', rootId, view: null });
    },
  };
}

function createMetaRepository(db: MenteDatabase): MetaRepository {
  return {
    async get<T>(key: string) {
      const row = await db.meta.get(key);
      return row?.value as T | undefined;
    },
    async set(key, value) {
      await withQuotaFallback(
        async () => { await db.meta.put({ key, value }); },
        (memory) => memory.repos.meta.set(key, value),
      );
    },
  };
}

export function createDexieRepositories(db: MenteDatabase): Repositories {
  return {
    notes: createNotesRepository(db),
    links: createLinksRepository(db),
    settings: createSettingsRepository(db),
    views: createViewsRepository(db),
    meta: createMetaRepository(db),
  };
}
