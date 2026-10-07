import { excerptAround, extractWikilinks } from './content';
import type { ID, Link, Note, NoteContentNode } from './types';
import { isAlive, type NoteIndex } from './tree';

/** Reconstrói as linhas de link de uma nota (uma transação junto com o save). */
export function buildLinks(fromId: ID, doc: NoteContentNode, genId: () => ID): Link[] {
  return extractWikilinks(doc).map((entry) => ({
    id: genId(),
    fromId,
    toId: entry.toId,
    toTitle: entry.toTitle,
  }));
}

/**
 * Um link só é resolvido se o alvo existir e estiver vivo.
 * Links para notas excluídas aparecem como não resolvidos e voltam a
 * resolver sozinhos quando a nota é restaurada (por id).
 */
export function isLinkResolved(link: Link, index: NoteIndex): boolean {
  if (!link.toId) return false;
  const target = index.get(link.toId);
  return target !== undefined && isAlive(target);
}

export interface Backlink {
  fromId: ID;
  fromTitle: string;
  context: string | null;
}

/** Notas que linkam para `targetId`, com trecho de contexto (±60 caracteres). */
export function collectBacklinks(
  links: readonly Link[],
  targetId: ID,
  index: NoteIndex,
): Backlink[] {
  const result: Backlink[] = [];
  const seen = new Set<ID>();
  for (const link of links) {
    if (link.toId !== targetId || seen.has(link.fromId)) continue;
    const source = index.get(link.fromId);
    if (!source || !isAlive(source)) continue;
    seen.add(link.fromId);
    result.push({
      fromId: source.id,
      fromTitle: source.title,
      context: excerptAround(source.contentText, index.get(targetId)?.title ?? ''),
    });
  }
  return result;
}

/** Título exibido de um link (o texto vem do título atual da nota alvo). */
export function linkDisplayTitle(link: Link, index: NoteIndex): string {
  const target = link.toId ? index.get(link.toId) : undefined;
  return target && isAlive(target) ? target.title : link.toTitle;
}

/** Links partindo de uma nota. */
export function linksFrom(links: readonly Link[], fromId: ID): Link[] {
  return links.filter((link) => link.fromId === fromId);
}

/** Deriva o mapa de links a partir de notas (usado na importação e nos testes). */
export function linksForNotes(notes: readonly Note[], genId: () => ID): Link[] {
  const links: Link[] = [];
  for (const note of notes) links.push(...buildLinks(note.id, note.content, genId));
  return links;
}
