import { describe, expect, it } from 'vitest';

import { MAX_ORDER_KEY_LENGTH } from '@/domain/constants';
import {
  keyAtEnd,
  keyForIndex,
  needsReindex,
  orderKeyBetween,
  planReorder,
  reindexKeys,
} from '@/domain/order';

import { makeNote } from '../tests/factories';

describe('chaves fracionárias', () => {
  it('gera chaves entre vizinhos', () => {
    const a = orderKeyBetween(null, null);
    const b = orderKeyBetween(a, null);
    expect(a < b).toBe(true);
    expect(orderKeyBetween(a, b) > a).toBe(true);
    expect(orderKeyBetween(a, b) < b).toBe(true);
  });

  it('insere no meio e no fim de uma lista ordenada', () => {
    const siblings = [makeNote({ orderKey: 'a0' }), makeNote({ orderKey: 'a2' })];
    const middle = keyForIndex(siblings, 1);
    expect(middle > 'a0' && middle < 'a2').toBe(true);
    expect(keyAtEnd(siblings) > 'a2').toBe(true);
    expect(keyForIndex(siblings, 0) < 'a0').toBe(true);
  });

  it('reindexa quando alguma chave ultrapassa 64 caracteres', () => {
    const long = 'a' + '0'.repeat(70);
    const siblings = [makeNote({ orderKey: 'a0' }), makeNote({ orderKey: long })];
    expect(needsReindex(siblings)).toBe(true);
    const fresh = reindexKeys(2);
    expect(fresh).toHaveLength(2);
    expect(fresh[0] < fresh[1]).toBe(true);
    expect(fresh.every((key) => key.length <= MAX_ORDER_KEY_LENGTH)).toBe(true);
  });
});

describe('planReorder', () => {
  const siblings = [
    makeNote({ id: 'um', orderKey: 'a0' }),
    makeNote({ id: 'dois', orderKey: 'a1' }),
    makeNote({ id: 'tres', orderKey: 'a2' }),
  ];

  it('move um irmão para outra posição mudando só a chave dele', () => {
    const plan = planReorder(siblings, 'um', 1);
    expect(plan.reindexed).toBe(false);
    expect(plan.keys.size).toBe(1);
    const key = plan.keys.get('um') as string;
    expect(key > 'a1').toBe(true);
    expect(key < 'a2').toBe(true);
  });

  it('movimento para a própria posição não altera nada além da chave do item', () => {
    const plan = planReorder(siblings, 'dois', 1);
    expect(plan.keys.has('dois')).toBe(true);
  });

  it('reindexa o conjunto quando as chaves estão longas demais', () => {
    const huge = ['a' + '0'.repeat(70), 'a' + '0'.repeat(70) + '1', 'a' + '0'.repeat(70) + '2'];
    const longSiblings = siblings.map((note, i) => ({ ...note, orderKey: huge[i] }));
    const plan = planReorder(longSiblings, 'um', 2);
    expect(plan.reindexed).toBe(true);
    expect(plan.keys.size).toBe(3);
    const keys = [...plan.keys.values()];
    expect(keys.every((key) => key.length <= MAX_ORDER_KEY_LENGTH)).toBe(true);
  });

  it('é no-op para id desconhecido', () => {
    const plan = planReorder(siblings, 'nao-existe', 1);
    expect(plan.keys.size).toBe(0);
    expect(plan.reindexed).toBe(false);
  });
});
