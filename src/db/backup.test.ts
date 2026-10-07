import 'fake-indexeddb/auto';

import { createBackup, parseBackup } from '@/domain/backup';
import { EMPTY_DOC } from '@/domain/content';
import { SETTINGS_KEY, defaultSettings } from '@/domain/settings';
import type { NoteContentNode } from '@/domain/types';
import { makeNote } from '@/tests/factories';
import { afterEach, describe, expect, it } from 'vitest';

import { NovamenteDatabase } from './database';
import { exportDatabase, importDatabase } from './backup';

const databases: NovamenteDatabase[] = [];

async function openDatabase(): Promise<NovamenteDatabase> {
  const db = new NovamenteDatabase(`backup-${Date.now()}-${databases.length}`);
  databases.push(db);
  await db.open();
  return db;
}

afterEach(async () => {
  for (const db of databases.splice(0)) {
    db.close();
    await db.delete();
  }
});

describe('backup JSON', () => {
  it('importa o formato legado e o normaliza para Novamente', () => {
    const legacy = createBackup({
      notes: [],
      links: [],
      settings: defaultSettings(),
      views: [],
      meta: [],
    });

    expect(parseBackup({ ...legacy, format: 'mente-backup' }).format).toBe('novamente-backup');
  });

  it('exporta e restaura integralmente notas, links, settings, views e meta', async () => {
    const db = await openDatabase();
    const root = makeNote({ id: 'root', title: 'Categoria', orderKey: 'a0' });
    const child = makeNote({ id: 'child', parentId: root.id, title: 'Nota', orderKey: 'a0' });
    const link = { id: 'link', fromId: child.id, toId: root.id, toTitle: root.title };
    const settings = { ...defaultSettings(), lastCategoryId: root.id, key: SETTINGS_KEY };
    const view = {
      rootId: root.id,
      expanded: { [child.id]: true },
      panX: 12,
      panY: 34,
      zoom: 0.8,
      selectedId: child.id,
    };
    const meta = { key: 'exampleRootIds', value: [root.id] };
    await db.notes.bulkPut([root, child]);
    await db.links.put(link);
    await db.settings.put(settings);
    await db.views.put(view);
    await db.meta.put(meta);

    const backup = await exportDatabase(db);
    await db.transaction('rw', db.notes, db.links, db.settings, db.views, db.meta, async () => {
      await Promise.all([
        db.notes.clear(),
        db.links.clear(),
        db.settings.clear(),
        db.views.clear(),
        db.meta.clear(),
      ]);
    });
    await importDatabase(db, JSON.parse(JSON.stringify(backup)) as unknown);

    expect(await db.notes.toArray()).toEqual([child, root]);
    expect(await db.links.toArray()).toEqual([link]);
    expect(await db.settings.toArray()).toEqual([settings]);
    expect(await db.views.toArray()).toEqual([view]);
    expect(await db.meta.toArray()).toEqual([meta]);
  });

  it('rejeita referências quebradas sem alterar o banco atual', async () => {
    const db = await openDatabase();
    const original = makeNote({ id: 'original', title: 'Preservada' });
    await db.notes.put(original);
    await db.settings.put({ ...defaultSettings(), key: SETTINGS_KEY });
    const before = await exportDatabase(db);
    const invalid = JSON.parse(JSON.stringify(before)) as {
      data: { notes: Array<Record<string, unknown>> };
    };
    invalid.data.notes[0].parentId = 'missing-parent';

    await expect(importDatabase(db, invalid)).rejects.toThrow('Pai inexistente');
    expect((await exportDatabase(db)).data).toEqual(before.data);
  });

  it('repara conteúdo profundo demais na importação sem perder a nota', async () => {
    const db = await openDatabase();
    const root = makeNote({ id: 'root', title: 'Categoria', orderKey: 'a0' });
    let deep: NoteContentNode = { type: 'paragraph', text: 'x' };
    for (let i = 0; i < 90; i += 1) deep = { type: 'doc', content: [deep] };
    const deepNote = makeNote({
      id: 'deep',
      parentId: null,
      orderKey: 'a1',
      title: 'Profunda',
      content: deep,
      contentText: 'x',
    });
    const backup = createBackup({
      notes: [root, deepNote],
      links: [],
      settings: { ...defaultSettings(), lastCategoryId: root.id },
      views: [],
      meta: [],
    });

    await importDatabase(db, backup);

    const stored = await db.notes.get('deep');
    expect(stored?.title).toBe('Profunda');
    expect(stored?.content).toEqual(EMPTY_DOC);
    expect(stored?.contentText).toBe('');
  });
});
