import {
  SETTINGS_KEY,
  SETTINGS_SCHEMA_VERSION,
  defaultSettings,
  sanitizeSettings,
} from '@/domain/settings';

import type { NovamenteDatabase } from './database';

export interface DataMigration {
  toVersion: number;
  run(db: NovamenteDatabase): Promise<void>;
}

/**
 * Migrações de dados (além do schema do Dexie).
 * Cada passo é idempotente e versionado; `schemaVersion` fica em settings.
 */
export const dataMigrations: DataMigration[] = [
  {
    toVersion: 1,
    async run(db) {
      const row = await db.settings.get(SETTINGS_KEY);
      const base = row ? sanitizeSettings(row) : defaultSettings();
      await db.settings.put({ ...base, key: SETTINGS_KEY });
    },
  },
];

export interface MigrationResult {
  from: number;
  to: number;
}

/** Aplica todas as migrações pendentes em ordem. Retorna de/para. */
export async function applyDataMigrations(db: NovamenteDatabase): Promise<MigrationResult> {
  const row = await db.settings.get(SETTINGS_KEY);
  const from = typeof row?.schemaVersion === 'number' ? row.schemaVersion : 0;
  let current = from;

  for (const migration of dataMigrations) {
    if (migration.toVersion <= current) continue;
    await migration.run(db);
    current = migration.toVersion;
  }

  const migrated = await db.settings.get(SETTINGS_KEY);
  const settings = migrated ? sanitizeSettings(migrated) : defaultSettings();
  await db.settings.put({ ...settings, key: SETTINGS_KEY, schemaVersion: current });

  return { from, to: current };
}

export { SETTINGS_SCHEMA_VERSION };
