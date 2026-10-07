import type { ID, NoteContentNode } from './types';

export const EMPTY_DOC: NoteContentNode = { type: 'doc', content: [] };

const BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'listItem',
  'codeBlock',
  'horizontalRule',
  'tableRow',
  'tableCell',
  'tableHeader',
]);

/** Entrada de link wikilink achada no conteúdo. */
export interface ContentLink {
  toId: ID | null;
  toTitle: string;
}

export function isEmptyDoc(doc: NoteContentNode | null | undefined): boolean {
  if (!doc || doc.type !== 'doc') return true;
  if (!doc.content || doc.content.length === 0) return true;
  return doc.content.every((child) => isEmptyBlock(child));
}

function isEmptyBlock(node: NoteContentNode): boolean {
  if (typeof node.text === 'string' && node.text.length > 0) return false;
  if (node.type === 'horizontalRule') return false;
  if (!node.content || node.content.length === 0) return true;
  return node.content.every((child) => isEmptyBlock(child));
}

/** Conteúdo inválido (banco corrompido/importação) vira documento vazio, nunca quebra. */
export function normalizeDoc(input: unknown): NoteContentNode {
  if (typeof input !== 'object' || input === null) return EMPTY_DOC;
  const doc = input as NoteContentNode;
  if (doc.type !== 'doc') return EMPTY_DOC;
  if (doc.content !== undefined && !Array.isArray(doc.content)) return EMPTY_DOC;
  return doc;
}

/** Texto puro do documento (busca e trecho de backlinks). */
export function docToPlainText(doc: NoteContentNode | null | undefined): string {
  if (!doc || !doc.content) return '';
  const parts: string[] = [];
  walk(doc, (node) => {
    if (node.type === 'wikilink') {
      const title = node.attrs?.title;
      if (typeof title === 'string') parts.push(title);
    } else if (typeof node.text === 'string') parts.push(node.text);
    else if (BLOCK_TYPES.has(node.type)) parts.push('\n');
  });
  return parts
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

function walk(node: NoteContentNode, visit: (node: NoteContentNode) => void): void {
  visit(node);
  for (const child of node.content ?? []) walk(child, visit);
}

/** Extrai os wikilinks do documento (ordem de leitura, duplicatas preservadas). */
export function extractWikilinks(doc: NoteContentNode | null | undefined): ContentLink[] {
  const links: ContentLink[] = [];
  if (!doc) return links;
  walk(doc, (node) => {
    if (node.type === 'wikilink') {
      const attrs = node.attrs ?? {};
      const toId = typeof attrs.noteId === 'string' && attrs.noteId.length > 0 ? attrs.noteId : null;
      const toTitle = typeof attrs.title === 'string' ? attrs.title : '';
      links.push({ toId, toTitle });
    }
    for (const mark of node.marks ?? []) {
      if (mark.type !== 'wikilink') continue;
      const attrs = mark.attrs ?? {};
      const toId =
        typeof attrs.noteId === 'string' && attrs.noteId.length > 0 ? attrs.noteId : null;
      const toTitle = typeof attrs.title === 'string' ? attrs.title : (node.text ?? '');
      links.push({ toId, toTitle });
    }
  });
  return links;
}

export interface RemapTarget {
  id: ID;
  title: string;
}

/**
 * Reaponta os links internos de um documento para novos ids
 * (usado na duplicação de um subtree).
 */
export function remapDocLinks(
  doc: NoteContentNode,
  map: ReadonlyMap<ID, RemapTarget>,
): NoteContentNode {
  const clone = (node: NoteContentNode): NoteContentNode => {
    const next: NoteContentNode = { ...node };
    if (node.type === 'wikilink') {
      const noteId = typeof node.attrs?.noteId === 'string' ? node.attrs.noteId : null;
      const target = noteId ? map.get(noteId) : undefined;
      if (target) next.attrs = { ...node.attrs, noteId: target.id, title: target.title };
    }
    if (node.marks) {
      next.marks = node.marks.map((mark) => {
        if (mark.type !== 'wikilink') return mark;
        const noteId = typeof mark.attrs?.noteId === 'string' ? mark.attrs.noteId : null;
        const target = noteId ? map.get(noteId) : undefined;
        if (!target) return mark;
        return { ...mark, attrs: { ...mark.attrs, noteId: target.id, title: target.title } };
      });
    }
    if (node.content) next.content = node.content.map(clone);
    return next;
  };
  return clone(doc);
}

/** Trecho de ±`radius` caracteres ao redor do primeiro termo encontrado. */
export function excerptAround(text: string, term: string, radius = 60): string | null {
  if (!term) return null;
  const at = stripForSearch(text).indexOf(stripForSearch(term));
  if (at < 0) return null;
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + term.length + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

function stripForSearch(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
