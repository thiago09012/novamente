import { describe, expect, it } from 'vitest';

import { planRestore } from '@/domain/restore';
import { buildIndex } from '@/domain/tree';

import { makeTree } from '../tests/factories';

describe('planRestore', () => {
  it('volta ao pai original quando o pai está vivo', () => {
    const notes = makeTree({
      cat: { parent: null },
      pai: { parent: 'cat' },
      filho: { parent: 'pai', deletedAt: 5, deletedRootId: 'pai' },
    });
    const index = buildIndex(notes);
    const plan = planRestore(index, ['filho']);
    expect(plan.entries).toEqual([{ id: 'filho', parentId: 'pai' }]);
    expect(plan.recovered).toEqual([]);
  });

  it('usa a raiz da categoria quando a categoria está morta', () => {
    const notes = makeTree({
      cat: { parent: null, deletedAt: 5 },
      pai: { parent: 'cat', deletedAt: 5 },
      filho: { parent: 'pai', deletedAt: 5 },
      outra: { parent: null },
    });
    const index = buildIndex(notes);
    // restaurando só o filho (grupo não inclui a categoria)
    const plan = planRestore(index, ['filho']);
    expect(plan.entries).toEqual([{ id: 'filho', parentId: null }]);
  });

  it('mantém o pai quando ele é restaurado junto (grupo da cascata)', () => {
    const notes = makeTree({
      cat: { parent: null },
      pai: { parent: 'cat', deletedAt: 5 },
      filho: { parent: 'pai', deletedAt: 5 },
    });
    const index = buildIndex(notes);
    const plan = planRestore(index, ['pai', 'filho']);
    expect(plan.entries).toEqual([
      { id: 'pai', parentId: 'cat' },
      { id: 'filho', parentId: 'pai' },
    ]);
  });

  it('cai na categoria de recuperação quando nada está vivo', () => {
    const notes = makeTree({
      cat: { parent: null, deletedAt: 5 },
      pai: { parent: 'cat', deletedAt: 5 },
      filho: { parent: 'pai', deletedAt: 5 },
      recuperadas: { parent: null },
    });
    const index = buildIndex(notes);
    const plan = planRestore(index, ['filho'], 'recuperadas');
    expect(plan.entries).toEqual([{ id: 'filho', parentId: 'recuperadas' }]);
    expect(plan.recovered).toEqual(['filho']);
  });

  it('restaura categorias como raiz e ignora notas vivas', () => {
    const notes = makeTree({
      cat: { parent: null, deletedAt: 5 },
      viva: { parent: null },
    });
    const index = buildIndex(notes);
    const plan = planRestore(index, ['cat', 'viva']);
    expect(plan.entries).toEqual([{ id: 'cat', parentId: null }]);
  });
});
