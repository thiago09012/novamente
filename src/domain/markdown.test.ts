import { describe, expect, it } from 'vitest';

import { makeNote } from '@/tests/factories';
import { EMPTY_DOC } from './content';
import {
  markdownToNote,
  markdownToTipTap,
  noteToMarkdown,
  slugify,
  tipTapToMarkdown,
} from './markdown';

describe('markdown codec', () => {
  it('serializa frontmatter e wikilink', () => {
    const note = makeNote({
      id: '01TEST',
      parentId: null,
      orderKey: 'a0',
      title: 'Projetos',
      tags: ['rotina'],
      icon: 'folder',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Ver ' },
              { type: 'wikilink', attrs: { noteId: '01X', title: 'App Mente', sourceId: '01TEST' } },
              { type: 'text', text: '.' },
            ],
          },
        ],
      },
      contentText: 'Ver App Mente.',
    });
    const md = noteToMarkdown(note);
    expect(md).toContain('id: 01TEST');
    expect(md).toContain('parentId: null');
    expect(md).toContain('tags: [rotina]');
    expect(md).toContain('[[App Mente]]');
  });

  it('faz round-trip de parágrafos, negrito, lista e código', () => {
    const md = [
      '---',
      'id: 01RT',
      'parentId: null',
      'orderKey: a0',
      'title: Round trip',
      'tags: [teste]',
      'icon: circle',
      'color: null',
      'createdAt: 1',
      'updatedAt: 2',
      '---',
      '',
      'Texto com **negrito** e `codigo`.',
      '',
      '- item um',
      '- item dois',
      '',
      '```ts',
      'const x = 1;',
      '```',
    ].join('\n');
    const note = markdownToNote(md);
    expect(note.id).toBe('01RT');
    expect(note.title).toBe('Round trip');
    expect(note.tags).toEqual(['teste']);
    expect(note.updatedAt).toBe(2);
    const body = tipTapToMarkdown(note.content);
    expect(body).toContain('**negrito**');
    expect(body).toContain('`codigo`');
    expect(body).toContain('- item um');
    expect(body).toContain('```ts');
    expect(body).toContain('const x = 1;');
  });

  it('parseia listas de tarefa e blockquote', () => {
    const doc = markdownToTipTap('- [ ] pendente\n- [x] feito\n\n> citação');
    const types = (doc.content ?? []).map((node) => node.type);
    expect(types).toContain('taskList');
    expect(types).toContain('blockquote');
    const taskList = (doc.content ?? []).find((node) => node.type === 'taskList');
    const items = taskList?.content ?? [];
    expect(items[0]?.attrs?.checked).toBe(false);
    expect(items[1]?.attrs?.checked).toBe(true);
  });

  it('doc vazio vira EMPTY_DOC e slug é seguro', () => {
    const note = markdownToNote('---\ntitle: Só título\n---\n');
    expect(note.content).toEqual(EMPTY_DOC);
    expect(note.title).toBe('Só título');
    expect(slugify('Fase 7 — PWA!')).toBe('fase-7-pwa');
    expect(slugify('///')).toBe('nota');
  });

  it('preserva conteúdo ao re-serializar nota do factory', () => {
    const note = makeNote({
      title: 'Estável',
      content: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ok' }] }],
      },
      contentText: 'ok',
    });
    const parsed = markdownToNote(noteToMarkdown(note));
    expect(parsed.title).toBe('Estável');
    expect(tipTapToMarkdown(parsed.content)).toContain('ok');
  });

  it('herda campos ausentes no frontmatter a partir do base', () => {
    const base = makeNote({
      id: '01BASE',
      parentId: 'cat',
      orderKey: 'a2',
      title: 'Original',
      tags: ['projeto', 'ia'],
      icon: 'star',
      color: '#ff0000',
      createdAt: 111,
      updatedAt: 222,
      contentText: 'corpo',
    });
    // Sem título no frontmatter: heading do corpo vence; sem heading, herda do base.
    const withHeading = ['---', 'id: 01BASE', '---', '', '# Título reescrito pela IA'].join('\n');
    const parsedHeading = markdownToNote(withHeading, base);
    expect(parsedHeading.title).toBe('Título reescrito pela IA');
    const minimal = ['---', 'id: 01BASE', '---', '', 'apenas parágrafo'].join('\n');
    const parsed = markdownToNote(minimal, base);
    expect(parsed.title).toBe('Original');
    expect(parsed.tags).toEqual(['projeto', 'ia']);
    expect(parsed.icon).toBe('star');
    expect(parsed.color).toBe('#ff0000');
    expect(parsed.orderKey).toBe('a2');
    expect(parsed.createdAt).toBe(111);
    expect(parsed.updatedAt).toBe(222);
    expect(parsed.parentId).toBeNull();

    // Frontmatter explícito continua vencendo o base.
    const explicit = ['---', 'id: 01BASE', 'tags: [outra]', 'icon: rocket', 'updatedAt: 999', '---', ''].join('\n');
    const withBase = markdownToNote(explicit, base);
    expect(withBase.tags).toEqual(['outra']);
    expect(withBase.icon).toBe('rocket');
    expect(withBase.updatedAt).toBe(999);

    // Sem base, mantém defaults (não inventa dados): icon fica null e
    // o default por parentId é aplicado depois em parsedToNote.
    const noBase = markdownToNote(minimal);
    expect(noBase.tags).toEqual([]);
    expect(noBase.icon).toBeNull();
    expect(noBase.updatedAt).toBeNull();
  });
});
