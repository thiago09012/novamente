import { generateNKeysBetween } from 'fractional-indexing';
import { ulid } from 'ulid';

import { docToPlainText } from './content';
import { defaultSettings } from './settings';
import { normalizeTags } from './tags';
import { isAlive } from './tree';
import type { ID, Note, NoteContentNode, Settings } from './types';
import { createBackup, type BackupFile } from './backup';

interface OutlineEntry {
  title: string;
  body: string[];
  tags: string[];
  children: OutlineEntry[];
  depth: number;
}

function aliveTree(notes: readonly Note[]): Map<ID | null, Note[]> {
  const children = new Map<ID | null, Note[]>();
  for (const note of notes) {
    if (!isAlive(note)) continue;
    const bucket = children.get(note.parentId) ?? [];
    bucket.push(note);
    children.set(note.parentId, bucket);
  }
  for (const bucket of children.values()) bucket.sort((a, b) => a.orderKey.localeCompare(b.orderKey));
  return children;
}

function escapeMarkdownLine(line: string): string {
  if (/^\s*(?:#{1,6}\s|<!-- mente:)/u.test(line)) return `\\${line}`;
  return line;
}

export function exportMarkdown(notes: readonly Note[]): string {
  const children = aliveTree(notes);
  const lines = ['<!-- MENTE Markdown exchange v1 -->'];
  const write = (siblings: Note[], depth: number) => {
    for (const note of siblings) {
      const headingLevel = Math.min(depth + 1, 6);
      lines.push(`<!-- mente:depth=${depth} -->`);
      lines.push(`<!-- mente:tags=${JSON.stringify(note.tags)} -->`);
      lines.push(`${'#'.repeat(headingLevel)} ${note.title.replace(/[\r\n]+/gu, ' ')}`);
      const body = note.contentText.split('\n').map(escapeMarkdownLine);
      if (body.some((line) => line.length > 0)) lines.push('', ...body);
      lines.push('');
      write(children.get(note.id) ?? [], depth + 1);
    }
  };
  write(children.get(null) ?? [], 0);
  return `${lines.join('\n').trimEnd()}\n`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/"/gu, '&quot;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;');
}

export function exportOpml(notes: readonly Note[]): string {
  const children = aliveTree(notes);
  const write = (siblings: Note[]): string =>
    siblings
      .map((note) => {
        const attributes = [
          `text="${escapeXml(note.title)}"`,
          `mente:content="${escapeXml(JSON.stringify(note.contentText))}"`,
          `mente:tags="${escapeXml(JSON.stringify(note.tags))}"`,
        ].join(' ');
        const nested = write(children.get(note.id) ?? []);
        return nested
          ? `<outline ${attributes}>${nested}</outline>`
          : `<outline ${attributes} />`;
      })
      .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0" xmlns:mente="urn:mente:exchange:v1"><head><title>MENTE</title></head><body>${write(children.get(null) ?? [])}</body></opml>\n`;
}

function parseMarkdown(text: string): OutlineEntry[] {
  const roots: OutlineEntry[] = [];
  const stack: OutlineEntry[] = [];
  let nextDepth: number | null = null;
  let nextTags: string[] = [];

  for (const rawLine of text.replace(/\r\n?/gu, '\n').split('\n')) {
    const depthMarker = rawLine.match(/^\s*<!-- mente:depth=(\d+) -->\s*$/u);
    if (depthMarker) {
      nextDepth = Number(depthMarker[1]);
      continue;
    }
    const tagsMarker = rawLine.match(/^\s*<!-- mente:tags=(.*?) -->\s*$/u);
    if (tagsMarker) {
      try {
        const parsed: unknown = JSON.parse(tagsMarker[1]);
        nextTags = Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : [];
      } catch {
        nextTags = [];
      }
      continue;
    }
    if (/^\s*<!-- MENTE Markdown exchange/u.test(rawLine)) continue;

    const heading = rawLine.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/u);
    if (heading) {
      const depth = nextDepth ?? heading[1].length - 1;
      const entry: OutlineEntry = {
        title: heading[2].trim(),
        body: [],
        tags: normalizeTags(nextTags),
        children: [],
        depth,
      };
      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
      const parent = stack[stack.length - 1];
      if (parent) parent.children.push(entry);
      else roots.push(entry);
      stack.push(entry);
      nextDepth = null;
      nextTags = [];
      continue;
    }

    if (stack.length > 0) {
      const line = rawLine.replace(/^\\(?=\s*(?:#{1,6}\s|<!-- mente:))/u, '');
      stack[stack.length - 1].body.push(line);
    } else if (rawLine.trim()) {
      roots.push({ title: 'Importado', body: [rawLine], tags: [], children: [], depth: 0 });
      stack.push(roots[roots.length - 1]);
    }
  }

  return roots;
}

function parseOpml(text: string): OutlineEntry[] {
  if (typeof DOMParser === 'undefined') throw new Error('Importação OPML indisponível neste ambiente.');
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.querySelector('parsererror') || document.documentElement.localName !== 'opml') {
    throw new Error('Arquivo OPML inválido.');
  }
  const body = document.querySelector('body');
  if (!body) throw new Error('Arquivo OPML sem corpo de outlines.');

  const readContent = (value: string | null): string => {
    if (!value) return '';
    try {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // OPML externo pode trazer texto simples em `mente:content`.
    }
    return value;
  };

  const readOutlines = (parent: Element, depth: number): OutlineEntry[] =>
    [...parent.children]
      .filter((element) => element.localName === 'outline')
      .map((element) => {
        let tags: string[] = [];
        try {
          const parsed: unknown = JSON.parse(element.getAttribute('mente:tags') ?? '[]');
          if (Array.isArray(parsed)) tags = normalizeTags(parsed.filter((tag): tag is string => typeof tag === 'string'));
        } catch {
          tags = [];
        }
        return {
          title: element.getAttribute('text') ?? element.getAttribute('title') ?? '',
          body: [readContent(element.getAttribute('mente:content'))],
          tags,
          children: readOutlines(element, depth + 1),
          depth,
        };
      });
  return readOutlines(body, 0);
}

function textDocument(text: string): NoteContentNode {
  const paragraphs = text
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] }));
  return { type: 'doc', content: paragraphs };
}

function makeNotes(outlines: OutlineEntry[], now: number): Note[] {
  const notes: Note[] = [];
  const write = (entries: OutlineEntry[], parentId: ID | null) => {
    const orderKeys = generateNKeysBetween(null, null, entries.length);
    entries.forEach((entry, index) => {
      const id = ulid();
      const contentText = entry.body.join('\n').trim();
      notes.push({
        id,
        parentId,
        orderKey: orderKeys[index],
        title: entry.title,
        content: textDocument(contentText),
        contentText: docToPlainText(textDocument(contentText)),
        icon: parentId === null ? 'folder' : 'circle',
        color: null,
        tags: normalizeTags(entry.tags),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        deletedRootId: null,
      });
      write(entry.children, id);
    });
  };
  write(outlines, null);
  return notes;
}

export function importTextBackup(
  format: 'markdown' | 'opml',
  text: string,
  settings: Settings = defaultSettings(),
  now = Date.now(),
): BackupFile {
  const outlines = format === 'markdown' ? parseMarkdown(text) : parseOpml(text);
  if (outlines.length === 0) throw new Error('O arquivo não contém notas para importar.');
  const notes = makeNotes(outlines, now);
  const rootIds = notes.filter((note) => note.parentId === null).map((note) => note.id);
  const roots = new Set(rootIds);
  return createBackup({
    notes,
    links: [],
    settings: {
      ...settings,
      lastCategoryId: settings.lastCategoryId && roots.has(settings.lastCategoryId)
        ? settings.lastCategoryId
        : rootIds[0] ?? null,
    },
    views: [],
    meta: [{ key: 'exampleRootIds', value: rootIds }],
  }, now);
}