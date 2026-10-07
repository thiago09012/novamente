import { describe, expect, it } from 'vitest';

import { MAX_TAGS, MAX_TAG_LENGTH } from '@/domain/constants';
import { normalizeTag, normalizeTags, searchableTag, stripAccents } from '@/domain/tags';

describe('normalização de tags', () => {
  it('remove #, espaços e caixa alta', () => {
    expect(normalizeTag('  #Receita Fácil ')).toBe('receita-fácil');
  });

  it('remove acentos apenas quando configurado', () => {
    expect(normalizeTag('Café')).toBe('café');
    expect(normalizeTag('Café', { stripAccents: true })).toBe('cafe');
    expect(searchableTag('Café')).toBe('cafe');
    expect(stripAccents('ação')).toBe('acao');
  });

  it('respeita o tamanho máximo', () => {
    expect(normalizeTag('x'.repeat(100))).toHaveLength(MAX_TAG_LENGTH);
  });

  it('deduplica, ignora vazias e limita a quantidade', () => {
    const tags = normalizeTags(['#A', 'a', '', '   ', 'B', 'b']);
    expect(tags).toEqual(['a', 'b']);

    const many = normalizeTags(Array.from({ length: 50 }, (_, i) => `t${i}`));
    expect(many).toHaveLength(MAX_TAGS);
  });
});
