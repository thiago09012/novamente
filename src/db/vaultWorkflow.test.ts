import 'fake-indexeddb/auto';

import { exportVault, loadVaultNotes, mergeVaultNotes, notesToBackup } from '@/domain/vault';
import { makeNote } from '@/tests/factories';
import { afterEach, describe, expect, it } from 'vitest';

import { importDatabase } from './backup';
import { NovamenteDatabase } from './database';

const databases: NovamenteDatabase[] = [];

async function openDatabase(): Promise<NovamenteDatabase> {
  const db = new NovamenteDatabase(`vault-flow-${Date.now()}-${databases.length}`);
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

function sampleGraph() {
  const projs = makeNote({ id: 'cat-projs', parentId: null, title: 'Projetos', orderKey: 'a0' });
  const app = makeNote({ id: 'note-app', parentId: 'cat-projs', title: 'App Novamente', orderKey: 'a0' });
  const pwa = makeNote({
    id: 'note-pwa',
    parentId: 'note-app',
    title: 'Fase 7 PWA',
    orderKey: 'a0',
    tags: ['pendente'],
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Ver ' },
            { type: 'wikilink', attrs: { noteId: 'note-app', title: 'App Novamente', sourceId: 'note-pwa' } },
          ],
        },
      ],
    },
    contentText: 'Ver App Novamente',
  });
  return [projs, app, pwa];
}

describe('fluxo da IA (vault → merge → importDatabase)', () => {
  it('exporta, edita com frontmatter mínimo, faz merge e importa no banco do app', async () => {
    const base = sampleGraph();
    const { files } = exportVault(base, { now: 10 });

    // A IA reescreve o arquivo esquecendo o frontmatter (só id).
    const target = files.find((file) => file.markdown.includes('id: note-pwa'));
    expect(target).toBeDefined();
    const iaMarkdown = [
      '---',
      'id: note-pwa',
      '---',
      '',
      '# Fase 7 PWA',
      '',
      'Ver [[App Novamente]] agora — texto novo da IA.',
    ].join('\n');
    const iaFiles = files.map((file) =>
      file === target ? { ...file, markdown: iaMarkdown } : file,
    );

    const loaded = loadVaultNotes(iaFiles, { base });
    const merged = mergeVaultNotes(base, loaded);

    expect(merged.created).toEqual([]);
    expect(merged.updated).toContain('note-pwa');
    expect(merged.keptOnlyInBase).toEqual([]);
    const pwa = merged.notes.find((note) => note.id === 'note-pwa');
    expect(pwa?.tags).toEqual(['pendente']);
    expect(pwa?.icon).toBe('circle');
    expect(pwa?.parentId).toBe('note-app');
    expect(pwa?.contentText).toContain('texto novo da IA');

    // Caminho real do app: Configurações → Dados → importar JSON.
    const backup = notesToBackup(merged.notes);
    const db = await openDatabase();
    await importDatabase(db, JSON.parse(JSON.stringify(backup)) as unknown);

    const stored = await db.notes.get('note-pwa');
    expect(stored?.tags).toEqual(['pendente']);
    expect(stored?.parentId).toBe('note-app');
    expect(stored?.title).toBe('Fase 7 PWA');
    expect(stored?.contentText).toContain('texto novo da IA');

    const all = await db.notes.toArray();
    expect(all).toHaveLength(3);

    const links = await db.links.toArray();
    expect(links).toHaveLength(1);
    expect(links[0]?.fromId).toBe('note-pwa');
    expect(links[0]?.toId).toBe('note-app');
  });

  it('notas que sumiram do vault sobrevivem à importação', async () => {
    const base = sampleGraph();
    const { files } = exportVault(base, { now: 10 });
    // A IA apaga o arquivo da categoria (só no vault, não no merge final).
    const withoutRoot = files.filter(
      (file) => !file.markdown.includes('id: cat-projs'),
    );
    const loaded = loadVaultNotes(withoutRoot, { base });
    const merged = mergeVaultNotes(base, loaded);
    expect(merged.keptOnlyInBase).toContain('cat-projs');

    const db = await openDatabase();
    await importDatabase(db, notesToBackup(merged.notes));
    expect(await db.notes.get('cat-projs')).toBeDefined();
    expect(await db.notes.get('note-pwa')).toBeDefined();
  });
});
