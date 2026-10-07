import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { excerptAround } from '@/domain/content';
import { normalizeTag, normalizeTags } from '@/domain/tags';
import { isAlive } from '@/domain/tree';
import type { ID, Note, NoteContentNode } from '@/domain/types';
import { t } from '@/i18n';
import { useNotesStore } from '@/store/notesStore';
import { useSettingsStore } from '@/store/settingsStore';
import { selectViewById, useViewStore } from '@/store/viewStore';
import { useUiStore } from '@/store/uiStore';

const RichTextEditor = lazy(() =>
  import('./RichTextEditor').then((module) => ({ default: module.RichTextEditor })),
);

const MIN_WIDTH = 320;
const MAX_WIDTH = 640;
const CONTENT_SAVE_DELAY = 500;
const TITLE_SAVE_DELAY = 150;
const SUBNOTES_PAGE_SIZE = 40;

export type MobileEditorPresentation = 'sheet' | 'side';

interface PendingContent {
  id: ID;
  content: NoteContentNode;
}

interface PendingTitle {
  id: ID;
  title: string;
}

function timestamp(value: number): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(value);
}

function relativeDay(value: number): string {
  const days = Math.round((Date.now() - value) / 86_400_000);
  return new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' }).format(-days, 'day');
}

function wordCount(value: string): number {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/u).length : 0;
}

/** Painel de edição rica, breadcrumbs, tags, subnotas, backlinks e autosave. */
export function EditorPanel({
  mobilePresentation,
  onMobileClose,
}: {
  mobilePresentation?: MobileEditorPresentation;
  onMobileClose?: () => void;
} = {}) {
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.update);
  const rootId = useSettingsStore((state) => state.settings.lastCategoryId);
  const selectedId = useViewStore((state) => selectViewById(state, rootId).selectedId);
  const note = useNotesStore((state) => (selectedId ? (state.byId[selectedId] ?? null) : null));
  const [childrenLimit, setChildrenLimit] = useState(SUBNOTES_PAGE_SIZE);
  const [openedBodyId, setOpenedBodyId] = useState<ID | null>(null);
  const [focusBodyId, setFocusBodyId] = useState<ID | null>(null);
  const [readingMode, setReadingMode] = useState(false);
  const path = useNotesStore(
    useShallow((state) => {
      const result: Note[] = [];
      const seen = new Set<ID>();
      let current = selectedId ? state.byId[selectedId] : undefined;
      while (current && !seen.has(current.id)) {
        seen.add(current.id);
        result.unshift(current);
        current = current.parentId ? state.byId[current.parentId] : undefined;
      }
      return result;
    }),
  );
  const children = useNotesStore(
    useShallow((state) =>
      note
        ? (state.childIds[note.id] ?? [])
            .slice(0, childrenLimit)
            .map((id) => state.byId[id])
            .filter((child) => child && isAlive(child))
        : [],
    ),
  );
  const childrenCount = useNotesStore((state) =>
    note ? (state.childIds[note.id] ?? []).length : 0,
  );
  const incomingLinks = useNotesStore(
    useShallow((state) => {
      const seen = new Set<ID>();
      return state.links.filter((link) => {
        if (link.toId !== note?.id || seen.has(link.fromId)) return false;
        seen.add(link.fromId);
        return true;
      });
    }),
  );
  const backlinkSources = useNotesStore(
    useShallow((state) =>
      incomingLinks
        .map((link) => state.byId[link.fromId])
        .filter((source) => source && isAlive(source)),
    ),
  );
  const backlinks = useMemo(
    () =>
      incomingLinks.flatMap((link) => {
        const source = backlinkSources.find((candidate) => candidate.id === link.fromId);
        return source
          ? [{ fromId: source.id, fromTitle: source.title, context: excerptAround(source.contentText, note?.title ?? '') }]
          : [];
      }),
    [backlinkSources, incomingLinks, note?.title],
  );
  const renameNote = useNotesStore((state) => state.renameNote);
  const toast = useUiStore((state) => state.toast);
  const [width, setWidth] = useState<number | null>(null);
  const [titleDraft, setTitleDraft] = useState<{ id: ID | null; value: string }>({
    id: note?.id ?? null,
    value: note?.title ?? '',
  });
  const [tagDraft, setTagDraft] = useState('');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const dragging = useRef(false);
  const pendingContent = useRef<PendingContent | null>(null);
  const pendingTitle = useRef<PendingTitle | null>(null);
  const contentTimer = useRef<number | null>(null);
  const titleTimer = useRef<number | null>(null);

  const existingTags = useMemo(
    () =>
      tagDraft.trim()
        ? [...new Set(Object.values(useNotesStore.getState().byId).filter(isAlive).flatMap((item) => item.tags))].sort()
        : [],
    [tagDraft],
  );
  const tagSuggestions = useMemo(() => {
    const query = normalizeTag(tagDraft, { stripAccents: settings.tagStripAccents });
    return existingTags
      .filter((tag) => !note?.tags.includes(tag) && (!query || tag.includes(query)))
      .slice(0, 6);
  }, [existingTags, note?.tags, settings.tagStripAccents, tagDraft]);
  const visibleChildren = children;

  const currentWidth = width ?? settings.editorWidth;
  const title = note && titleDraft.id === note.id ? titleDraft.value : note?.title ?? '';
  const contentText = note?.contentText ?? '';
  const bodyOpen = note !== null && (note.parentId !== null || openedBodyId === note.id);

  const saveNow = useCallback(
    async (pending: PendingContent) => {
      setSaveState('saving');
      try {
        const current = useNotesStore.getState().byId[pending.id];
        await useNotesStore
          .getState()
          .saveNoteContent(pending.id, pending.content, current?.tags ?? []);
        setSaveState('saved');
      } catch {
        setSaveState('error');
        toast(t('toast.erroSalvar'), { tone: 'error' });
      }
    },
    [toast],
  );

  const flushContent = useCallback(async () => {
    if (contentTimer.current !== null) {
      window.clearTimeout(contentTimer.current);
      contentTimer.current = null;
    }
    const pending = pendingContent.current;
    if (!pending) return;
    pendingContent.current = null;
    await saveNow(pending);
  }, [saveNow]);

  const scheduleContentSave = useCallback(
    (id: ID, content: NoteContentNode) => {
      pendingContent.current = { id, content };
      setSaveState('saving');
      if (contentTimer.current !== null) window.clearTimeout(contentTimer.current);
      contentTimer.current = window.setTimeout(() => {
        contentTimer.current = null;
        void flushContent();
      }, CONTENT_SAVE_DELAY);
    },
    [flushContent],
  );

  const flushTitle = useCallback(async () => {
    if (titleTimer.current !== null) {
      window.clearTimeout(titleTimer.current);
      titleTimer.current = null;
    }
    const pending = pendingTitle.current;
    if (!pending) return;
    pendingTitle.current = null;
    try {
      await renameNote(pending.id, pending.title);
    } catch {
      toast(t('toast.erroSalvar'), { tone: 'error' });
    }
  }, [renameNote, toast]);

  useEffect(() => {
    if (pendingContent.current && pendingContent.current.id !== note?.id) void flushContent();
    if (pendingTitle.current && pendingTitle.current.id !== note?.id) void flushTitle();
  }, [flushContent, flushTitle, note?.id]);

  useEffect(() => {
    const flush = () => {
      void flushContent();
      void flushTitle();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      void flushTitle();
      void flushContent();
    };
  }, [flushContent, flushTitle]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = true;
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - event.clientX));
    setWidth(next);
  }

  function onPointerUp() {
    if (!dragging.current) return;
    dragging.current = false;
    setWidth((next) => {
      if (next !== null) void updateSettings({ editorWidth: next }).catch(() => undefined);
      return next;
    });
  }

  function changeTitle(value: string) {
    if (!note) return;
    setTitleDraft({ id: note.id, value });
    pendingTitle.current = { id: note.id, title: value.slice(0, 200) };
    if (titleTimer.current !== null) window.clearTimeout(titleTimer.current);
    titleTimer.current = window.setTimeout(() => {
      void flushTitle();
    }, TITLE_SAVE_DELAY);
  }

  function commitTitle(id: ID, value: string) {
    const next = value.slice(0, 200);
    pendingTitle.current = { id, title: next };
    setTitleDraft({ id, value: next });
    void flushTitle();
  }

  const changeTags = useCallback(
    async (nextTags: string[]) => {
      if (!note) return;
      try {
        await flushContent();
        const current = useNotesStore.getState().byId[note.id];
        if (!current || !isAlive(current)) return;
        await useNotesStore.getState().saveNoteContent(
          note.id,
          current.content,
          normalizeTags(nextTags, { stripAccents: settings.tagStripAccents }),
        );
      } catch {
        toast(t('toast.erroSalvar'), { tone: 'error' });
      }
    },
    [flushContent, note, settings.tagStripAccents, toast],
  );

  async function addTag(value = tagDraft) {
    const tag = normalizeTag(value, { stripAccents: settings.tagStripAccents });
    if (!note || !tag || note.tags.includes(tag)) return;
    await changeTags([...note.tags, tag]);
    setTagDraft('');
  }

  async function closeEditor() {
    await flushTitle();
    await flushContent();
    if (mobilePresentation) onMobileClose?.();
    else await updateSettings({ editorOpen: false });
  }

  const closeSheetFromDrag = useRef<number | null>(null);

  async function openReadingMode() {
    await flushTitle();
    await flushContent();
    setReadingMode(true);
  }

  function goTo(noteId: ID) {
    const target = useNotesStore.getState().byId[noteId];
    if (!target) return;
    if (target.parentId === null) {
      useSettingsStore.getState().setActiveCategory(target.id);
      useViewStore.getState().select(target.id, target.id);
      return;
    }
    useUiStore.getState().requestNavigation(target.id);
  }

  const created = note ? relativeDay(note.createdAt) : '';
  const updated = note ? relativeDay(note.updatedAt) : '';
  const saveLabel =
    saveState === 'saving'
      ? t('editor.salvando')
      : saveState === 'error'
        ? t('editor.erroAoSalvar')
        : t('editor.salvo');

  useEffect(() => {
    if (!readingMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setReadingMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [readingMode]);

  if (readingMode && note) {
    return (
      <main
        className="fixed inset-0 z-50 flex min-h-0 flex-col overflow-y-auto bg-bg-app text-text"
        aria-label={t('editor.modoLeitura')}
        data-testid="reading-mode"
      >
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b border-border bg-bg-app/95 px-5 backdrop-blur">
          <span className="truncate text-sm text-muted">{t('editor.modoLeitura')}</span>
          <Button
            size="sm"
            variant="secondary"
            icon={<Icon name="minimize" size={14} />}
            onClick={() => setReadingMode(false)}
            aria-label={t('editor.sairModoLeitura')}
          >
            {t('editor.sairModoLeitura')}
          </Button>
        </header>
        <article className="mx-auto w-full max-w-3xl flex-1 px-6 py-14 sm:px-10 sm:py-20">
          <h1 className="mb-10 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            {title.trim() || t('common.semTitulo')}
          </h1>
          <Suspense fallback={<div className="min-h-56 animate-pulse rounded bg-bg-hover" />}>
            <RichTextEditor
              key={`reading:${note.id}`}
              noteId={note.id}
              content={note.content}
              focusOnCreate={false}
              readOnly
              onChange={scheduleContentSave}
              onBlur={() => void flushContent()}
            />
          </Suspense>
        </article>
      </main>
    );
  }

  return (
    <div
      role={mobilePresentation ? 'dialog' : undefined}
      aria-modal={mobilePresentation ? true : undefined}
      aria-label={mobilePresentation ? t('mobile.notaSelecionada') : undefined}
      className={`relative flex min-h-0 shrink-0 flex-col border-border bg-bg-editor ${
        mobilePresentation === 'sheet'
          ? 'h-[85dvh] w-full max-w-none rounded-t-2xl border shadow-2xl'
          : mobilePresentation === 'side'
            ? 'h-full w-full border-l shadow-2xl'
            : 'h-full border-l'
      }`}
      style={mobilePresentation ? undefined : { width: currentWidth }}
      data-testid="editor-panel"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('editor.redimensionar')}
        title={t('editor.redimensionar')}
        className={`absolute top-0 -left-1 z-10 h-full w-2 cursor-col-resize touch-none hover:bg-accent/40 ${mobilePresentation ? 'hidden' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {mobilePresentation === 'sheet' ? (
        <button
          type="button"
          className="flex h-7 shrink-0 touch-none items-center justify-center"
          aria-label={t('mobile.fecharPainel')}
          onPointerDown={(event) => {
            closeSheetFromDrag.current = event.clientY;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => {
            const start = closeSheetFromDrag.current;
            closeSheetFromDrag.current = null;
            if (start !== null && event.clientY > start + 44) {
              void closeEditor().catch(() => toast(t('toast.erroSalvar'), { tone: 'error' }));
            }
          }}
          onClick={() => void closeEditor().catch(() => toast(t('toast.erroSalvar'), { tone: 'error' }))}
        >
          <span aria-hidden="true" className="h-1 w-10 rounded-full bg-border-strong" />
        </button>
      ) : null}

      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Icon name={note?.icon ?? 'notebook-pen'} size={16} className="shrink-0 text-muted" />
          <span className="truncate text-sm font-semibold text-text">
            {note ? t('editor.editando', { nome: title.trim() || t('common.semTitulo') }) : t('editor.nenhumaNotaAberta')}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {note ? (
            <>
              <span role="status" aria-live="polite" className="text-xs text-muted">
                {saveLabel}
              </span>
              <Button
                variant="ghost"
                size="sm"
                icon={<Icon name="book-open" size={14} />}
                aria-label={t('editor.abrirModoLeitura')}
                title={t('editor.abrirModoLeitura')}
                onClick={() => void openReadingMode().catch(() => toast(t('toast.erroSalvar'), { tone: 'error' }))}
                data-testid="reading-mode-toggle"
              >
                {t('editor.ler')}
              </Button>
              {saveState === 'error' ? (
                <Button variant="ghost" size="sm" aria-label={t('editor.tentarSalvarNovamente')} onClick={() => void flushContent()}>
                  <Icon name="rotate-cw" size={14} />
                </Button>
              ) : null}
            </>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('editor.fecharEditor')}
            title={t('editor.fecharEditor')}
            onClick={() => void closeEditor().catch(() => toast(t('toast.erroSalvar'), { tone: 'error' }))}
            icon={<Icon name="x" size={14} />}
          />
        </div>
      </header>

      {note ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <nav aria-label={t('editor.breadcrumb')} className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted">
            {path.map((part, position) => (
              <span key={part.id} className="inline-flex items-center gap-1">
                {position > 0 ? <span aria-hidden="true">›</span> : null}
                {position === path.length - 1 ? (
                  <span aria-current="page" className="max-w-32 truncate text-text">{part.title.trim() || t('common.semTitulo')}</span>
                ) : (
                  <button type="button" className="max-w-32 truncate hover:text-accent hover:underline" onClick={() => goTo(part.id)}>
                    {part.title.trim() || t('common.semTitulo')}
                  </button>
                )}
              </span>
            ))}
          </nav>

          <input
            aria-label={t('editor.tituloNota')}
            value={title}
            maxLength={200}
            placeholder={t('editor.placeholderTitulo')}
            className="mb-3 w-full border-0 bg-transparent text-[28px] leading-[1.15] font-bold tracking-[-0.025em] text-text outline-none placeholder:text-muted"
            onChange={(event) => changeTitle(event.currentTarget.value)}
            onBlur={() => void commitTitle(note.id, title)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault();
                const editorBody = event.currentTarget.parentElement?.querySelector<HTMLElement>(
                  '.tiptap-content [contenteditable="true"]',
                );
                if (editorBody) editorBody.focus();
                else {
                  setOpenedBodyId(note.id);
                  setFocusBodyId(note.id);
                }
              }
            }}
          />

          {bodyOpen ? (
            <Suspense fallback={<div className="min-h-56 animate-pulse rounded bg-bg-hover" />}>
              <RichTextEditor
                key={note.id}
                noteId={note.id}
                content={note.content}
                focusOnCreate={focusBodyId === note.id}
                onChange={scheduleContentSave}
                onBlur={() => void flushContent()}
              />
            </Suspense>
          ) : (
            <button
              type="button"
              aria-label={t('editor.abrirCorpo')}
              onClick={() => {
                setOpenedBodyId(note.id);
                setFocusBodyId(note.id);
              }}
              className="min-h-56 w-full rounded border border-dashed border-border px-3 py-4 text-left text-sm text-muted hover:border-border-strong hover:bg-bg-hover/40"
            >
              {note.contentText.trim() || t('editor.abrirCorpoDica')}
            </button>
          )}

          <section aria-labelledby="editor-tags-heading" className="mt-5 border-t border-border pt-3">
            <h2 id="editor-tags-heading" className="mb-2 text-[11px] font-semibold tracking-[0.02em] text-muted uppercase">{t('editor.tags')}</h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {note.tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-accent-softer px-2 py-1 font-mono text-[11px] font-medium text-accent-text">
                  #{tag}
                  <button type="button" aria-label={t('editor.removerTag', { nome: tag })} onClick={() => void changeTags(note.tags.filter((item) => item !== tag))}>
                    <Icon name="x" size={12} />
                  </button>
                </span>
              ))}
              <input
                aria-label={t('editor.placeholderTag')}
                placeholder={t('editor.placeholderTag')}
                value={tagDraft}
                className="h-7 min-w-24 rounded border border-border bg-bg-app px-2 text-xs text-text outline-none focus:border-accent"
                onChange={(event) => setTagDraft(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ',') {
                    event.preventDefault();
                    void addTag();
                  }
                }}
              />
              {tagSuggestions.map((tag) => (
                <button key={tag} type="button" className="rounded bg-bg-hover px-2 py-1 text-xs text-muted hover:text-text" onClick={() => void addTag(tag)}>#{tag}</button>
              ))}
              {tagDraft.trim() ? (
                <Button variant="ghost" size="sm" aria-label={t('editor.adicionarTag')} onClick={() => void addTag()}>
                  <Icon name="plus" size={14} />
                </Button>
              ) : null}
            </div>
          </section>

          <section aria-labelledby="editor-subnotes-heading" className="mt-5 border-t border-border pt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 id="editor-subnotes-heading" className="text-[11px] font-semibold tracking-[0.02em] text-muted uppercase">{t('editor.subnotas')}</h2>
              <Button variant="ghost" size="sm" aria-label={t('editor.adicionarSubnota')} onClick={() => {
                void useNotesStore.getState().createNote({ parentId: note.id }).then((createdNote) => {
                  useUiStore.getState().requestNavigation(createdNote.id);
                }).catch(() => toast(t('toast.erroSalvar'), { tone: 'error' }));
              }}>
                <Icon name="plus" size={14} />
              </Button>
            </div>
            {childrenCount > 0 ? (
              <ul className="flex flex-col gap-1">
                {visibleChildren.map((child) => (
                  <li key={child.id}>
                    <button type="button" className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-text hover:bg-bg-hover" onClick={() => goTo(child.id)}>
                      <Icon name={child.icon} size={14} className="text-muted" />
                      <span className="truncate">{child.title.trim() || t('common.semTitulo')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-muted">{t('editor.semSubnotas')}</p>}
            {childrenCount > visibleChildren.length ? (
              <button
                type="button"
                className="mt-2 rounded px-2 py-1 text-xs text-accent hover:bg-bg-hover"
                onClick={() => setChildrenLimit((limit) => limit + SUBNOTES_PAGE_SIZE)}
              >
                {t('editor.mostrarMaisSubnotas', {
                  n: Math.min(SUBNOTES_PAGE_SIZE, childrenCount - visibleChildren.length),
                })}
              </button>
            ) : null}
          </section>

          <section aria-labelledby="editor-backlinks-heading" className="mt-5 border-t border-border pt-3">
            <h2 id="editor-backlinks-heading" className="mb-2 text-[11px] font-semibold tracking-[0.02em] text-muted uppercase">{t('editor.backlinks', { n: backlinks.length })}</h2>
            {backlinks.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {backlinks.map((backlink) => (
                  <li key={backlink.fromId}>
                    <button type="button" className="w-full rounded px-2 py-1 text-left hover:bg-bg-hover" onClick={() => goTo(backlink.fromId)}>
                      <span className="block truncate text-sm text-text">{backlink.fromTitle || t('common.semTitulo')}</span>
                      {backlink.context ? <span className="block truncate text-xs text-muted">{backlink.context}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-muted">{t('editor.semBacklinks')}</p>}
          </section>

          <footer className="mt-5 border-t border-border pt-3 text-xs text-muted" title={t('editor.metadados', { criada: timestamp(note.createdAt), atualizada: timestamp(note.updatedAt) })}>
            <p>{t('editor.metadados', { criada: created, atualizada: updated })}</p>
            <p className="mt-1">{t('editor.palavras', { n: wordCount(contentText) })}</p>
          </footer>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <Icon name="pen-line" size={26} className="text-muted" />
          <p className="text-sm font-medium text-text">{t('editor.semNota')}</p>
          <p className="max-w-xs text-sm text-muted">{t('editor.semNotaDica')}</p>
        </div>
      )}
    </div>
  );
}
