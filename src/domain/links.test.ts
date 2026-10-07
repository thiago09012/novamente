import { describe, expect, it } from 'vitest';

import {
  buildLinks,
  collectBacklinks,
  isLinkResolved,
  linkDisplayTitle,
  linksForNotes,
  linksFrom,
} from '@/domain/links';
import { buildIndex } from '@/domain/tree';
import type { NoteContentNode } from '@/domain/types';

import { makeNote } from '../tests/factories';

function docWithLink(noteId: string | null, title: string): NoteContentNode {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'olá ' },
          { type: 'text', text: title, marks: [{ type: 'wikilink', attrs: { noteId, title } }] },
        ],
      },
    ],
  };
}

describe('links', () => {
  let counter = 0;
  const genId = () => `link-${(counter += 1)}`;

  const receita = makeNote({
    id: 'receita',
    title: 'Receita',
    contentText: 'A receita deste Café é maravilhosa',
    content: docWithLink('cafe', 'Café'),
  });
  const cafe = makeNote({ id: 'cafe', title: 'Café', parentId: 'receita' });
  const fora = makeNote({ id: 'fora', title: 'Fora' });
  const morta = makeNote({ id: 'morta', title: 'Morta', deletedAt: 1 });
  const index = buildIndex([receita, cafe, fora, morta]);

  it('reconstrói linhas de link a partir do conteúdo', () => {
    const links = buildLinks('receita', receita.content, genId);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ fromId: 'receita', toId: 'cafe', toTitle: 'Café' });
    expect(links[0].id).toBeTruthy();
  });

  it('resolve só quando o alvo existe e está vivo', () => {
    const links = linksForNotes([receita], genId);
    expect(isLinkResolved(links[0], index)).toBe(true);

    const paraMorta = buildLinks('fora', docWithLink('morta', 'Morta'), genId);
    expect(isLinkResolved(paraMorta[0], index)).toBe(false);

    const semAlvo = buildLinks('fora', docWithLink(null, 'Sumiu'), genId);
    expect(isLinkResolved(semAlvo[0], index)).toBe(false);
  });

  it('exibe o título atual da nota alvo quando resolvido', () => {
    const links = buildLinks('receita', receita.content, genId);
    expect(linkDisplayTitle(links[0], index)).toBe('Café');
    const unresolved = buildLinks('fora', docWithLink(null, 'Sumiu'), genId);
    expect(linkDisplayTitle(unresolved[0], index)).toBe('Sumiu');
  });

  it('coleta backlinks com contexto', () => {
    const links = linksForNotes([receita], genId);
    const backlinks = collectBacklinks(links, 'cafe', index);
    expect(backlinks).toHaveLength(1);
    expect(backlinks[0].fromId).toBe('receita');
    expect(backlinks[0].fromTitle).toBe('Receita');
    expect(backlinks[0].context).toContain('Café');
  });

  it('filtra links de partida de uma nota', () => {
    const links = linksForNotes([receita, cafe], genId);
    expect(linksFrom(links, 'receita')).toHaveLength(1);
    expect(linksFrom(links, 'cafe')).toHaveLength(0);
  });
});
