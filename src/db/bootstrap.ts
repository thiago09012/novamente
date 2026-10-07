import { isIndexedDBAvailable, MenteDatabase } from './database';
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
  db: MenteDatabase | null;
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

/**
 * Abre o banco, aplica migrações e cria a árvore de exemplo na primeira execução.
 * Nunca apaga dados existentes.
 */
export async function openAppDatabase(name?: string): Promise<AppDatabase> {
  if (!isIndexedDBAvailable()) {
    throw new StorageUnavailableError();
  }

  const db = new MenteDatabase(name);
  try {
    await db.open();
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

async function purgeExpiredTrash(db: MenteDatabase): Promise<void> {
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
