import { describe, expect, it } from 'vitest';

import { makeNote } from '@/tests/factories';
import { EMPTY_DOC } from './content';
import {
  createNoteInGraph,
  exportVault,
  formatTree,
  loadVaultNotes,
  mergeVaultNotes,
  moveNoteInGraph,
  notesToBackup,
  searchNotes,
  tagNoteInGraph,
} from './vault';

function sampleGraph() {
  const projs = makeNote({ id: 'cat-projs', parentId: null, title: 'Projetos', orderKey: 'a0' });
  const app = makeNote({ id: 'note-app', parentId: 'cat-projs', title: 'App Mente', orderKey: 'a0' });
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
            { type: 'wikilink', attrs: { noteId: 'note-app', title: 'App Mente', sourceId: 'note-pwa' } },
          ],
        },
      ],
    },
    contentText: 'Ver App Mente',
  });
  return [projs, app, pwa];
}

describe('vault', () => {
  it('exporta e recarrega o grafo sem perder ids nem hierarquia', () => {
    const notes = sampleGraph();
    const { files, manifest } = exportVault(notes, { now: 10 });
    expect(manifest.format).toBe('mente-vault');
    expect(manifest.notes).toHaveLength(3);

    const mdFiles = files.filter((file) => file.path.endsWith('.md'));
    const loaded = loadVaultNotes(mdFiles);
    expect(loaded).toHaveLength(3);

    // Guia para IA embutido em .mente/ (nunca vira nota).
    const guide = files.find((file) => file.path === '.mente/AGENTES.md');
    expect(guide?.markdown).toContain('instruções para IA');
    expect(loaded.some((note) => note.title.includes('Vault do MENTE'))).toBe(false);

    const app = loaded.find((note) => note.id === 'note-app');
    const pwa = loaded.find((note) => note.id === 'note-pwa');
    const projs = loaded.find((note) => note.id === 'cat-projs');
    expect(projs?.parentId).toBeNull();
    expect(app?.parentId).toBe('cat-projs');
    expect(pwa?.parentId).toBe('note-app');
    expect(pwa?.tags).toEqual(['pendente']);
  });

  it('merge cria, atualiza por LWW e não apaga o que sumiu do vault', () => {
    const base = sampleGraph();
    const vault = [
      base[0],
      base[1],
      {
        ...base[2],
        content: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'atualizado pela IA' }] },
          ],
        },
        contentText: 'atualizado pela IA',
        updatedAt: (base[2]?.updatedAt ?? 0) + 1000,
      },
      makeNote({ id: 'nova', parentId: 'note-app', title: 'Nova tarefa', orderKey: 'a1' }),
    ];
    const merged = mergeVaultNotes(base, vault, { now: Date.now() });
    expect(merged.created).toContain('nova');
    expect(merged.updated).toContain('note-pwa');
    expect(merged.keptOnlyInBase).toEqual([]);
    const pwa = merged.notes.find((note) => note.id === 'note-pwa');
    expect(pwa?.contentText).toContain('atualizado pela IA');

    // Nota que existe só no base permanece.
    const onlyBase = mergeVaultNotes(base, [base[0]], { now: Date.now() });
    expect(onlyBase.keptOnlyInBase).toEqual(['note-app', 'note-pwa']);
  });

  it('merge com updatedAt menor preserva o base (LWW)', () => {
    const base = [makeNote({ id: 'n1', title: 'Base', updatedAt: 100, contentText: 'base' })];
    const incoming = [makeNote({ id: 'n1', title: 'Antigo', updatedAt: 50, contentText: 'antigo' })];
    const merged = mergeVaultNotes(base, incoming, { now: 200 });
    expect(merged.notes[0]?.title).toBe('Base');
    expect(merged.unchanged).toContain('n1');
  });

  it('notesToBackup gera links a partir dos wikilinks', () => {
    const backup = notesToBackup(sampleGraph());
    expect(backup.format).toBe('mente-backup');
    expect(backup.data.notes).toHaveLength(3);
    expect(backup.data.links.length).toBeGreaterThan(0);
    expect(backup.data.links[0]?.toId).toBe('note-app');
  });

  it('busca por título, tag e conteúdo', () => {
    const notes = sampleGraph();
    const byTitle = searchNotes(notes, 'pwa');
    expect(byTitle[0]?.note.id).toBe('note-pwa');
    const byTag = searchNotes(notes, 'pendente');
    expect(byTag.some((hit) => hit.note.id === 'note-pwa')).toBe(true);
    const byContent = searchNotes(notes, 'Ver App');
    expect(byContent.some((hit) => hit.note.id === 'note-pwa')).toBe(true);
  });

  it('create/move/tag operam no grafo com regras de domínio', () => {
    const base = sampleGraph();
    const { notes: withNew, note } = createNoteInGraph(base, {
      parentId: 'note-app',
      title: 'Checklist',
      tags: ['rotina'],
      content: { type: 'doc', content: [] },
    });
    expect(note.parentId).toBe('note-app');

    const moved = moveNoteInGraph(withNew, note.id, 'cat-projs');
    expect(moved.find((item) => item.id === note.id)?.parentId).toBe('cat-projs');

    expect(() => moveNoteInGraph(withNew, 'cat-projs', 'note-pwa')).toThrow();

    const tagged = tagNoteInGraph(moved, note.id, { add: ['feito'], remove: ['rotina'] });
    const taggedNote = tagged.find((item) => item.id === note.id);
    expect(taggedNote?.tags).toContain('feito');
    expect(taggedNote?.tags).not.toContain('rotina');
  });

  it('formatTree imprime a hierarquia', () => {
    const tree = formatTree(sampleGraph());
    expect(tree).toContain('Projetos');
    expect(tree).toContain('App Mente');
    expect(tree).toContain('Fase 7 PWA');
    expect(tree).toContain('[pendente]');
  });

  it('vault round-trip preserva conteúdo rico após merge', () => {
    const notes = sampleGraph();
    const { files } = exportVault(notes);
    const loaded = loadVaultNotes(files.filter((file) => file.path.endsWith('.md')));
    const merged = mergeVaultNotes(notes, loaded);
    const pwa = merged.notes.find((note) => note.id === 'note-pwa');
    expect(pwa?.content).not.toEqual(EMPTY_DOC);
    expect(pwa?.contentText).toContain('App Mente');
  });

  it('loadVaultNotes com base herda campos de frontmatter mínimo', () => {
    const base = sampleGraph();
    const minimal = [
      '---',
      'id: note-pwa',
      '---',
      '',
      'Fase 7 PWA',
      '',
      'Conteúdo reescrito pela IA.',
    ].join('\n');
    const loaded = loadVaultNotes([{ path: 'cat/projs/pwa.md', markdown: minimal }], { base });
    const pwa = loaded.find((note) => note.id === 'note-pwa');
    expect(pwa?.tags).toEqual(['pendente']);
    expect(pwa?.icon).toBe('circle');
    expect(pwa?.updatedAt).toBe(base[2]?.updatedAt);
    expect(pwa?.contentText).toContain('reescrito pela IA');
    // Sem base: não herda nada.
    const orphan = loadVaultNotes([{ path: 'cat/projs/pwa.md', markdown: minimal }]);
    expect(orphan[0]?.tags).toEqual([]);
  });

  it('merge classifica entrada idêntica como unchanged', () => {
    const base = sampleGraph();
    const merged = mergeVaultNotes(base, base, { now: Date.now() });
    expect(merged.updated).toEqual([]);
    expect(merged.unchanged).toEqual(['cat-projs', 'note-app', 'note-pwa']);
  });
});
