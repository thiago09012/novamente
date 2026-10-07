import { generateNKeysBetween } from 'fractional-indexing';
import { ulid } from 'ulid';

import { EMPTY_DOC, docToPlainText } from '@/domain/content';
import { buildLinks } from '@/domain/links';
import { normalizeTags } from '@/domain/tags';
import type { ID, Link, Note, NoteContentNode } from '@/domain/types';

interface SeedSpec {
  title: string;
  icon?: string;
  tags?: string[];
  /** Título de outras notas do seed para as quais esta linka. */
  links?: string[];
  text?: string;
  children?: SeedSpec[];
}

/** Árvore de exemplo da primeira execução (apagável de uma vez). */
const EXAMPLE_TREE: SeedSpec[] = [
  {
    title: 'Comida',
    icon: 'utensils',
    text: 'Tudo sobre o que a gente come.',
    children: [
      {
        title: 'Doce',
        icon: 'cake',
        tags: ['sobremesa'],
        links: ['Brigadeiro'],
        children: [
          {
            title: 'Brigadeiro',
            icon: 'candy',
            tags: ['receita'],
            links: ['Brigadeiro de Microondas'],
            children: [
              {
                title: 'Brigadeiro de Microondas',
                icon: 'zap',
                tags: ['rapido'],
                text: '3 min no micro-ondas.',
              },
            ],
          },
        ],
      },
      {
        title: 'Salgada',
        icon: 'pizza',
        tags: ['salgado'],
        links: ['Pao'],
        children: [
          {
            title: 'Pao',
            icon: 'wheat',
            tags: ['padaria'],
            links: ['Pao de Queijo'],
            children: [
              { title: 'Pao de Queijo', icon: 'circle', tags: ['mineiro'], text: 'Minas Gerais.' },
            ],
          },
        ],
      },
    ],
  },
  {
    title: 'Bebidas',
    icon: 'cup-soda',
    text: 'Bebidas em geral.',
    children: [
      {
        title: 'Quente',
        icon: 'flame',
        tags: ['quente'],
        links: ['Cafe'],
        children: [
          {
            title: 'Cafe',
            icon: 'coffee',
            tags: ['cafeina'],
            links: ['Cappuccino'],
            children: [
              { title: 'Cappuccino', icon: 'cup-soda', tags: ['italiano'], text: 'Italiano.' },
            ],
          },
        ],
      },
      {
        title: 'Gelada',
        icon: 'snowflake',
        tags: ['gelado'],
        links: ['Suco'],
        children: [
          {
            title: 'Suco',
            icon: 'glass-water',
            tags: ['natural'],
            links: ['Suco de Laranja'],
            children: [
              {
                title: 'Suco de Laranja',
                icon: 'citrus',
                tags: ['vitamina'],
                text: 'Vitamina C.',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    title: 'Livros',
    icon: 'book-open',
    text: 'Leituras e anotações.',
    children: [
      {
        title: 'Ficcao',
        icon: 'sparkles',
        tags: ['ficcao'],
        children: [{ title: 'Duna', icon: 'book', tags: ['scifi'], text: 'Frank Herbert.' }],
      },
    ],
  },
];

export interface ExampleSeed {
  notes: Note[];
  links: Link[];
  rootIds: ID[];
  count: number;
}

function buildDoc(
  text: string | undefined,
  targets: ReadonlyArray<{ id: ID; title: string }>,
): NoteContentNode {
  const runs: NoteContentNode[] = [];
  if (text) runs.push({ type: 'text', text });
  for (const target of targets) {
    if (runs.length > 0) runs.push({ type: 'text', text: ' ' });
    runs.push({
      type: 'wikilink',
      attrs: { noteId: target.id, title: target.title },
    });
  }
  return { type: 'doc', content: runs.length > 0 ? [{ type: 'paragraph', content: runs }] : [] };
}

function findByTitle(specs: SeedSpec[], title: string): SeedSpec | undefined {
  for (const spec of specs) {
    if (spec.title === title) return spec;
    const found = spec.children ? findByTitle(spec.children, title) : undefined;
    if (found) return found;
  }
  return undefined;
}

/** Monta a árvore de exemplo (ids novos a cada execução). */
export function buildExampleSeed(now = Date.now()): ExampleSeed {
  const notes: Note[] = [];
  const idByTitle = new Map<string, ID>();

  const collect = (specs: SeedSpec[], parentId: ID | null, orderKeys: string[]): void => {
    specs.forEach((spec, i) => {
      const id = ulid();
      idByTitle.set(spec.title, id);
      notes.push({
        id,
        parentId,
        orderKey: orderKeys[i],
        title: spec.title,
        content: EMPTY_DOC,
        contentText: '',
        icon: spec.icon ?? (parentId === null ? 'folder' : 'circle'),
        color: null,
        tags: normalizeTags(spec.tags ?? []),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        deletedRootId: null,
      });
      if (spec.children && spec.children.length > 0) {
        collect(spec.children, id, generateNKeysBetween(null, null, spec.children.length));
      }
    });
  };

  collect(EXAMPLE_TREE, null, generateNKeysBetween(null, null, EXAMPLE_TREE.length));

  const withContent = notes.map((note) => {
    const spec = findByTitle(EXAMPLE_TREE, note.title);
    const targets = (spec?.links ?? [])
      .map((title) => ({ id: idByTitle.get(title) as ID, title }))
      .filter((target): target is { id: ID; title: string } => target.id !== undefined);
    const doc = buildDoc(spec?.text, targets);
    return { ...note, content: doc, contentText: docToPlainText(doc) };
  });

  const links: Link[] = [];
  for (const note of withContent) links.push(...buildLinks(note.id, note.content, ulid));

  const rootIds = withContent.filter((note) => note.parentId === null).map((note) => note.id);
  return { notes: withContent, links, rootIds, count: withContent.length };
}

export function buildStressSeed(
  totalNotes = 5000,
  rootCount = 5,
  now = Date.now(),
): ExampleSeed {
  const safeRootCount = Math.max(1, Math.min(rootCount, Math.max(1, totalNotes)));
  const safeTotalNotes = Math.max(safeRootCount, totalNotes);
  const rootIds: ID[] = [];
  const notes: Note[] = [];

  for (let i = 0; i < safeRootCount; i += 1) {
    const id = ulid();
    rootIds.push(id);
    const title = `Categoria ${i + 1}`;
    const doc: NoteContentNode = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: `Raiz de carga ${title}.` }] }],
    };
    notes.push({
      id,
      parentId: null,
      orderKey: generateNKeysBetween(null, null, safeRootCount)[i],
      title,
      content: doc,
      contentText: docToPlainText(doc),
      icon: 'folder',
      color: null,
      tags: normalizeTags(['stress', `categoria-${i + 1}`]),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      deletedRootId: null,
    });
  }

  const childrenByRoot: Record<ID, number> = {};
  const remaining = safeTotalNotes - safeRootCount;
  for (let i = 0; i < remaining; i += 1) {
    const rootId = rootIds[i % safeRootCount];
    childrenByRoot[rootId] = (childrenByRoot[rootId] ?? 0) + 1;
  }

  for (const rootId of rootIds) {
    const count = childrenByRoot[rootId] ?? 0;
    if (count === 0) continue;
    const orderKeys = generateNKeysBetween(null, null, count);
    for (let i = 0; i < count; i += 1) {
      const title = `Nota ${rootId.slice(-3)}-${i + 1}`;
      const doc: NoteContentNode = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: `${title}: nota de teste de stress.` }] }],
      };
      notes.push({
        id: ulid(),
        parentId: rootId,
        orderKey: orderKeys[i],
        title,
        content: doc,
        contentText: docToPlainText(doc),
        icon: 'circle',
        color: null,
        tags: normalizeTags(['stress', 'teste']),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        deletedRootId: null,
      });
    }
  }

  const links: Link[] = [];
  for (const note of notes) {
    links.push(...buildLinks(note.id, note.content, ulid));
  }

  return {
    notes,
    links,
    rootIds,
    count: notes.length,
  };
}
