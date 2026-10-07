import { buildIndex } from '@/domain/tree';
import { describe, expect, it } from 'vitest';

import { buildExampleSeed, buildStressSeed } from './seed';

describe('seed de exemplo', () => {
  const seed = buildExampleSeed(1_700_000_000_000);

  it('cria 3 categorias e 17 notas no total', () => {
    expect(seed.count).toBe(17);
    expect(seed.rootIds).toHaveLength(3);
    expect(seed.notes.filter((n) => n.parentId === null)).toHaveLength(3);
  });

  it('não gera ids duplicados', () => {
    const ids = seed.notes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ordena os irmãos por orderKey', () => {
    for (const note of seed.notes) {
      const siblings = seed.notes.filter((s) => s.parentId === note.parentId);
      const keys = siblings.map((s) => s.orderKey);
      expect([...keys].sort()).toEqual(keys);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('todos os wikilinks do seed resolvem para notas existentes', () => {
    const ids = new Set(seed.notes.map((n) => n.id));
    expect(seed.links.length).toBeGreaterThan(0);
    for (const link of seed.links) {
      expect(link.toId).not.toBeNull();
      expect(ids.has(link.toId as string)).toBe(true);
      expect(ids.has(link.fromId)).toBe(true);
    }
  });

  it('preenche conteúdo e texto puro', () => {
    const cafe = seed.notes.find((n) => n.title === 'Cafe');
    expect(cafe?.contentText).toContain('Cappuccino');
    expect(cafe?.tags).toEqual(['cafeina']);
    const categoria = seed.notes.find((n) => n.title === 'Comida');
    expect(categoria?.contentText).toContain('Tudo sobre');
    expect(categoria?.icon).toBe('utensils');
  });

  it('marca ids de categoria como raízes navegáveis', () => {
    const index = buildIndex(seed.notes);
    for (const rootId of seed.rootIds) {
      expect(index.get(rootId)?.parentId).toBeNull();
    }
  });

  it('gera um seed de stress com 5.000 notas e estrutura valida', () => {
    const stress = buildStressSeed(5000, 5, 1_700_000_000_000);

    expect(stress.count).toBe(5000);
    expect(stress.rootIds).toHaveLength(5);
    expect(stress.notes.filter((note) => note.parentId === null)).toHaveLength(5);
    expect(new Set(stress.notes.map((note) => note.id)).size).toBe(stress.count);

    const index = buildIndex(stress.notes);
    for (const rootId of stress.rootIds) {
      expect(index.get(rootId)?.parentId).toBeNull();
    }
  });
});
