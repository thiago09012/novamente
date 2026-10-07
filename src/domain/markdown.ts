import { ulid } from 'ulid';

import { EMPTY_DOC, docToPlainText } from './content';
import { normalizeTags } from './tags';
import { MAX_TITLE_LENGTH } from './constants';
import type { ID, Note, NoteContentNode } from './types';

/** Frontmatter e corpo markdown — codec puro para o vault da IA. */

export interface ParsedMarkdownNote {
  id: ID | null;
  parentId: ID | null;
  orderKey: string | null;
  title: string;
  tags: string[];
  icon: string | null;
  color: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  content: NoteContentNode;
}

export interface MarkdownFile {
  path: string;
  markdown: string;
}

/** Slug de arquivo seguro (sem acento, sem path traversal). */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'nota';
}

function escapeYamlString(value: string): string {
  if (value === '') return "''";
  if (/[:#{}[\],&*?|<>=!%@`"'\\]/u.test(value) || /^\s|\s$/u.test(value)) {
    return `'${value.replace(/'/gu, "''")}'`;
  }
  return value;
}

function parseYamlScalar(raw: string): string {
  const value = raw.trim();
  if (
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2) ||
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2)
  ) {
    const inner = value.slice(1, -1);
    return value.startsWith("'") ? inner.replace(/''/gu, "'") : inner.replace(/\\(\\|")/gu, '$1');
  }
  return value;
}

function parseTagsValue(raw: string): string[] {
  const value = raw.trim();
  if (value === '' || value === '[]') return [];
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(',')
      .map((part) => parseYamlScalar(part.trim()))
      .filter(Boolean);
  }
  return value
    .split(',')
    .map((part) => parseYamlScalar(part.trim()))
    .filter(Boolean);
}

function parseFrontmatter(markdown: string): { data: Record<string, unknown>; body: string } {
  const normalized = markdown.replace(/\r\n?/gu, '\n');
  if (!normalized.startsWith('---\n')) return { data: {}, body: normalized };
  const end = normalized.indexOf('\n---', 4);
  if (end < 0) return { data: {}, body: normalized };
  const header = normalized.slice(4, end);
  let body = normalized.slice(end + 4);
  if (body.startsWith('\n')) body = body.slice(1);
  const data: Record<string, unknown> = {};
  for (const line of header.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/u);
    if (!match) continue;
    const key = match[1];
    const raw = match[2];
    if (key === 'tags') data.tags = parseTagsValue(raw);
    else if (key === 'parentId' || key === 'id' || key === 'orderKey' || key === 'icon' || key === 'color') {
      const parsed = parseYamlScalar(raw);
      if (parsed === 'null' || parsed === '~' || parsed === '') data[key] = key === 'parentId' || key === 'color' ? null : parsed;
      else data[key] = parsed;
    } else if (key === 'createdAt' || key === 'updatedAt') {
      const parsed = Number(parseYamlScalar(raw));
      data[key] = Number.isFinite(parsed) ? parsed : null;
    } else {
      data[key] = parseYamlScalar(raw);
    }
  }
  return { data, body };
}

export function serializeFrontmatter(note: {
  id: ID;
  parentId: ID | null;
  orderKey: string;
  title: string;
  tags: string[];
  icon: string;
  color: string | null;
  createdAt: number;
  updatedAt: number;
}): string {
  const tags = note.tags.length > 0 ? `[${note.tags.map((tag) => escapeYamlString(tag)).join(', ')}]` : '[]';
  const lines = [
    '---',
    `id: ${note.id}`,
    `parentId: ${note.parentId === null ? 'null' : note.parentId}`,
    `orderKey: ${escapeYamlString(note.orderKey)}`,
    `title: ${escapeYamlString(note.title)}`,
    `tags: ${tags}`,
    `icon: ${escapeYamlString(note.icon)}`,
    `color: ${note.color === null ? 'null' : escapeYamlString(note.color)}`,
    `createdAt: ${note.createdAt}`,
    `updatedAt: ${note.updatedAt}`,
    '---',
  ];
  return lines.join('\n');
}

function serializeInlineNodes(nodes: readonly NoteContentNode[] | undefined): string {
  if (!nodes || nodes.length === 0) return '';
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      const marks = node.marks ?? [];
      const hasCode = marks.some((mark) => mark.type === 'code');
      if (hasCode) {
        out += `\`${(node.text ?? '').replace(/`/gu, '\\`')}\``;
      } else {
        let text = (node.text ?? '')
          .replace(/\\/gu, '\\\\')
          .replace(/\*/gu, '\\*')
          .replace(/_/gu, '\\_')
          .replace(/`/gu, '\\`');
        if (marks.some((mark) => mark.type === 'bold')) text = `**${text}**`;
        if (marks.some((mark) => mark.type === 'italic')) text = `*${text}*`;
        out += text;
      }
      continue;
    }
    if (node.type === 'hardBreak') {
      out += '\n';
      continue;
    }
    if (node.type === 'wikilink') {
      const title = typeof node.attrs?.title === 'string' ? node.attrs.title : '';
      out += `[[${title.replace(/[\r\n\]]/gu, ' ')}]]`;
      continue;
    }
    out += serializeInlineNodes(node.content);
  }
  return out;
}

function serializeBlocks(blocks: readonly NoteContentNode[] | undefined, listPrefix = ''): string[] {
  if (!blocks || blocks.length === 0) return [];
  const lines: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case 'paragraph': {
        const text = serializeInlineNodes(block.content).trim();
        if (text) lines.push(`${listPrefix}${text}`);
        else if (listPrefix) lines.push(listPrefix.trimEnd());
        break;
      }
      case 'heading': {
        const level = Math.min(Math.max(Number(block.attrs?.level) || 1, 1), 6);
        const text = serializeInlineNodes(block.content).trim();
        lines.push(`${listPrefix}${'#'.repeat(level)} ${text}`.trimEnd());
        break;
      }
      case 'blockquote': {
        const inner = serializeBlocks(block.content);
        for (const line of inner) lines.push(`${listPrefix}> ${line}`.trimEnd());
        if (inner.length === 0) lines.push(`${listPrefix}>`.trimEnd());
        break;
      }
      case 'codeBlock': {
        const language = typeof block.attrs?.language === 'string' ? block.attrs.language : '';
        const code = (block.content ?? []).map((child) => child.text ?? '').join('\n');
        lines.push(`${listPrefix}\`\`\`${language}`);
        for (const line of code.split('\n')) lines.push(`${listPrefix}${line}`);
        lines.push(`${listPrefix}\`\`\``);
        break;
      }
      case 'horizontalRule':
        lines.push(`${listPrefix}---`);
        break;
      case 'bulletList':
      case 'orderedList':
      case 'taskList': {
        let orderedIndex = 1;
        for (const item of block.content ?? []) {
          const checked = item.type === 'taskItem' ? item.attrs?.checked === true : false;
          const marker =
            block.type === 'orderedList'
              ? `${orderedIndex}. `
              : item.type === 'taskItem'
                ? checked
                  ? '- [x] '
                  : '- [ ] '
                : '- ';
          orderedIndex += 1;
          const itemLines = serializeBlocks(item.content, `${listPrefix}${marker}`);
          if (itemLines.length === 0) lines.push(`${listPrefix}${marker}`.trimEnd());
          else lines.push(...itemLines);
        }
        break;
      }
      case 'listItem':
      case 'taskItem': {
        const itemLines = serializeBlocks(block.content, `${listPrefix}- `);
        if (itemLines.length === 0) lines.push(`${listPrefix}- `.trimEnd());
        else lines.push(...itemLines);
        break;
      }
      default: {
        const text = serializeInlineNodes(block.content).trim();
        if (text) lines.push(`${listPrefix}${text}`);
        break;
      }
    }
  }
  return lines;
}

/** TipTap JSON → corpo markdown. */
export function tipTapToMarkdown(doc: NoteContentNode | null | undefined): string {
  if (!doc || doc.type !== 'doc') return '';
  return serializeBlocks(doc.content).join('\n').replace(/\n{3,}/gu, '\n\n').trim();
}

/** Nota → arquivo markdown completo (frontmatter + corpo). */
export function noteToMarkdown(note: Note): string {
  const front = serializeFrontmatter({
    id: note.id,
    parentId: note.parentId,
    orderKey: note.orderKey,
    title: note.title,
    tags: note.tags,
    icon: note.icon,
    color: note.color,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  });
  const body = tipTapToMarkdown(note.content);
  return body ? `${front}\n\n${body}\n` : `${front}\n`;
}

function parseInline(text: string): NoteContentNode[] {
  const nodes: NoteContentNode[] = [];
  let rest = text;
  let plain = '';

  const flush = () => {
    if (plain) {
      nodes.push({ type: 'text', text: plain });
      plain = '';
    }
  };

  while (rest.length > 0) {
    const wiki = rest.match(/^\[\[([^\]]+)\]\]/u);
    if (wiki) {
      flush();
      nodes.push({ type: 'wikilink', attrs: { noteId: null, title: wiki[1].trim(), sourceId: null } });
      rest = rest.slice(wiki[0].length);
      continue;
    }
    const bold = rest.match(/^\*\*([\s\S]+?)\*\*/u);
    if (bold) {
      flush();
      const inner = parseInline(bold[1]);
      for (const node of inner) {
        nodes.push({
          ...node,
          marks: [...(node.marks ?? []), { type: 'bold' }],
        });
      }
      rest = rest.slice(bold[0].length);
      continue;
    }
    const italic = rest.match(/^\*([^*]+)\*/u);
    if (italic) {
      flush();
      const inner = parseInline(italic[1]);
      for (const node of inner) {
        nodes.push({
          ...node,
          marks: [...(node.marks ?? []), { type: 'italic' }],
        });
      }
      rest = rest.slice(italic[0].length);
      continue;
    }
    const code = rest.match(/^`([^`]+)`/u);
    if (code) {
      flush();
      nodes.push({
        type: 'text',
        text: code[1],
        marks: [{ type: 'code' }],
      });
      rest = rest.slice(code[0].length);
      continue;
    }
    const escape = rest.match(/^\\(.)/u);
    if (escape) {
      plain += escape[1];
      rest = rest.slice(escape[0].length);
      continue;
    }
    plain += rest[0];
    rest = rest.slice(1);
  }
  flush();
  return nodes.length > 0 ? nodes : [];
}

function paragraphFromText(text: string): NoteContentNode {
  const content = parseInline(text);
  return { type: 'paragraph', content };
}

function parseListBlock(lines: string[], startIndex: number): { node: NoteContentNode; next: number } {
  const first = lines[startIndex];
  const taskMatch = first.match(/^(\s*)- \[([ xX])\]\s*(.*)$/u);
  const bulletMatch = first.match(/^(\s*)[-*+]\s+(.*)$/u);
  const orderedMatch = first.match(/^(\s*)(\d+)[.)]\s+(.*)$/u);
  const isTask = Boolean(taskMatch);
  const isOrdered = Boolean(orderedMatch) && !isTask;
  const listType = isTask ? 'taskList' : isOrdered ? 'orderedList' : 'bulletList';
  const baseIndent = (taskMatch?.[1] ?? bulletMatch?.[1] ?? orderedMatch?.[1] ?? '').length;

  const items: NoteContentNode[] = [];
  let i = startIndex;
  let currentItemLines: string[] = [];
  let currentChecked = false;
  let itemOpen = false;

  const pushItem = () => {
    if (!itemOpen) return;
    const innerText = currentItemLines.join('\n').trim();
    const item: NoteContentNode = {
      type: isTask ? 'taskItem' : 'listItem',
      ...(isTask ? { attrs: { checked: currentChecked } } : {}),
      content: innerText ? [paragraphFromText(innerText)] : [],
    };
    items.push(item);
    currentItemLines = [];
    itemOpen = false;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      const next = lines[i + 1];
      const nextIsItem =
        next !== undefined &&
        (/^\s*([-*+]|\d+[.)])\s+/u.test(next) || /^\s*- \[[ xX]\]/u.test(next)) &&
        (next.match(/^\s*/u)?.[0].length ?? 0) >= baseIndent;
      if (nextIsItem) {
        i += 1;
        continue;
      }
      break;
    }
    const indent = line.match(/^\s*/u)?.[0].length ?? 0;
    if (indent < baseIndent) break;
    const isItemStart =
      indent === baseIndent &&
      (/^\s*- \[[ xX]\]/u.test(line) || /^\s*([-*+]|\d+[.)])\s+/u.test(line));
    if (isItemStart) {
      pushItem();
      const task = line.match(/^(\s*)- \[([ xX])\]\s*(.*)$/u);
      itemOpen = true;
      if (task) {
        currentChecked = task[2].toLowerCase() === 'x';
        currentItemLines = [task[3]];
      } else {
        currentChecked = false;
        const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/u);
        const ordered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/u);
        currentItemLines = [bullet?.[2] ?? ordered?.[3] ?? ''];
      }
      i += 1;
      continue;
    }
    if (indent > baseIndent) {
      if (!itemOpen) {
        itemOpen = true;
        currentChecked = false;
      }
      currentItemLines.push(line.slice(baseIndent));
      i += 1;
      continue;
    }
    break;
  }
  pushItem();

  return {
    node: { type: listType, content: items },
    next: i,
  };
}

/** Corpo markdown → TipTap JSON (subconjunto estável do vault). */
export function markdownToTipTap(markdown: string): NoteContentNode {
  const lines = markdown.replace(/\r\n?/gu, '\n').split('\n');
  const blocks: NoteContentNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = line.match(/^```(\S*)\s*$/u);
    if (fence) {
      const language = fence[1] || '';
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/u.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({
        type: 'codeBlock',
        attrs: language ? { language } : {},
        content: codeLines.length > 0 ? [{ type: 'text', text: codeLines.join('\n') }] : [],
      });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/u);
    if (heading) {
      blocks.push({
        type: 'heading',
        attrs: { level: heading[1].length },
        content: parseInline(heading[2].replace(/\s+#+\s*$/u, '')),
      });
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/u.test(line.trim())) {
      blocks.push({ type: 'horizontalRule' });
      i += 1;
      continue;
    }

    if (/^\s*>\s?/u.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^\s*>\s?/u.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/u, ''));
        i += 1;
      }
      const inner = markdownToTipTap(quoteLines.join('\n'));
      blocks.push({
        type: 'blockquote',
        content: inner.type === 'doc' ? (inner.content ?? []) : [inner],
      });
      continue;
    }

    if (/^\s*([-*+]|\d+[.)])\s+/u.test(line) || /^\s*- \[[ xX]\]/u.test(line)) {
      const { node, next } = parseListBlock(lines, i);
      blocks.push(node);
      i = next;
      continue;
    }

    const paragraphLines: string[] = [line.trim()];
    i += 1;
    while (i < lines.length) {
      const nextLine = lines[i];
      if (!nextLine.trim()) break;
      if (/^(#{1,6})\s+/u.test(nextLine)) break;
      if (/^```/u.test(nextLine)) break;
      if (/^\s*>\s?/u.test(nextLine)) break;
      if (/^\s*([-*+]|\d+[.)])\s+/u.test(nextLine) || /^\s*- \[[ xX]\]/u.test(nextLine)) break;
      if (/^(-{3,}|\*{3,}|_{3,})\s*$/u.test(nextLine.trim())) break;
      paragraphLines.push(nextLine.trim());
      i += 1;
    }
    blocks.push(paragraphFromText(paragraphLines.join(' ')));
  }

  return { type: 'doc', content: blocks };
}

/** Arquivo markdown completo → nota (sem id/parent se ausentes no frontmatter).
 *  `base` é a nota do app: campos ausentes no frontmatter herd dela (ex.: IA reescreveu o arquivo). */
export function markdownToNote(markdown: string, base?: Note | null): ParsedMarkdownNote {
  const { data, body } = parseFrontmatter(markdown);
  const content = markdownToTipTap(body);
  const title =
    typeof data.title === 'string' && data.title.trim()
      ? data.title.trim().slice(0, MAX_TITLE_LENGTH)
      : firstHeadingTitle(body) ?? base?.title ?? 'Sem título';
  const tags = Array.isArray(data.tags)
    ? normalizeTags(data.tags.filter((tag): tag is string => typeof tag === 'string'))
    : base
      ? [...base.tags]
      : [];
  const id = typeof data.id === 'string' && data.id.length > 0 ? data.id : null;
  const parentIdRaw = data.parentId;
  const parentId =
    parentIdRaw === null || parentIdRaw === undefined || parentIdRaw === 'null' || parentIdRaw === ''
      ? null
      : typeof parentIdRaw === 'string'
        ? parentIdRaw
        : null;
  const icon =
    typeof data.icon === 'string' && data.icon ? data.icon : base?.icon ?? null;
  const color = typeof data.color === 'string' && data.color ? data.color : base?.color ?? null;
  return {
    id,
    parentId,
    orderKey:
      typeof data.orderKey === 'string' && data.orderKey ? data.orderKey : base?.orderKey ?? null,
    title,
    tags,
    icon,
    color,
    createdAt:
      typeof data.createdAt === 'number' && Number.isFinite(data.createdAt)
        ? data.createdAt
        : base?.createdAt ?? null,
    updatedAt:
      typeof data.updatedAt === 'number' && Number.isFinite(data.updatedAt)
        ? data.updatedAt
        : base?.updatedAt ?? null,
    content,
  };
}

function firstHeadingTitle(body: string): string | null {
  const match = body.match(/^#{1,6}\s+(.+)$/mu);
  return match ? match[1].trim().slice(0, MAX_TITLE_LENGTH) : null;
}

/** Resolve `[[Título]]` para ids (first match vivo wins). */
export function resolveWikilinkTitles(
  notes: readonly Note[],
): Map<string, ID> {
  const byTitle = new Map<string, ID>();
  for (const note of notes) {
    const key = note.title.trim().toLowerCase();
    if (key && !byTitle.has(key)) byTitle.set(key, note.id);
  }
  return byTitle;
}

/** Preenche noteId nos wikilinks de um conteúdo, usando título→id. */
export function linkifyContent(
  doc: NoteContentNode,
  titleToId: ReadonlyMap<string, ID>,
  sourceId: ID | null,
): NoteContentNode {
  const mapNode = (node: NoteContentNode): NoteContentNode => {
    if (node.type === 'wikilink') {
      const title = typeof node.attrs?.title === 'string' ? node.attrs.title : '';
      const noteId = titleToId.get(title.trim().toLowerCase()) ?? null;
      return {
        ...node,
        attrs: { ...(node.attrs ?? {}), noteId, title, sourceId: sourceId ?? node.attrs?.sourceId ?? null },
      };
    }
    if (node.marks?.some((mark) => mark.type === 'wikilink')) {
      return {
        ...node,
        marks: node.marks.map((mark) => {
          if (mark.type !== 'wikilink') return mark;
          const title =
            typeof mark.attrs?.title === 'string'
              ? mark.attrs.title
              : typeof node.text === 'string'
                ? node.text
                : '';
          const noteId = titleToId.get(title.trim().toLowerCase()) ?? null;
          return { ...mark, attrs: { ...(mark.attrs ?? {}), noteId, title } };
        }),
      };
    }
    if (node.content) {
      return { ...node, content: node.content.map(mapNode) };
    }
    return node;
  };
  return mapNode(doc);
}

/** Converte nota do vault em Note completo (ids ausentes são gerados). */
export function parsedToNote(
  parsed: ParsedMarkdownNote,
  fallback: { id?: ID; parentId?: ID | null; orderKey?: string; now: number },
): Note {
  const id = parsed.id ?? fallback.id ?? ulid();
  const parentId = parsed.parentId !== undefined ? parsed.parentId : (fallback.parentId ?? null);
  const orderKey = parsed.orderKey ?? fallback.orderKey ?? 'a0';
  const contentText = docToPlainText(parsed.content);
  return {
    id,
    parentId,
    orderKey,
    title: parsed.title,
    content: parsed.content.type === 'doc' ? parsed.content : EMPTY_DOC,
    contentText,
    icon: parsed.icon ?? (parentId === null ? 'folder' : 'circle'),
    color: parsed.color ?? null,
    tags: parsed.tags,
    createdAt: parsed.createdAt ?? fallback.now,
    updatedAt: parsed.updatedAt ?? fallback.now,
    deletedAt: null,
    deletedRootId: null,
  };
}
