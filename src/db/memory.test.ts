import { createBackup } from '@/domain/backup';
import { EMPTY_DOC } from '@/domain/content';
import { defaultSettings } from '@/domain/settings';
import type { NoteContentNode } from '@/domain/types';
import { makeNote } from '@/tests/factories';
import { describe, expect, it } from 'vitest';

import { openMemoryDatabase } from './memory';

describe('runtime somente em memória', () => {
  it('inicia com o exemplo, permite alterações e exporta sem IndexedDB', async () => {
    const app = openMemoryDatabase();
    expect(app.memoryOnly).toBe(true);
    expect(app.db).toBeNull();
    expect(await app.repos.notes.count()).toBe(17);

    const categoryId = (await app.repos.meta.get<string[]>('exampleRootIds'))?.[0];
    expect(categoryId).toBeDefined();
    const note = await app.repos.notes.getAll().then((items) => items.find((item) => item.parentId === categoryId));
    expect(note).toBeDefined();
    if (!note) throw new Error('Nota de exemplo não encontrada');
    await app.repos.notes.put({ ...note, title: 'Alteração volátil' });

    const backup = await app.exportBackup();
    expect(backup.data.notes.find((item) => item.id === note.id)?.title).toBe('Alteração volátil');
  });

  it('importa um backup e atualiza os repositórios voláteis', async () => {
    const source = openMemoryDatabase();
    const backup = await source.exportBackup();
    const target = openMemoryDatabase();
    await target.importBackup(backup);

    expect(await target.repos.notes.getAll()).toEqual(backup.data.notes);
    expect(await target.repos.links.getAll()).toEqual(backup.data.links);
    expect(await target.repos.settings.get()).toEqual(backup.data.settings);
    expect(await target.repos.meta.get('exampleRootIds')).toEqual(backup.data.meta[0].value);
  });

  it('repara conteúdo profundo demais na importação em memória', async () => {
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

    const target = openMemoryDatabase();
    await target.importBackup(backup);

    const stored = await target.repos.notes.getById('deep');
    expect(stored?.title).toBe('Profunda');
    expect(stored?.content).toEqual(EMPTY_DOC);
    expect(target.repair.normalizedContentIds).toContain('deep');
  });
});