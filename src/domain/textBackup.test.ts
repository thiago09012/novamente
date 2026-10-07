import { defaultSettings } from './settings';
import { exportMarkdown, exportOpml, importTextBackup } from './textBackup';
import { describe, expect, it } from 'vitest';

import { makeNote } from '@/tests/factories';

const notes = [
  makeNote({ id: 'category', title: 'Música & livros', orderKey: 'a0' }),
  makeNote({
    id: 'child',
    parentId: 'category',
    title: 'São Jorge <3',
    orderKey: 'a0',
    contentText: 'Primeira linha\nSegunda linha',
    tags: ['favorito', 'leitura'],
  }),
  makeNote({ id: 'grandchild', parentId: 'child', title: 'Detalhes', orderKey: 'a0' }),
];

function expectImportedHierarchy(backup: ReturnType<typeof importTextBackup>) {
  const category = backup.data.notes.find((note) => note.parentId === null);
  expect(category?.title).toBe('Música & livros');
  const child = backup.data.notes.find((note) => note.parentId === category?.id);
  expect(child?.title).toBe('São Jorge <3');
  expect(child?.contentText).toBe('Primeira linha\nSegunda linha');
  expect(child?.tags).toEqual(['favorito', 'leitura']);
  expect(backup.data.notes.find((note) => note.parentId === child?.id)?.title).toBe('Detalhes');
}

describe('intercâmbio Markdown e OPML', () => {
  it('preserva hierarquia, títulos, texto e tags em Markdown', () => {
    const markdown = exportMarkdown(notes);
    const backup = importTextBackup('markdown', markdown, defaultSettings(), 10);

    expectImportedHierarchy(backup);
    expect(backup.data.links).toEqual([]);
  });

  it('escapa caracteres XML e preserva hierarquia e conteúdo em OPML', () => {
    const opml = exportOpml(notes);
    const backup = importTextBackup('opml', opml, defaultSettings(), 10);

    expect(opml).toContain('Música &amp; livros');
    expectImportedHierarchy(backup);
  });

  it('importa arquivos antigos com marcadores e atributos MENTE', () => {
    const markdown =
      '<!-- MENTE Markdown exchange v1 -->\n<!-- mente:depth=0 -->\n<!-- mente:tags=["legado"] -->\n# Antigo\n';
    const backup = importTextBackup('markdown', markdown, defaultSettings(), 10);

    expect(backup.data.notes[0]).toMatchObject({ title: 'Antigo', tags: ['legado'] });

    const opml =
      '<?xml version="1.0"?><opml version="2.0" xmlns:mente="urn:mente:exchange:v1"><head/><body><outline text="Antigo" mente:content="&quot;texto&quot;" mente:tags="[&quot;legado&quot;]" /></body></opml>';
    const oldOpml = importTextBackup('opml', opml, defaultSettings(), 10);
    expect(oldOpml.data.notes[0]).toMatchObject({ title: 'Antigo', contentText: 'texto', tags: ['legado'] });
  });

  it('rejeita XML malformado antes de criar um backup importável', () => {
    expect(() => importTextBackup('opml', '<opml><body><outline>')).toThrow('OPML inválido');
  });
});
