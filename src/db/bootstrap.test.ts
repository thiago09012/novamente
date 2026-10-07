import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import { EMPTY_DOC } from '@/domain/content';
import { defaultSettings, SETTINGS_KEY } from '@/domain/settings';
import { makeNote } from '@/tests/factories';
import {
  EXAMPLE_ROOT_IDS_KEY,
  SEED_VERSION_KEY,
  StorageUnavailableError,
  openAppDatabase,
} from './bootstrap';
import { NovamenteDatabase } from './database';

const names: string[] = [];
let unique = 0;

function nextName(): string {
  unique += 1;
  const name = `boot-${Date.now()}-${unique}`;
  names.push(name);
  return name;
}

afterEach(async () => {
  for (const name of names.splice(0)) {
    const db = new NovamenteDatabase(name);
    db.close();
    await db.delete();
  }
});

describe('abertura do banco', () => {
  it('migra notas do banco legado sem descartar conteúdo', async () => {
    names.push('mente', 'novamente');
    const legacy = new NovamenteDatabase('mente');
    await legacy.open();
    const note = makeNote({ id: 'legacy-note', title: 'Dados anteriores' });
    await legacy.notes.put(note);
    await legacy.links.put({ id: 'legacy-link', fromId: note.id, toId: null, toTitle: 'externa' });
    await legacy.settings.put({ ...defaultSettings(), key: SETTINGS_KEY, theme: 'light' });
    await legacy.views.put({
      rootId: note.id,
      expanded: {},
      panX: 12,
      panY: 34,
      zoom: 1,
      selectedId: note.id,
    });
    await legacy.meta.put({ key: 'legacy-meta', value: 'preservado' });
    legacy.close();

    const app = await openAppDatabase();

    expect(app.db?.name).toBe('novamente');
    expect(await app.repos.notes.getById(note.id)).toMatchObject({
      id: note.id,
      title: note.title,
    });
    expect(await app.repos.links.getAll()).toContainEqual({
      id: 'legacy-link',
      fromId: note.id,
      toId: null,
      toTitle: 'externa',
    });
    expect(await app.repos.settings.get()).toMatchObject({ theme: 'light' });
    expect(await app.repos.views.get(note.id)).toMatchObject({ rootId: note.id, zoom: 1 });
    expect(await app.repos.meta.get('legacy-meta')).toBe('preservado');
  });

  it('cria a árvore de exemplo na primeira execução', async () => {
    const name = nextName();
    const first = await openAppDatabase(name);

    expect(first.seededExample).toBe(true);
    expect(first.memoryOnly).toBe(false);
    expect(first.migration).toEqual({ from: 0, to: 1 });
    expect(await first.repos.notes.count()).toBe(17);

    const rootIds = await first.repos.meta.get<string[]>(EXAMPLE_ROOT_IDS_KEY);
    expect(rootIds).toHaveLength(3);
    expect(await first.repos.meta.get<number>(SEED_VERSION_KEY)).toBe(1);

    const settings = await first.repos.settings.get();
    expect(settings.schemaVersion).toBe(1);
    expect(settings.theme).toBe('dark');
  });

  it('não recria o exemplo em aberturas seguintes', async () => {
    const name = nextName();
    const first = await openAppDatabase(name);
    await first.repos.notes.putMany([]);

    const second = await openAppDatabase(name);
    expect(second.seededExample).toBe(false);
    expect(await second.repos.notes.count()).toBe(17);
  });

  it('purga grupos da lixeira vencidos e limpa arestas ligadas a eles', async () => {
    const name = nextName();
    const first = await openAppDatabase(name);
    const [sample] = await first.repos.notes.getAll();
    const now = Date.now();
    const expiredAt = now - 31 * 24 * 60 * 60 * 1000;
    const expiredRoot = {
      ...sample,
      id: 'expired-root',
      parentId: null,
      deletedAt: expiredAt,
      deletedRootId: 'expired-root',
    };
    const expiredChild = {
      ...sample,
      id: 'expired-child',
      parentId: expiredRoot.id,
      deletedAt: expiredAt,
      deletedRootId: expiredRoot.id,
    };
    await first.repos.notes.putMany([expiredRoot, expiredChild]);
    await first.repos.links.replaceFrom(sample.id, [
      { id: 'expired-link', fromId: sample.id, toId: expiredRoot.id, toTitle: expiredRoot.title },
    ]);
    await first.repos.links.replaceFrom(expiredRoot.id, [
      { id: 'expired-outgoing', fromId: expiredRoot.id, toId: sample.id, toTitle: sample.title },
    ]);

    const reopened = await openAppDatabase(name);
    const remainingNotes = await reopened.repos.notes.getAll();
    const remainingLinks = await reopened.repos.links.getAll();
    expect(remainingNotes.some((note) => note.id === expiredRoot.id)).toBe(false);
    expect(remainingNotes.some((note) => note.id === expiredChild.id)).toBe(false);
    expect(
      remainingLinks.some((link) => link.toId === expiredRoot.id || link.fromId === expiredRoot.id),
    ).toBe(false);
  });

  it('lança StorageUnavailableError sem IndexedDB', async () => {
    const original = globalThis.indexedDB;
    // @ts-expect-error — simula navegador sem IndexedDB
    delete globalThis.indexedDB;
    try {
      await expect(openAppDatabase('sem-idb')).rejects.toBeInstanceOf(StorageUnavailableError);
    } finally {
      globalThis.indexedDB = original;
    }
  });
});

describe('reparo de grafos na abertura', () => {
  it('anexa órfãos e quebra ciclos sob "Recuperadas" sem apagar conteúdo', async () => {
    const name = nextName();
    const first = await openAppDatabase(name);
    const preserved = {
      type: 'doc',
      content: [{ type: 'paragraph', text: 'texto preservado' }],
    };
    await first.repos.notes.putMany([
      makeNote({
        id: 'orphan-1',
        parentId: 'missing-parent',
        title: 'Órfã',
        content: preserved,
        contentText: 'texto preservado',
      }),
      makeNote({ id: 'cycle-a', parentId: 'cycle-b', title: 'Ciclo A' }),
      makeNote({ id: 'cycle-b', parentId: 'cycle-a', title: 'Ciclo B' }),
    ]);

    const second = await openAppDatabase(name);
    const notes = await second.repos.notes.getAll();
    const recovery = notes.find((note) => note.title === 'Recuperadas');
    expect(recovery).toBeDefined();
    expect(recovery?.parentId).toBeNull();

    const orphan = notes.find((note) => note.id === 'orphan-1');
    expect(orphan?.parentId).toBe(recovery?.id);
    expect(orphan?.title).toBe('Órfã');
    expect(orphan?.content).toEqual(preserved);
    expect(orphan?.contentText).toBe('texto preservado');

    const cycleA = notes.find((note) => note.id === 'cycle-a');
    const cycleB = notes.find((note) => note.id === 'cycle-b');
    expect(cycleA?.parentId).toBe(recovery?.id);
    expect(cycleB?.parentId).toBe('cycle-a');

    expect(second.repair.recoveredIds).toEqual(expect.arrayContaining(['orphan-1', 'cycle-a']));
    expect(second.repair.recoveryCategoryId).toBe(recovery?.id);

    const third = await openAppDatabase(name);
    const notesAfter = await third.repos.notes.getAll();
    expect(notesAfter.filter((note) => note.title === 'Recuperadas')).toHaveLength(1);
    expect(third.repair.recoveredIds).toEqual([]);
  });

  it('substitui conteúdo inválido por documento vazio na abertura', async () => {
    const name = nextName();
    const first = await openAppDatabase(name);
    await first.repos.notes.putMany([
      makeNote({
        id: 'broken-content',
        title: 'Quebrada',
        content: { type: 'paragraph' },
        contentText: 'lixo',
      }),
    ]);

    const second = await openAppDatabase(name);
    const stored = await second.repos.notes.getById('broken-content');
    expect(stored?.content).toEqual(EMPTY_DOC);
    expect(stored?.contentText).toBe('');
    expect(second.repair.normalizedContentIds).toContain('broken-content');
  });

  it('não repara nada em banco limpo (sem escritas desnecessárias)', async () => {
    const name = nextName();
    await openAppDatabase(name);
    const second = await openAppDatabase(name);
    expect(second.repair.recoveredIds).toEqual([]);
    expect(second.repair.normalizedContentIds).toEqual([]);
    expect(second.repair.recoveryCategoryId).toBeNull();
  });
});
