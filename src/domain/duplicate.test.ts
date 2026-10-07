import { describe, expect, it } from 'vitest';

import { extractWikilinks } from '@/domain/content';
import { planDuplicate } from '@/domain/duplicate';
import { buildIndex } from '@/domain/tree';
import type { Note, NoteContentNode } from '@/domain/types';

import { makeTree } from '../tests/factories';

describe('planDuplicate', () => {
  const freshGen = () => {
    let seq = 0;
    return () => `novo-${(seq += 1)}`;
  };
  const now = 1_710_000_000_000;

  const linkDoc = (target: string | null, title: string): NoteContentNode => ({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: title,
            marks: [{ type: 'wikilink', attrs: { noteId: target, title } }],
          },
        ],
      },
    ],
  });

  const base = makeTree({
    cat: { parent: null, title: 'Categoria' },
    pai: { parent: 'cat', title: 'Pai' },
    filho: { parent: 'pai', title: 'Filho' },
    externa: { parent: 'cat', title: 'Externa' },
  });

  const withLink: Note = {
    ...(base.find((n) => n.id === 'pai') as Note),
    content: linkDoc('filho', 'Filho'),
  };
  const notes: Note[] = base.map((note) => (note.id === 'pai' ? withLink : note));
  const index = buildIndex(notes);

  it('duplica o subtree com novos ids e título "Cópia de"', () => {
    const genId = freshGen();
    const plan = planDuplicate(index, 'pai', { genId, now });
    expect(plan).not.toBeNull();
    expect(plan?.newRootId).toBe('novo-1');
    expect(plan?.notes.map((n) => n.id)).toEqual(['novo-1', 'novo-2']);
    expect(plan?.notes[0].title).toBe('Cópia de Pai');
    expect(plan?.notes[0].parentId).toBe('cat');
    expect(plan?.notes[1].title).toBe('Filho');
    expect(plan?.notes[1].parentId).toBe('novo-1');
    expect(plan?.notes.every((n) => n.createdAt === now && n.deletedAt === null)).toBe(true);
  });

  it('reaponta links internos e mantém externos', () => {
    const genId = freshGen();
    const plan = planDuplicate(index, 'pai', { genId, now });
    expect(plan).not.toBeNull();
    const copiedRoot = plan?.notes[0] as Note;
    const links = extractWikilinks(copiedRoot.content);
    expect(links[0].toId).toBe('novo-2');
    expect(links[0].toTitle).toBe('Filho');
    // o original continua apontando para os ids originais
    expect(extractWikilinks(withLink.content)[0].toId).toBe('filho');
  });

  it('ordena a cópia logo após o original', () => {
    const genId = freshGen();
    const original = base.find((n) => n.id === 'pai') as Note;
    const plan = planDuplicate(index, 'pai', { genId, now });
    expect((plan?.notes[0] as Note).orderKey > original.orderKey).toBe(true);
  });

  it('duplica só a nota quando withChildren é false', () => {
    const genId = freshGen();
    const plan = planDuplicate(index, 'pai', { genId, now }, { withChildren: false });
    expect(plan?.notes).toHaveLength(1);
    expect(plan?.notes[0].parentId).toBe('cat');
  });

  it('renomeia a categoria duplicada com prefixo customizado', () => {
    const genId = freshGen();
    const plan = planDuplicate(index, 'cat', { genId, now }, { titlePrefix: 'Copy ' });
    expect(plan?.notes[0].title).toBe('Copy Categoria');
  });

  it('retorna null para nota inexistente ou excluída', () => {
    const genId = freshGen();
    expect(planDuplicate(index, 'sumiu', { genId, now })).toBeNull();
    const deletedIndex = buildIndex([
      ...notes,
      { ...notes[0], id: 'morta', parentId: 'cat', orderKey: 'z', deletedAt: 1 },
    ]);
    expect(planDuplicate(deletedIndex, 'morta', { genId, now })).toBeNull();
  });
});
