import { Extension } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { TableKit } from '@tiptap/extension-table';
import Placeholder from '@tiptap/extension-placeholder';
import DOMPurify from 'dompurify';
import { Plugin } from '@tiptap/pm/state';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useCallback, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { buildIndex, getPath, isAlive } from '@/domain/tree';
import type { ID, Note, NoteContentNode } from '@/domain/types';
import { t } from '@/i18n';
import { useNotesStore } from '@/store/notesStore';

import { WikilinkNode } from './WikilinkNode';

interface SuggestionItem {
  kind: 'note' | 'create' | 'block';
  id?: ID;
  title: string;
  detail: string;
  block?: 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'bulletList' | 'orderedList' | 'taskList' | 'blockquote' | 'codeBlock' | 'horizontalRule' | 'table';
}

interface SuggestionState {
  kind: 'wikilink' | 'slash';
  query: string;
  from: number;
  to: number;
  top: number;
  left: number;
  items: SuggestionItem[];
  activeIndex: number;
}

const sanitizePaste = Extension.create({
  name: 'sanitizePaste',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          transformPastedHTML: (html) =>
            DOMPurify.sanitize(html, {
              ALLOWED_TAGS: [
                'p', 'br', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 's', 'del', 'code',
                'pre', 'blockquote', 'ul', 'ol', 'li', 'hr', 'a', 'table', 'thead', 'tbody',
                'tr', 'th', 'td', 'input', 'span',
              ],
              ALLOWED_ATTR: [
                'href', 'target', 'rel', 'colspan', 'rowspan', 'type', 'checked', 'data-type',
                'data-checked', 'data-wikilink', 'data-note-id', 'data-title', 'data-source-id',
              ],
            }),
        },
      }),
    ];
  },
});

const extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: {
      openOnClick: false,
      HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
      isAllowedUri: (url, context) => {
        const valid = context.defaultValidate(url);
        if (!valid) return false;
        try {
          const protocol = new URL(url, window.location.origin).protocol;
          return ['http:', 'https:', 'mailto:'].includes(protocol);
        } catch {
          return false;
        }
      },
    },
  }),
  TaskList,
  TaskItem.configure({ nested: true }),
  TableKit.configure({ table: { resizable: true } }),
  Placeholder.configure({ placeholder: t('editor.placeholder') }),
  WikilinkNode,
  sanitizePaste,
];

const slashItems: SuggestionItem[] = [
  { kind: 'block', title: t('editor.blocoParagrafo'), detail: t('editor.blocoTextoComum'), block: 'paragraph' },
  { kind: 'block', title: t('editor.blocoTitulo1'), detail: t('editor.blocoSecaoPrincipal'), block: 'heading1' },
  { kind: 'block', title: t('editor.blocoTitulo2'), detail: t('editor.blocoSubsecao'), block: 'heading2' },
  { kind: 'block', title: t('editor.blocoTitulo3'), detail: t('editor.blocoSecaoMenor'), block: 'heading3' },
  { kind: 'block', title: t('editor.blocoListaMarcadores'), detail: t('editor.blocoListaSimples'), block: 'bulletList' },
  { kind: 'block', title: t('editor.blocoListaNumerada'), detail: t('editor.blocoListaOrdenada'), block: 'orderedList' },
  { kind: 'block', title: t('editor.blocoListaTarefas'), detail: t('editor.blocoItensMarcaveis'), block: 'taskList' },
  { kind: 'block', title: t('editor.blocoCitacao'), detail: t('editor.blocoBlocoCitado'), block: 'blockquote' },
  { kind: 'block', title: t('editor.blocoCodigo'), detail: t('editor.blocoCodigoDescricao'), block: 'codeBlock' },
  { kind: 'block', title: t('editor.blocoDivisor'), detail: t('editor.blocoLinhaHorizontal'), block: 'horizontalRule' },
  { kind: 'block', title: t('editor.blocoTabela'), detail: t('editor.blocoTabelaDescricao'), block: 'table' },
];

function normalized(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
}

function suggestionsFor(query: string, currentId: ID, notes: Record<ID, Note>): SuggestionItem[] {
  const needle = normalized(query.trim());
  const index = buildIndex(Object.values(notes));
  const matches = Object.values(notes)
    .filter((note) => isAlive(note) && note.id !== currentId)
    .filter((note) => !needle || normalized(note.title).includes(needle))
    .sort((a, b) => {
      const aExact = normalized(a.title).startsWith(needle) ? 0 : 1;
      const bExact = normalized(b.title).startsWith(needle) ? 0 : 1;
      return aExact - bExact || a.title.localeCompare(b.title, 'pt-BR');
    })
    .slice(0, 7)
    .map((note) => ({
      kind: 'note' as const,
      id: note.id,
      title: note.title.trim() || t('common.semTitulo'),
      detail: getPath(index, note.id)
        .map((part) => part.title.trim() || t('common.semTitulo'))
        .join(' › '),
    }));
  if (matches.length === 0 && query.trim()) {
    return [
      {
        kind: 'create',
        title: t('editor.criarNotaWikilink', { nome: query.trim() }),
        detail: t('editor.criarComoFilha'),
      },
    ];
  }
  return matches;
}

function applyBlock(editor: NonNullable<ReturnType<typeof useEditor>>, block: SuggestionItem['block']) {
  const chain = editor.chain().focus();
  switch (block) {
    case 'heading1': chain.setHeading({ level: 1 }).run(); break;
    case 'heading2': chain.setHeading({ level: 2 }).run(); break;
    case 'heading3': chain.setHeading({ level: 3 }).run(); break;
    case 'bulletList': chain.toggleBulletList().run(); break;
    case 'orderedList': chain.toggleOrderedList().run(); break;
    case 'taskList': chain.toggleTaskList().run(); break;
    case 'blockquote': chain.toggleBlockquote().run(); break;
    case 'codeBlock': chain.toggleCodeBlock().run(); break;
    case 'horizontalRule': chain.setHorizontalRule().run(); break;
    case 'table': chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); break;
    default: chain.setParagraph().run();
  }
}

export function RichTextEditor({
  noteId,
  content,
  focusOnCreate,
  readOnly = false,
  onChange,
  onBlur,
}: {
  noteId: ID;
  content: NoteContentNode;
  focusOnCreate: boolean;
  readOnly?: boolean;
  onChange: (id: ID, content: NoteContentNode) => void;
  onBlur: () => void;
}) {
  const byId = useNotesStore((state) => state.byId);
  const [suggestion, setSuggestion] = useState<SuggestionState | null>(null);
  const suggestionRef = useRef<SuggestionState | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const updateSuggestion = useCallback((value: SuggestionState | null) => {
    suggestionRef.current = value;
    setSuggestion(value);
  }, []);

  const editor = useEditor({
    extensions,
    content,
    editable: !readOnly,
    editorProps: { attributes: { 'aria-label': t('editor.corpo') } },
    onCreate: ({ editor: instance }) => {
      if (focusOnCreate) instance.commands.focus();
    },
    onUpdate: ({ editor: instance }) => {
      onChange(noteId, instance.getJSON() as NoteContentNode);
      const { from } = instance.state.selection;
      const before = instance.state.doc.textBetween(Math.max(0, from - 160), from, '\n');
      const coords = instance.view.coordsAtPos(from);
      const base = {
        from,
        to: from,
        top: coords.bottom + 6,
        left: coords.left,
        activeIndex: 0,
      };
      const wiki = before.match(/\[\[([^\]]*)$/u);
      if (wiki) {
        const query = wiki[1];
        updateSuggestion({
          ...base,
          kind: 'wikilink',
          query,
          from: from - query.length - 2,
          items: suggestionsFor(query, noteId, byId),
        });
        return;
      }
      const slash = before.match(/(?:^|\s)\/([\p{L}\p{N} ]*)$/u);
      if (slash) {
        const query = slash[1];
        const needle = normalized(query.trim());
        updateSuggestion({
          ...base,
          kind: 'slash',
          query,
          from: from - query.length - 1,
          items: slashItems.filter((item) => !needle || normalized(item.title).includes(needle)),
        });
        return;
      }
      if (suggestionRef.current) updateSuggestion(null);
    },
    onFocus: () => setIsFocused(true),
    onBlur: () => {
      setIsFocused(false);
      onBlur();
    },
  });

  const choose = useCallback(
    async (item: SuggestionItem) => {
      if (!editor) return;
      const active = suggestionRef.current;
      if (!active) return;
      updateSuggestion(null);
      if (active.kind === 'slash') {
        editor.chain().focus().deleteRange({ from: active.from, to: active.to }).run();
        applyBlock(editor, item.block);
        return;
      }
      let targetId = item.id;
      let title = item.title;
      if (item.kind === 'create') {
        const created = await useNotesStore.getState().createNote({
          parentId: noteId,
          title: active.query.trim(),
        });
        targetId = created.id;
        title = created.title;
      } else if (targetId) {
        title = useNotesStore.getState().byId[targetId]?.title ?? title;
      }
      editor
        .chain()
        .focus()
        .deleteRange({ from: active.from, to: active.to })
        .insertContent({ type: 'wikilink', attrs: { noteId: targetId ?? null, title, sourceId: noteId } })
        .run();
    },
    [editor, noteId, updateSuggestion],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const active = suggestionRef.current;
    if (!active) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      updateSuggestion(null);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      updateSuggestion({
        ...active,
        activeIndex: (active.activeIndex + delta + active.items.length) % active.items.length,
      });
    } else if (event.key === 'Enter' && active.items.length > 0) {
      event.preventDefault();
      void choose(active.items[active.activeIndex]);
    }
  };

  const toggleLink = () => {
    if (!editor) return;
    if (editor.isActive('link')) editor.chain().focus().unsetLink().run();
    else {
      const href = window.prompt(t('editor.urlExterna'));
      if (!href) return;
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
  };

  const active = suggestion;
  const visibleItems = useMemo(() => active?.items ?? [], [active]);

  return (
    <div className="relative" onKeyDown={handleKeyDown}>
      {!readOnly ? <div className="sticky top-0 z-10 flex flex-wrap gap-1 border-b border-border bg-bg-editor/95 py-2 backdrop-blur">
        <Button variant="ghost" size="sm" aria-label={t('editor.negrito')} aria-pressed={editor?.isActive('bold') ?? false} onClick={() => editor?.chain().focus().toggleBold().run()}>B</Button>
        <Button variant="ghost" size="sm" aria-label={t('editor.italico')} aria-pressed={editor?.isActive('italic') ?? false} onClick={() => editor?.chain().focus().toggleItalic().run()}><i>I</i></Button>
        <Button variant="ghost" size="sm" aria-label={t('editor.tachado')} onClick={() => editor?.chain().focus().toggleStrike().run()}><s>S</s></Button>
        <Button variant="ghost" size="sm" aria-label={t('editor.codigo')} onClick={() => editor?.chain().focus().toggleCode().run()}>{'</>'}</Button>
        <Button variant="ghost" size="sm" aria-label={t('editor.listaMarcadores')} onClick={() => editor?.chain().focus().toggleBulletList().run()}>{t('editor.listaMarcadoresBreve')}</Button>
        <Button variant="ghost" size="sm" aria-label={t('editor.listaNumerada')} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>{t('editor.listaNumeradaBreve')}</Button>
        <Button variant="ghost" size="sm" aria-label={t('editor.inserirLink')} onClick={toggleLink}>↗</Button>
        <Button variant="ghost" size="sm" aria-label={t('editor.inserirTabela')} onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>▦</Button>
      </div> : null}

      {!readOnly && editor && isFocused ? (
        <BubbleMenu editor={editor}>
          <div className="flex gap-1 rounded border border-border bg-bg-raised p-1 shadow-lg">
            <Button variant="ghost" size="sm" aria-label={t('editor.negrito')} onClick={() => editor.chain().focus().toggleBold().run()}>B</Button>
            <Button variant="ghost" size="sm" aria-label={t('editor.italico')} onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></Button>
            <Button variant="ghost" size="sm" aria-label={t('editor.tachado')} onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></Button>
          </div>
        </BubbleMenu>
      ) : null}

      <EditorContent
        editor={editor}
        className={`tiptap-content ${readOnly ? 'py-2 text-lg leading-8' : 'min-h-56 py-4 text-sm leading-7'} text-text outline-none`}
      />

      {!readOnly && active && visibleItems.length > 0 ? (
        <div
          role="listbox"
          aria-label={active.kind === 'wikilink' ? t('editor.sugestoesWikilink') : t('editor.blocos')}
          className="fixed z-50 max-h-72 w-80 overflow-y-auto rounded border border-border bg-bg-raised p-1 shadow-xl"
          style={{ top: active.top, left: active.left }}
        >
          {visibleItems.map((item, index) => (
            <button
              type="button"
              role="option"
              aria-selected={active.activeIndex === index}
              key={`${item.kind}:${item.id ?? item.block ?? item.title}`}
              className={`flex w-full flex-col rounded px-2 py-1.5 text-left ${active.activeIndex === index ? 'bg-accent-bg text-text' : 'text-text hover:bg-bg-hover'}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void choose(item)}
            >
              <span className="text-sm font-medium">{item.title}</span>
              <span className="max-w-full truncate text-xs text-muted">{item.detail}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
