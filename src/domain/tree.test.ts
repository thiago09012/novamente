import { describe, expect, it } from 'vitest';

import {
  breakCycles,
  buildIndex,
  categories,
  childrenOf,
  countDescendants,
  depthOf,
  detectCycles,
  findOrphans,
  getDescendants,
  getPath,
  isCategory,
  isDescendantOf,
  liveNotes,
  moveBlockReason,
  wouldCreateCycle,
} from '@/domain/tree';

import { makeTree } from '../tests/factories';

describe('index e consulta de árvore', () => {
  const notes = makeTree({
    comida: { parent: null },
    doce: { parent: 'comida' },
    salgada: { parent: 'comida' },
    brigadeiro: { parent: 'doce' },
    micro: { parent: 'brigadeiro' },
    pao: { parent: 'salgada' },
    livros: { parent: null },
    duna: { parent: 'livros', deletedAt: 123 },
  });
  const index = buildIndex(notes);

  it('categorias são notas com parentId null', () => {
    expect(categories(index).map((n) => n.id)).toEqual(['comida', 'livros']);
    expect(isCategory(notes[0])).toBe(true);
  });

  it('filhos são ordenados por orderKey e excluem a lixeira por padrão', () => {
    expect(childrenOf(index, 'comida').map((n) => n.id)).toEqual(['doce', 'salgada']);
    expect(childrenOf(index, 'livros', { includeDeleted: true }).map((n) => n.id)).toEqual([
      'duna',
    ]);
    expect(childrenOf(index, 'livros')).toEqual([]);
  });

  it('lista descendentes e conta apenas vivos', () => {
    expect(getDescendants(index, 'comida').map((n) => n.id)).toEqual([
      'doce',
      'brigadeiro',
      'micro',
      'salgada',
      'pao',
    ]);
    expect(countDescendants(index, 'comida')).toBe(5);
    expect(countDescendants(index, 'livros')).toBe(0);
    expect(liveNotes(index)).toHaveLength(7);
  });

  it('conta em tempo linear e termina mesmo se os dados tiverem um ciclo', () => {
    const cyclic = buildIndex(
      makeTree({
        a: { parent: 'b' },
        b: { parent: 'a' },
        child: { parent: 'b' },
      }),
    );

    expect(getDescendants(cyclic, 'a').map((note) => note.id)).toEqual(['b', 'child']);
    expect(countDescendants(cyclic, 'a')).toBe(2);
  });

  it('calcula caminho e profundidade', () => {
    expect(getPath(index, 'micro').map((n) => n.id)).toEqual([
      'comida',
      'doce',
      'brigadeiro',
      'micro',
    ]);
    expect(depthOf(index, 'comida')).toBe(0);
    expect(depthOf(index, 'doce')).toBe(1);
    expect(depthOf(index, 'micro')).toBe(3);
  });

  it('reconhece descendentes', () => {
    expect(isDescendantOf(index, 'micro', 'comida')).toBe(true);
    expect(isDescendantOf(index, 'comida', 'micro')).toBe(false);
    expect(isDescendantOf(index, 'comida', 'comida')).toBe(false);
  });

  it('encontra órfãos (parentId inexistente)', () => {
    const withOrphan = [...notes, { ...notes[0], id: 'perdida', parentId: 'nao-existe' }];
    expect(findOrphans(withOrphan).map((n) => n.id)).toEqual(['perdida']);
    expect(findOrphans(notes)).toEqual([]);
  });
});

describe('validação de movimento (regra de domínio)', () => {
  const notes = makeTree({
    comida: { parent: null },
    doce: { parent: 'comida' },
    brigadeiro: { parent: 'doce' },
    micro: { parent: 'brigadeiro' },
    bebidas: { parent: null },
  });
  const index = buildIndex(notes);

  it('bloqueia mover para si mesmo', () => {
    expect(wouldCreateCycle(index, 'doce', 'doce')).toBe(true);
    expect(moveBlockReason(index, 'doce', 'doce')).toBe('self');
  });

  it('bloqueia mover para dentro de um descendente', () => {
    expect(wouldCreateCycle(index, 'doce', 'micro')).toBe(true);
    expect(moveBlockReason(index, 'doce', 'micro')).toBe('descendant');
    expect(wouldCreateCycle(index, 'comida', 'micro')).toBe(true);
  });

  it('permite mover para outra categoria ou para a raiz', () => {
    expect(wouldCreateCycle(index, 'doce', 'bebidas')).toBe(false);
    expect(wouldCreateCycle(index, 'doce', null)).toBe(false);
    expect(moveBlockReason(index, 'doce', 'bebidas')).toBeNull();
  });

  it('bloqueia movimento que excederia 50 níveis', () => {
    const deep = makeTree({
      r: { parent: null },
      fora: { parent: null },
      x: { parent: 'fora' },
    });
    for (let i = 1; i <= 50; i += 1) {
      deep.push({
        ...deep[0],
        id: `n${i}`,
        parentId: i === 1 ? 'r' : `n${i - 1}`,
        orderKey: 'a',
      });
    }
    const deepIndex = buildIndex(deep);
    expect(moveBlockReason(deepIndex, 'x', 'n50')).toBe('depth');
    expect(moveBlockReason(deepIndex, 'x', 'n49')).toBeNull();
  });
});

describe('ciclos em dados corrompidos', () => {
  it('detecta ciclos', () => {
    const notes = makeTree({
      a: { parent: 'c' },
      b: { parent: 'a' },
      c: { parent: 'b' },
      fora: { parent: null },
      apontador: { parent: 'c' },
    });
    expect(new Set(detectCycles(notes))).toEqual(new Set(['a', 'b', 'c']));
  });

  it('quebra o ciclo promovendo uma nota para categoria', () => {
    const notes = makeTree({
      a: { parent: 'c' },
      b: { parent: 'a' },
      c: { parent: 'b' },
      fora: { parent: null },
    });
    const { notes: fixed, broken } = breakCycles(notes);
    expect(broken).toHaveLength(1);
    expect(detectCycles(fixed)).toEqual([]);
    expect(fixed.find((n) => n.id === broken[0])?.parentId).toBeNull();
    expect(fixed.find((n) => n.id === 'fora')?.parentId).toBeNull();
  });

  it('não altera árvores saudáveis', () => {
    const notes = makeTree({ a: { parent: null }, b: { parent: 'a' } });
    const { notes: fixed, broken } = breakCycles(notes);
    expect(broken).toEqual([]);
    expect(fixed).toEqual(notes);
  });
});
