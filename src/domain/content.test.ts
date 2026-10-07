import { describe, expect, it } from 'vitest';

import {
  docToPlainText,
  excerptAround,
  extractWikilinks,
  isEmptyDoc,
  normalizeDoc,
  remapDocLinks,
} from '@/domain/content';
import type { NoteContentNode } from '@/domain/types';

const doc: NoteContentNode = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Veja a ' },
        {
          type: 'text',
          text: 'Receita',
          marks: [{ type: 'wikilink', attrs: { noteId: 'n1', title: 'Receita' } }],
        },
        { type: 'text', text: ' e a ' },
        {
          type: 'text',
          text: 'Inexistente',
          marks: [{ type: 'wikilink', attrs: { noteId: null, title: 'Inexistente' } }],
        },
        { type: 'text', text: '.' },
      ],
    },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Título' }] },
  ],
};

describe('documentos', () => {
  it('extrai texto puro com quebras de bloco', () => {
    expect(docToPlainText(doc)).toBe('Veja a Receita e a Inexistente.\nTítulo');
  });

  it('trata conteúdo inválido como documento vazio', () => {
    expect(normalizeDoc(null)).toEqual({ type: 'doc', content: [] });
    expect(normalizeDoc('x')).toEqual({ type: 'doc', content: [] });
    expect(normalizeDoc({ type: 'paragraph' })).toEqual({ type: 'doc', content: [] });
    expect(normalizeDoc({ type: 'doc', content: 'oops' })).toEqual({ type: 'doc', content: [] });
    expect(normalizeDoc(doc)).toEqual(doc);
  });

  it('reconhece documentos vazios', () => {
    expect(isEmptyDoc({ type: 'doc', content: [] })).toBe(true);
    expect(isEmptyDoc({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(true);
    expect(isEmptyDoc(doc)).toBe(false);
    expect(isEmptyDoc(null)).toBe(true);
  });

  it('extrai wikilinks com alvo e sem alvo', () => {
    expect(extractWikilinks(doc)).toEqual([
      { toId: 'n1', toTitle: 'Receita' },
      { toId: null, toTitle: 'Inexistente' },
    ]);
    expect(extractWikilinks(null)).toEqual([]);
  });

  it('reaponta links internos preservando os externos', () => {
    const map = new Map([['n1', { id: 'novo1', title: 'Cópia de Receita' }]]);
    const out = remapDocLinks(doc, map);
    const links = extractWikilinks(out);
    expect(links[0]).toEqual({ toId: 'novo1', toTitle: 'Cópia de Receita' });
    expect(links[1]).toEqual({ toId: null, toTitle: 'Inexistente' });
    expect(extractWikilinks(doc)[0].toId).toBe('n1');
  });

  it('lê wikilinks como nós inline para texto, backlinks e duplicação', () => {
    const inlineDoc: NoteContentNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Leia ' },
            { type: 'wikilink', attrs: { noteId: 'n1', title: 'Receita', sourceId: 'origem' } },
            { type: 'text', text: ' depois.' },
          ],
        },
      ],
    };

    expect(docToPlainText(inlineDoc)).toBe('Leia Receita depois.');
    expect(extractWikilinks(inlineDoc)).toEqual([{ toId: 'n1', toTitle: 'Receita' }]);
    expect(
      extractWikilinks(remapDocLinks(inlineDoc, new Map([['n1', { id: 'n2', title: 'Cópia' }]]))),
    ).toEqual([{ toId: 'n2', toTitle: 'Cópia' }]);
  });

  it('gera trecho de contexto ao redor do termo', () => {
    const text = `inicio ${'x'.repeat(80)} alvo ${'y'.repeat(80)} fim`;
    const excerpt = excerptAround(text, 'alvo', 20);
    expect(excerpt).toContain('alvo');
    expect(excerpt?.startsWith('…')).toBe(true);
    expect(excerpt?.endsWith('…')).toBe(true);
    expect(excerptAround(text, 'ausente')).toBeNull();
    expect(excerptAround(text, '')).toBeNull();
  });
});
