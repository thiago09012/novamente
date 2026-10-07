import { defaultSettings } from '@/domain/settings';
import { createBackup, parseBackup, type BackupFile } from '@/domain/backup';
import { repairNoteGraph } from '@/domain/repair';
import { buildExampleSeed } from './seed';
import { EMPTY_REPAIR } from './repairGraph';

import type { AppDatabase } from './bootstrap';
import type { ID, Settings, ViewRecord } from '@/domain/types';

export function openMemoryDatabase(): AppDatabase {
  const seed = buildExampleSeed();
  const notes = new Map(seed.notes.map((note) => [note.id, note]));
  const links = new Map(seed.links.map((link) => [link.id, link]));
  const views = new Map<ID, ViewRecord>();
  const meta = new Map<string, unknown>([
    ['exampleRootIds', seed.rootIds],
    ['seedVersion', 1],
  ]);
  let settings: Settings = { ...defaultSettings(), lastCategoryId: seed.rootIds[0] ?? null };

  const exportBackup = (): Promise<BackupFile> =>
    Promise.resolve(createBackup({
      notes: [...notes.values()],
      links: [...links.values()],
      settings,
      views: [...views.values()],
      meta: [...meta.entries()].map(([key, value]) => ({ key, value })),
    }));

  const importBackup = (input: unknown): Promise<BackupFile> => {
    const backup = parseBackup(input);
    // Espelha o importIndexedDB: reparo de órfãos/ciclos/conteúdo inválido.
    const repaired = repairNoteGraph(backup.data.notes);
    notes.clear();
    links.clear();
    views.clear();
    meta.clear();
    for (const note of repaired.notes) notes.set(note.id, note);
    for (const link of backup.data.links) links.set(link.id, link);
    for (const view of backup.data.views) views.set(view.rootId, view);
    for (const row of backup.data.meta) meta.set(row.key, row.value);
    settings = backup.data.settings;
    app.repair = repaired;
    return Promise.resolve(backup);
  };

  const app: AppDatabase = {
    db: null,
    repos: {
      notes: {
        getAll: () => Promise.resolve([...notes.values()]),
        getById: (id) => Promise.resolve(notes.get(id)),
        put: (note) => {
          notes.set(note.id, note);
          return Promise.resolve();
        },
        putMany: (items) => {
          for (const note of items) notes.set(note.id, note);
          return Promise.resolve();
        },
        applyChanges: (upsert, remove, replaceLinkOwners = [], nextLinks = []) => {
          for (const id of remove) notes.delete(id);
          for (const note of upsert) notes.set(note.id, note);
          const owners = new Set(replaceLinkOwners);
          for (const [id, link] of links) if (owners.has(link.fromId)) links.delete(id);
          for (const link of nextLinks) links.set(link.id, link);
          return Promise.resolve();
        },
        saveContent: (note, nextLinks) => {
          notes.set(note.id, note);
          for (const [id, link] of links) if (link.fromId === note.id) links.delete(id);
          for (const link of nextLinks) links.set(link.id, link);
          return Promise.resolve();
        },
        remove: (ids) => {
          for (const id of ids) notes.delete(id);
          return Promise.resolve();
        },
        count: () => Promise.resolve(notes.size),
      },
      links: {
        getAll: () => Promise.resolve([...links.values()]),
        getByFrom: (fromId) => Promise.resolve([...links.values()].filter((link) => link.fromId === fromId)),
        getByTo: (toId) => Promise.resolve([...links.values()].filter((link) => link.toId === toId)),
        replaceFrom: (fromId, nextLinks) => {
          for (const [id, link] of links) if (link.fromId === fromId) links.delete(id);
          for (const link of nextLinks) links.set(link.id, link);
          return Promise.resolve();
        },
      },
      settings: {
        get: () => Promise.resolve(settings),
        set: (patch) => {
          settings = { ...settings, ...patch };
          return Promise.resolve(settings);
        },
      },
      views: {
        get: (rootId) => Promise.resolve(views.get(rootId)),
        put: (view) => {
          views.set(view.rootId, view);
          return Promise.resolve();
        },
        remove: (rootId) => {
          views.delete(rootId);
          return Promise.resolve();
        },
      },
      meta: {
        get: <T,>(key: string) => Promise.resolve(meta.get(key) as T | undefined),
        set: (key: string, value: unknown) => {
          meta.set(key, value);
          return Promise.resolve();
        },
      },
    },
    migration: { from: 1, to: 1 },
    repair: EMPTY_REPAIR,
    seededExample: true,
    memoryOnly: true,
    exportBackup,
    importBackup,
  };
  return app;
}
