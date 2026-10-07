import 'fake-indexeddb/auto';

import { SETTINGS_KEY, defaultSettings } from '@/domain/settings';
import { EMPTY_DOC } from '@/domain/content';
import { ulid } from 'ulid';
import { afterEach, describe, expect, it } from 'vitest';

import { MenteDatabase } from './database';
import { createDexieRepositories } from './repositories/dexie';
import type { Repositories } from './repositories/types';

import { makeNote } from '../tests/factories';

const open: MenteDatabase[] = [];

function freshRepos(): Repositories {
  const db = new MenteDatabase(`repo-${Date.now()}-${open.length}`);
  open.push(db);
  return createDexieRepositories(db);
}

afterEach(async () => {
  for (const db of open.splice(0)) {
    db.close();
    await db.delete();
  }
});

describe('repositório de notas', () => {
  it('grava, lê, conta e remove notas', async () => {
    const repos = freshRepos();
    const notes = [
      makeNote({ id: 'n1', title: 'Um' }),
      makeNote({ id: 'n2', title: 'Dois', parentId: 'n1' }),
    ];

    await repos.notes.putMany(notes);
    expect(await repos.notes.count()).toBe(2);
    expect((await repos.notes.getById('n2'))?.title).toBe('Dois');
    expect((await repos.notes.getAll()).map((n) => n.id).sort()).toEqual(['n1', 'n2']);

    await repos.notes.remove(['n2']);
    expect(await repos.notes.count()).toBe(1);
    expect(await repos.notes.getById('n2')).toBeUndefined();
  });

  it('preserva soft delete (lixeira) em put', async () => {
    const repos = freshRepos();
    const note = makeNote({ id: 'n1', deletedAt: 10, deletedRootId: 'n1' });
    await repos.notes.put(note);
    const stored = await repos.notes.getById('n1');
    expect(stored?.deletedAt).toBe(10);
    expect(stored?.deletedRootId).toBe('n1');
    expect(await repos.notes.getAll()).toHaveLength(1);
  });

  it('aplica mudanças de undo/redo em uma transação', async () => {
    const repos = freshRepos();
    const original = makeNote({ id: 'old', title: 'Antiga' });
    await repos.notes.put(original);
    const updated = { ...original, title: 'Atualizada' };
    const created = makeNote({ id: 'new', title: 'Nova' });

    await repos.notes.applyChanges([updated, created], ['old']);

    expect(await repos.notes.getById('old')).toBeUndefined();
    expect((await repos.notes.getById('new'))?.title).toBe('Nova');
    expect(await repos.notes.count()).toBe(1);
  });

  it('grava conteúdo e links de forma atômica', async () => {
    const repos = freshRepos();
    const original = makeNote({ id: 'origem' });
    const target = makeNote({ id: 'destino', parentId: 'categoria', title: 'Destino' });
    await repos.notes.putMany([original, target]);
    const content = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'wikilink', attrs: { noteId: 'destino', title: 'Destino' } }] }],
    };
    const updated = { ...original, content, contentText: 'Destino', updatedAt: 20 };
    const link = { id: 'link-1', fromId: 'origem', toId: 'destino', toTitle: 'Destino' };

    await repos.notes.saveContent(updated, [link]);
    expect((await repos.notes.getById('origem'))?.content).toEqual(content);
    expect(await repos.links.getByFrom('origem')).toEqual([link]);

    const invalidContent = { ...updated, content: EMPTY_DOC, contentText: 'rollback', updatedAt: 30 };
    await expect(repos.notes.saveContent(invalidContent, [link, link])).rejects.toThrow();
    expect((await repos.notes.getById('origem'))?.content).toEqual(content);
    expect(await repos.links.getByFrom('origem')).toEqual([link]);
  });
});

describe('repositório de links', () => {
  it('substitui os links de uma nota em uma transação', async () => {
    const repos = freshRepos();
    const link = (to: string, title: string) => ({
      id: ulid(),
      fromId: 'origem',
      toId: to,
      toTitle: title,
    });

    await repos.links.replaceFrom('origem', [link('a', 'A'), link('b', 'B')]);
    expect(await repos.links.getByFrom('origem')).toHaveLength(2);

    await repos.links.replaceFrom('origem', [link('c', 'C')]);
    expect(await repos.links.getByFrom('origem')).toHaveLength(1);

    await repos.links.replaceFrom('origem', []);
    expect(await repos.links.getByFrom('origem')).toHaveLength(0);
  });

  it('consulta por alvo', async () => {
    const repos = freshRepos();
    await repos.links.replaceFrom('x', [{ id: 'l1', fromId: 'x', toId: 'alvo', toTitle: 'Alvo' }]);
    await repos.links.replaceFrom('y', [{ id: 'l2', fromId: 'y', toId: 'alvo', toTitle: 'Alvo' }]);
    expect(await repos.links.getByTo('alvo')).toHaveLength(2);
    expect(await repos.links.getAll()).toHaveLength(2);
  });
});

describe('repositório de configurações, views e meta', () => {
  it('retorna padrões quando não há linha', async () => {
    const repos = freshRepos();
    expect(await repos.settings.get()).toEqual(defaultSettings());
  });

  it('mescla patches e ignora valores inválidos', async () => {
    const repos = freshRepos();
    const first = await repos.settings.set({ theme: 'light', sidebarCollapsed: true });
    expect(first.theme).toBe('light');
    expect(first.sidebarCollapsed).toBe(true);

    const second = await repos.settings.set({ editorWidth: 9999 });
    expect(second.editorWidth).toBe(420);
    expect(second.theme).toBe('light');
    expect((await repos.settings.get()).sidebarCollapsed).toBe(true);
  });

  it('persiste views de navegação por categoria', async () => {
    const repos = freshRepos();
    const view = {
      rootId: 'cat1',
      expanded: { a: true },
      panX: 10,
      panY: 20,
      zoom: 1.2,
      selectedId: 'a',
    };
    await repos.views.put(view);
    expect(await repos.views.get('cat1')).toEqual(view);
    await repos.views.remove('cat1');
    expect(await repos.views.get('cat1')).toBeUndefined();
  });

  it('guarda metadados arbitrários', async () => {
    const repos = freshRepos();
    expect(await repos.meta.get('exampleRootIds')).toBeUndefined();
    await repos.meta.set('exampleRootIds', ['a', 'b']);
    expect(await repos.meta.get<string[]>('exampleRootIds')).toEqual(['a', 'b']);
  });

  it('grava settings com a chave fixa', async () => {
    const repos = freshRepos();
    await repos.settings.set({ theme: 'system' });
    const row = await repos.settings.get();
    expect(row.theme).toBe('system');
    expect(SETTINGS_KEY).toBe('app');
  });
});
