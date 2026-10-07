import { describe, expect, it } from 'vitest';

import { makeNote } from '@/tests/factories';
import { EMPTY_DOC } from './content';
import { repairNoteGraph } from './repair';

describe('repairNoteGraph', () => {
  it('recupera órfão e quebra ciclos uma vez sem duplicar a categoria', () => {
    const notes = [
      makeNote({ id: 'category', title: 'Categoria' }),
      makeNote({ id: 'orphan', parentId: 'missing', title: 'Órfã' }),
      makeNote({ id: 'cycle-a', parentId: 'cycle-b', title: 'Ciclo A' }),
      makeNote({ id: 'cycle-b', parentId: 'cycle-a', title: 'Ciclo B' }),
    ];

    const result = repairNoteGraph(notes, 20);
    const recovery = result.notes.find((note) => note.title === 'Recuperadas');
    expect(recovery?.parentId).toBeNull();
    expect(result.recoveredIds).toEqual(expect.arrayContaining(['orphan', 'cycle-a']));
    expect(result.notes.find((note) => note.id === 'orphan')?.parentId).toBe(recovery?.id);
    expect(result.notes.find((note) => note.id === 'cycle-a')?.parentId).toBe(recovery?.id);
    expect(result.notes.find((note) => note.id === 'cycle-b')?.parentId).toBe('cycle-a');

    const secondPass = repairNoteGraph(result.notes, 30);
    expect(secondPass.recoveredIds).toEqual([]);
    expect(secondPass.notes.filter((note) => note.title === 'Recuperadas')).toHaveLength(1);
  });

  it('substitui conteúdo inválido por documento vazio e rederiva texto', () => {
    const invalid = makeNote({
      id: 'invalid',
      content: { type: 'paragraph' },
      contentText: 'texto órfão',
    });
    const result = repairNoteGraph([invalid]);
    expect(result.notes[0]?.content).toEqual(EMPTY_DOC);
    expect(result.notes[0]?.contentText).toBe('');
    expect(result.normalizedContentIds).toEqual(['invalid']);
  });

  it('mantém a mesma referência de conteúdo válido (não marca como alterada)', () => {
    const stable = makeNote({
      id: 'stable',
      title: 'Estável',
      content: { type: 'doc', content: [{ type: 'paragraph', text: 'ok' }] },
      contentText: 'ok',
    });
    const result = repairNoteGraph([stable], 20);
    expect(result.notes[0]).toBe(stable);
    expect(result.normalizedContentIds).toEqual([]);
    expect(result.recoveredIds).toEqual([]);
  });
});