import MiniSearch from 'minisearch';
import { useMemo, useState } from 'react';

import { Dialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';
import { buildIndex, getPath, isAlive } from '@/domain/tree';
import type { ID, Note } from '@/domain/types';
import { t } from '@/i18n';
import { useNotesStore } from '@/store/notesStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { useViewStore } from '@/store/viewStore';

interface SearchDocument {
  id: ID;
  title: string;
  tags: string;
  content: string;
}

function normalizeTerm(term: string): string {
  return term.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function measureSearchPhase<T>(name: string, action: () => T): T {
  let enabled = false;
  try {
    enabled = typeof window !== 'undefined' && window.sessionStorage.getItem('novamente-perf-phases') === '1';
  } catch {
    // A medição é opcional e não deve afetar o fluxo de busca.
  }
  if (!enabled) return action();
  const start = performance.now();
  const result = action();
  performance.measure(`novamente:${name}`, { start, end: performance.now() });
  return result;
}

function makeIndex(notes: Record<ID, Note>) {
  const index = new MiniSearch<SearchDocument>({
    fields: ['title', 'tags', 'content'],
    storeFields: ['id'],
    processTerm: normalizeTerm,
    searchOptions: { boost: { title: 3, tags: 2, content: 1 }, fuzzy: 0.2, prefix: true },
  });
  measureSearchPhase('search-index', () =>
    index.addAll(
      Object.values(notes)
        .filter(isAlive)
        .map((note) => ({ id: note.id, title: note.title, tags: note.tags.join(' '), content: note.contentText })),
    ),
  );
  return index;
}

export function SearchDialog() {
  const byId = useNotesStore((state) => state.byId);
  const closeDialog = useUiStore((state) => state.closeDialog);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const index = useMemo(() => makeIndex(byId), [byId]);
  const treeIndex = useMemo(() => buildIndex(Object.values(byId)), [byId]);
  const results = useMemo(() => {
    const normalized = query.trim();
    if (!normalized) {
      return Object.values(byId)
        .filter(isAlive)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 12)
        .map((note) => ({ id: note.id, score: 0 }));
    }
    return measureSearchPhase('search-query', () =>
      index.search(normalized).slice(0, 20).map((hit) => ({ id: String(hit.id), score: hit.score })),
    );
  }, [byId, index, query]);
  const commandMode = query.startsWith('>');
  const commands = [
    { id: 'new-note', label: t('search.comandoNovaNota') },
    { id: 'new-category', label: t('search.comandoNovaCategoria') },
    { id: 'trash', label: t('search.comandoLixeira') },
    { id: 'settings', label: t('search.comandoConfiguracoes') },
  ].filter((command) => normalizeTerm(command.label).includes(normalizeTerm(query.slice(1).trim())));
  const safeActive = Math.min(activeIndex, Math.max(0, results.length - 1));

  const runCommand = (id: string) => {
    const close = useUiStore.getState().closeDialog;
    if (id === 'trash' || id === 'settings') {
      close();
      useUiStore.getState().openDialog(id);
      return;
    }
    if (id === 'new-category') {
      void useNotesStore.getState().createCategory().then((note) => {
        useSettingsStore.getState().setActiveCategory(note.id);
        useViewStore.getState().select(note.id, note.id);
        useUiStore.getState().startRename(note.id);
        close();
      });
      return;
    }
    const rootId = useSettingsStore.getState().settings.lastCategoryId;
    if (!rootId) return;
    void useNotesStore.getState().createNote({ parentId: rootId }).then((note) => {
      useViewStore.getState().select(rootId, note.id);
      useUiStore.getState().startRename(note.id);
      close();
    });
  };

  const openNote = (id: ID) => {
    const note = byId[id];
    if (!note) return;
    const path = getPath(treeIndex, id);
    const root = path[0];
    if (!root) return;
    useSettingsStore.getState().setActiveCategory(root.id);
    useViewStore.getState().select(root.id, id);
    useUiStore.getState().requestNavigation(id);
    closeDialog();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const rowCount = commandMode ? commands.length : results.length;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, rowCount - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
    } else if (event.key === 'Enter' && commandMode && commands[safeActive]) {
      event.preventDefault();
      runCommand(commands[safeActive].id);
    } else if (event.key === 'Enter' && !commandMode && results[safeActive]) {
      event.preventDefault();
      openNote(results[safeActive].id);
    }
  };

  return (
    <Dialog open onClose={closeDialog} title={t('search.titulo')} width="40rem">
      <div className="flex flex-col gap-3">
        <label className="sr-only" htmlFor="global-search">{t('search.placeholder')}</label>
        <div className="flex items-center gap-2 rounded-[var(--radius)] border border-border-strong bg-bg-app px-3 focus-within:border-accent">
          <Icon name="search" size={17} className="text-muted" />
          <input
            id="global-search"
            data-autofocus
            autoComplete="off"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
            onKeyDown={onKeyDown}
            placeholder={t('search.placeholder')}
            className="h-12 min-w-0 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted"
          />
          <kbd className="rounded border border-border bg-bg-editor px-1.5 py-0.5 text-xs text-muted">Esc</kbd>
        </div>
        <p className="text-xs text-muted">{commandMode ? t('search.comandosDica') : query.trim() ? t('search.dicas') : t('search.recentes')}</p>
        <div role="listbox" aria-label={t('search.titulo')} className="max-h-[50dvh] overflow-auto">
          {commandMode ? commands.map((command, position) => (
            <button
              key={command.id}
              type="button"
              role="option"
              aria-selected={position === safeActive}
              aria-label={t('search.executarComando', { nome: command.label })}
              onMouseEnter={() => setActiveIndex(position)}
              onClick={() => runCommand(command.id)}
              className={`flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-left text-sm ${position === safeActive ? 'bg-accent-bg text-text' : 'text-text hover:bg-bg-hover'}`}
            >
              <Icon name="command" size={16} className="text-accent" />
              {command.label}
            </button>
          )) : results.map((result, position) => {
            const note = byId[result.id];
            if (!note) return null;
            const path = getPath(treeIndex, note.id);
            const breadcrumb = path.map((item) => item.title || t('common.semTitulo')).join(' › ');
            return (
              <button
                key={note.id}
                type="button"
                role="option"
                aria-selected={position === safeActive}
                aria-label={t('search.abrir', { nome: note.title || t('common.semTitulo') })}
                onMouseEnter={() => setActiveIndex(position)}
                onClick={() => openNote(note.id)}
                className={`flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-left ${position === safeActive ? 'bg-accent-bg text-text' : 'text-text hover:bg-bg-hover'}`}
              >
                <Icon name={note.icon || 'circle'} size={16} className="shrink-0 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{note.title || t('common.semTitulo')}</span>
                  <span
                    className={`block truncate text-xs ${position === safeActive ? 'text-text' : 'text-muted'}`}
                  >
                    {breadcrumb}
                  </span>
                </span>
                {note.tags.length > 0 ? (
                  <span
                    className={`truncate text-xs ${position === safeActive ? 'text-text' : 'text-muted'}`}
                  >
                    {note.tags.join(', ')}
                  </span>
                ) : null}
              </button>
            );
          })}
          {(commandMode ? commands.length : results.length) === 0 ? <p className="px-3 py-8 text-center text-sm text-muted">{t('search.vazio')}</p> : null}
        </div>
      </div>
    </Dialog>
  );
}
