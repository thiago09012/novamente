import { isIndexedDBAvailable, NovamenteDatabase } from './database';
import { exportDatabase, importDatabase } from './backup';
import type { BackupFile } from '@/domain/backup';
import type { NoteRepairResult } from '@/domain/repair';
import { applyDataMigrations, type MigrationResult } from './migrations';
import { createDexieRepositories } from './repositories/dexie';
import type { Repositories } from './repositories/types';
import { planGraphRepair } from './repairGraph';
import { buildExampleSeed } from './seed';
import { publishDatabaseChange } from './sync';
import { expiredTrashIds } from '@/domain/trash';

export const EXAMPLE_ROOT_IDS_KEY = 'exampleRootIds';
export const SEED_VERSION_KEY = 'seedVersion';
export const SEED_VERSION = 1;

export class StorageUnavailableError extends Error {
  constructor() {
    super('IndexedDB indisponível neste navegador.');
    this.name = 'StorageUnavailableError';
  }
}

export interface AppDatabase {
  db: NovamenteDatabase | null;
  repos: Repositories;
  migration: MigrationResult;
  /** Resultado do reparo de grafos órfãos/ciclos aplicado na abertura/importação. */
  repair: NoteRepairResult;
  /** true quando a árvore de exemplo foi criada agora. */
  seededExample: boolean;
  /** true quando o armazenamento é apenas memória (nada será salvo). */
  memoryOnly: boolean;
  exportBackup: () => Promise<BackupFile>;
  importBackup: (input: unknown) => Promise<BackupFile>;
}

async function openDefaultDatabase(): Promise<NovamenteDatabase> {
  if (typeof indexedDB.databases !== 'function') {
    // Navegadores sem enumeração segura continuam usando o banco existente.
    const legacy = new NovamenteDatabase('mente');
    await legacy.open();
    return legacy;
  }

  const databases = await indexedDB.databases();
  const hasLegacy = databases.some((database) => database.name === 'mente');
  const current = new NovamenteDatabase();
  await current.open();
  if (!hasLegacy) return current;

  const migrationMarker = 'storageMigration:legacyV1';
  if (await current.meta.get(migrationMarker)) return current;

  const legacy = new NovamenteDatabase('mente');
  await legacy.open();
  const [oldNotes, oldLinks, oldSettings, oldViews, oldMeta, oldHandles] = await Promise.all([
    legacy.notes.toArray(),
    legacy.links.toArray(),
    legacy.settings.toArray(),
    legacy.views.toArray(),
    legacy.meta.toArray(),
    legacy.vaultHandles.toArray(),
  ]);
  const [newNotes, newLinks, newSettings, newViews, newMeta, newHandles] = await Promise.all([
    current.notes.toArray(),
    current.links.toArray(),
    current.settings.toArray(),
    current.views.toArray(),
    current.meta.toArray(),
    current.vaultHandles.toArray(),
  ]);

  const mergeBy = <T, K>(
    preferred: T[],
    incoming: T[],
    key: (row: T) => K,
    preferIncoming?: (current: T, candidate: T) => boolean,
  ): T[] => {
    const merged = new Map(preferred.map((row) => [key(row), row]));
    for (const row of incoming) {
      const id = key(row);
      const existing = merged.get(id);
      if (!existing) merged.set(id, row);
      else if (preferIncoming?.(existing, row)) {
        merged.set(id, row);
      }
    }
    return [...merged.values()];
  };

  const notes = mergeBy(
    newNotes,
    oldNotes,
    (note) => note.id,
    (currentNote, oldNote) => oldNote.updatedAt > currentNote.updatedAt,
  );
  const links = mergeBy(newLinks, oldLinks, (link) => link.id);
  const settings = mergeBy(newSettings, oldSettings, (row) => row.key);
  const views = mergeBy(newViews, oldViews, (view) => view.rootId);
  const meta = mergeBy(newMeta, oldMeta, (row) => row.key);
  if (!meta.some((row) => row.key === migrationMarker)) {
    meta.push({ key: migrationMarker, value: { completedAt: Date.now() } });
  }
  const handles = mergeBy(newHandles, oldHandles, (row) => row.id);

  await current.transaction(
    'rw',
    [
      current.notes,
      current.links,
      current.settings,
      current.views,
      current.meta,
      current.vaultHandles,
    ],
    async () => {
      await Promise.all([
        current.notes.bulkPut(notes),
        current.links.bulkPut(links),
        current.settings.bulkPut(settings),
        current.views.bulkPut(views),
        current.meta.bulkPut(meta),
        current.vaultHandles.bulkPut(handles),
      ]);
    },
  );

  const copiedCounts = await Promise.all([
    current.notes.count(),
    current.links.count(),
    current.settings.count(),
    current.views.count(),
    current.meta.count(),
    current.vaultHandles.count(),
  ]);
  const expectedCounts = [
    notes.length,
    links.length,
    settings.length,
    views.length,
    meta.length,
    handles.length,
  ];
  if (copiedCounts.some((count, index) => count !== expectedCounts[index])) {
    legacy.close();
    current.close();
    throw new Error('Não foi possível confirmar a migração dos dados locais para Novamente.');
  }

  legacy.close();
  return current;
}

/**
 * Abre o banco, aplica migrações e cria a árvore de exemplo na primeira execução.
 * Nunca apaga dados existentes.
 */
export async function openAppDatabase(name?: string): Promise<AppDatabase> {
  if (!isIndexedDBAvailable()) {
    throw new StorageUnavailableError();
  }

  const db = name ? new NovamenteDatabase(name) : await openDefaultDatabase();
  try {
    if (name) await db.open();
  } catch (error) {
    db.close();
    if (
      error instanceof DOMException &&
      ['SecurityError', 'InvalidStateError', 'NotSupportedError'].includes(error.name)
    ) {
      throw new StorageUnavailableError();
    }
    throw error;
  }

  const migration = await applyDataMigrations(db);
  const repos = createDexieRepositories(db);

  let seededExample = false;
  const count = await repos.notes.count();
  if (count === 0) {
    const seed = buildExampleSeed();
    await repos.notes.putMany(seed.notes);
    await repos.meta.set(EXAMPLE_ROOT_IDS_KEY, seed.rootIds);
    await repos.meta.set(SEED_VERSION_KEY, SEED_VERSION);

    const bySource = new Map<string, typeof seed.links>();
    for (const link of seed.links) {
      const bucket = bySource.get(link.fromId) ?? [];
      bucket.push(link);
      bySource.set(link.fromId, bucket);
    }
    for (const [fromId, links] of bySource) {
      await repos.links.replaceFrom(fromId, links);
    }
    seededExample = true;
  }

  await purgeExpiredTrash(db);

  // Reparo determinístico de órfãos/ciclos/conteúdo inválido (seção de erros).
  // Depois da purga: pai que sumiu vira órfão e é anexado a "Recuperadas".
  const repair = planGraphRepair(await db.notes.toArray());
  if (repair.changed.length > 0) {
    await db.notes.bulkPut(repair.changed);
    publishDatabaseChange({ kind: 'notes', upsert: repair.changed, remove: [] });
  }

  // Reduz o risco de o navegador despejar os dados (seção 9).
  if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
    try {
      await navigator.storage.persist();
    } catch {
      // melhor esforço: segue sem persistência garantida
    }
  }

  return {
    db,
    repos,
    migration,
    repair: repair.result,
    seededExample,
    memoryOnly: false,
    exportBackup: () => exportDatabase(db),
    importBackup: (input) => importDatabase(db, input),
  };
}

async function purgeExpiredTrash(db: NovamenteDatabase): Promise<void> {
  const notes = await db.notes.toArray();
  const expiredIds = expiredTrashIds(notes, Date.now());
  if (expiredIds.length === 0) return;
  const expiredSet = new Set(expiredIds);
  const expiredRoots = notes
    .filter((note) => expiredSet.has(note.id) && note.parentId === null)
    .map((note) => note.id);
  await db.transaction('rw', db.notes, db.links, db.views, async () => {
    await db.notes.bulkDelete(expiredIds);
    await db.links.where('fromId').anyOf(expiredIds).delete();
    await db.links.where('toId').anyOf(expiredIds).delete();
    if (expiredRoots.length > 0) await db.views.bulkDelete(expiredRoots);
  });
}
