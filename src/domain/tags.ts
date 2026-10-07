import { MAX_TAG_LENGTH, MAX_TAGS } from './constants';

export interface TagOptions {
  /** Remove acentos (configuração do usuário). */
  stripAccents?: boolean;
}

/** Normaliza uma tag: minúsculas, sem '#', sem espaços, sem acento opcional. */
export function normalizeTag(raw: string, options: TagOptions = {}): string {
  let tag = raw.trim().replace(/^#+/, '').replace(/\s+/g, '-');
  if (options.stripAccents) tag = stripAccents(tag);
  tag = tag.toLowerCase();
  if (tag.length > MAX_TAG_LENGTH) tag = tag.slice(0, MAX_TAG_LENGTH);
  return tag;
}

/** Normaliza, deduplica e respeita os limites (30 tags por nota). */
export function normalizeTags(raw: readonly string[], options: TagOptions = {}): string[] {
  const result: string[] = [];
  for (const item of raw) {
    const tag = normalizeTag(item, options);
    if (tag && !result.includes(tag)) result.push(tag);
    if (result.length >= MAX_TAGS) break;
  }
  return result;
}

/** A normalização é compatível com busca tolerante a acentos. */
export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '');
}

/** Forma sem acento usada pelo índice de busca (não altera o dado armazenado). */
export function searchableTag(tag: string): string {
  return stripAccents(tag.toLowerCase());
}
