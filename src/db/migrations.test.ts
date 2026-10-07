import 'fake-indexeddb/auto';

import { SETTINGS_KEY, defaultSettings } from '@/domain/settings';
import { afterEach, describe, expect, it } from 'vitest';

import { MenteDatabase } from './database';
import { applyDataMigrations } from './migrations';

const open: MenteDatabase[] = [];

function freshDb(): MenteDatabase {
  const db = new MenteDatabase(`mig-${Date.now()}-${open.length}`);
  open.push(db);
  return db;
}

afterEach(async () => {
  for (const db of open.splice(0)) {
    db.close();
    await db.delete();
  }
});

describe('migrações de dados', () => {
  it('cria as configurações padrão na primeira execução', async () => {
    const db = freshDb();
    const result = await applyDataMigrations(db);

    expect(result).toEqual({ from: 0, to: 1 });
    const row = await db.settings.get(SETTINGS_KEY);
    expect(row?.schemaVersion).toBe(1);
    expect(row?.theme).toBe('dark');
    expect(row).toMatchObject(defaultSettings());
  });

  it('preserva configurações existentes ao migrar', async () => {
    const db = freshDb();
    await db.settings.put({
      ...defaultSettings(),
      key: SETTINGS_KEY,
      theme: 'light',
      editorWidth: 500,
    });

    const result = await applyDataMigrations(db);

    expect(result).toEqual({ from: 1, to: 1 });
    const row = await db.settings.get(SETTINGS_KEY);
    expect(row?.theme).toBe('light');
    expect(row?.editorWidth).toBe(500);
    expect(row?.schemaVersion).toBe(1);
  });

  it('descarta valores corrompidos sem apagar o resto', async () => {
    const db = freshDb();
    await db.settings.put({
      key: SETTINGS_KEY,
      theme: 'purple',
      editorWidth: 99_999,
      sidebarCollapsed: 'sim',
      schemaVersion: 0,
    } as never);

    const result = await applyDataMigrations(db);

    expect(result).toEqual({ from: 0, to: 1 });
    const row = await db.settings.get(SETTINGS_KEY);
    expect(row?.theme).toBe('dark');
    expect(row?.editorWidth).toBe(420);
    expect(row?.sidebarCollapsed).toBe(false);
  });

  it('é idempotente', async () => {
    const db = freshDb();
    await applyDataMigrations(db);
    const second = await applyDataMigrations(db);
    expect(second).toEqual({ from: 1, to: 1 });
  });
});
