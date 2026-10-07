import { Suspense, lazy, useEffect, useState } from 'react';

import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Button } from '@/components/ui/Button';
import { ToastHost } from '@/components/ui/ToastHost';
import { Canvas } from '@/features/canvas/Canvas';
import { Icon } from '@/components/ui/Icon';
import { MobileTreeList } from '@/features/mobile/MobileTreeList';
import { SettingsDialog } from '@/features/settings/SettingsDialog';
import { Sidebar } from '@/features/sidebar/Sidebar';
import { TrashPanel } from '@/features/trash/TrashPanel';
import { SearchDialog } from '@/features/search/SearchDialog';
import { buildIndex, getPath, isAlive } from '@/domain/tree';
import { t } from '@/i18n';
import { useNotesStore } from '@/store/notesStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { useViewStore } from '@/store/viewStore';

const EditorPanel = lazy(() =>
  import('@/features/editor/EditorPanel').then((module) => ({ default: module.EditorPanel })),
);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function readMobileViewport() {
  const compactQuery =
    typeof window.matchMedia === 'function'
      ? window.matchMedia(
          '(max-width: 639px), (max-width: 900px) and (orientation: landscape), (max-height: 500px) and (orientation: landscape)',
        ).matches
      : window.innerWidth < 640 ||
        ((window.innerWidth <= 900 || window.innerHeight <= 500) &&
          window.innerWidth > window.innerHeight);
  const landscapeQuery =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(orientation: landscape)').matches
      : window.innerWidth > window.innerHeight;
  return { compact: compactQuery, landscape: landscapeQuery };
}

/** Layout: barra lateral | canvas | editor (opcional) + overlays. */
export function AppShell({ memoryOnly = false }: { memoryOnly?: boolean }) {
  const [canvasWide, setCanvasWide] = useState(false);
  const [mobileViewport, setMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? readMobileViewport() : { compact: false, landscape: false },
  );
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileNoteOpen, setMobileNoteOpen] = useState(false);
  const [mobileView, setMobileView] = useState<'list' | 'map' | null>(null);
  const settings = useSettingsStore((state) => state.settings);
  const runtimeMemoryOnly = useUiStore((state) => state.memoryOnly);
  const byId = useNotesStore((state) => state.byId);
  const dialog = useUiStore((state) => state.dialog);

  useEffect(() => {
    const compactQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia(
            '(max-width: 639px), (max-width: 900px) and (orientation: landscape), (max-height: 500px) and (orientation: landscape)',
          )
        : null;
    const orientationQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(orientation: landscape)')
        : null;
    const syncViewport = () => setMobileViewport(readMobileViewport());
    syncViewport();
    compactQuery?.addEventListener('change', syncViewport);
    orientationQuery?.addEventListener('change', syncViewport);
    window.addEventListener('resize', syncViewport);
    return () => {
      compactQuery?.removeEventListener('change', syncViewport);
      orientationQuery?.removeEventListener('change', syncViewport);
      window.removeEventListener('resize', syncViewport);
    };
  }, []);

  const active = settings.lastCategoryId ? (byId[settings.lastCategoryId] ?? null) : null;
  const activeValid = active !== null && isAlive(active) && active.parentId === null;
  const showMobileMap = mobileViewport.compact
    ? (mobileView ?? (mobileViewport.landscape ? 'map' : 'list')) === 'map'
    : false;

  const openMobileNote = (id: string) => {
    const rootId = useSettingsStore.getState().settings.lastCategoryId;
    if (rootId) useViewStore.getState().select(rootId, id);
    setMobileNoteOpen(true);
  };

  const createMobileNote = async () => {
    const rootId = useSettingsStore.getState().settings.lastCategoryId;
    if (!rootId) return;
    try {
      const note = await useNotesStore.getState().createNote({ parentId: rootId });
      useViewStore.getState().select(rootId, note.id);
      setMobileNoteOpen(true);
    } catch {
      useUiStore.getState().toast(t('toast.erroSalvar'), { tone: 'error' });
    }
  };

  // Categoria ativa inválida (excluída) → primeira categoria viva (seção 8.4).
  useEffect(() => {
    if (activeValid) return;
    const store = useSettingsStore.getState();
    if (store.status !== 'ready' || useNotesStore.getState().status !== 'ready') return;
    const first = Object.values(useNotesStore.getState().byId)
      .filter((note) => note.parentId === null && isAlive(note))
      .sort((a, b) => (a.orderKey < b.orderKey ? -1 : 1))[0];
    if (first) {
      store.setActiveCategory(first.id);
      useViewStore.getState().select(first.id, first.id);
    }
  }, [activeValid, byId]);

  useEffect(() => {
    let historyQueue = Promise.resolve();
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const modifier = event.metaKey || event.ctrlKey;
      if (!modifier || event.altKey) return;
      const key = event.key.toLowerCase();
      const current = useSettingsStore.getState();
      const update = (patch: Parameters<typeof current.update>[0]) => {
        void current
          .update(patch)
          .catch(() => useUiStore.getState().toast(t('toast.erroSalvar'), { tone: 'error' }));
      };
      const runHistory = (redo: boolean) => {
        historyQueue = historyQueue
          .then(async () => {
            const store = useNotesStore.getState();
            const targetId = await (redo ? store.redo() : store.undo());
            if (!targetId) return;
            const state = useNotesStore.getState();
            const target = state.byId[targetId];
            if (!target) return;
            if (target.parentId === null) {
              useSettingsStore.getState().setActiveCategory(target.id);
              useViewStore.getState().select(target.id, target.id);
              return;
            }
            const path = getPath(buildIndex(Object.values(state.byId)), target.id);
            const root = path[0];
            if (!root) return;
            useSettingsStore.getState().setActiveCategory(root.id);
            useViewStore.getState().select(root.id, target.id);
            useUiStore.getState().requestNavigation(target.id);
          })
          .catch(() => useUiStore.getState().toast(t('toast.erroSalvar'), { tone: 'error' }));
      };

      if (key === 'z') {
        event.preventDefault();
        runHistory(event.shiftKey);
      } else if (key === 'y' && !event.shiftKey) {
        event.preventDefault();
        runHistory(true);
      } else if (key === 'b' && !event.shiftKey) {
        event.preventDefault();
        update({ sidebarCollapsed: !current.settings.sidebarCollapsed });
      } else if (key === '\\' && !event.shiftKey) {
        event.preventDefault();
        update({ editorOpen: !current.settings.editorOpen });
      } else if (key === '/' && !event.shiftKey) {
        event.preventDefault();
        useUiStore.getState().openDialog('help');
      } else if (key === 'k' && !event.shiftKey) {
        event.preventDefault();
        useUiStore.getState().openDialog('search');
      } else if (key === 'n' && event.shiftKey) {
        event.preventDefault();
        void useNotesStore
          .getState()
          .createCategory()
          .then((note) => {
            current.setActiveCategory(note.id);
            useViewStore.getState().select(note.id, note.id);
            useUiStore.getState().startRename(note.id);
          })
          .catch(() => useUiStore.getState().toast(t('toast.erroSalvar'), { tone: 'error' }));
      } else if (key === 'n' && !event.shiftKey) {
        event.preventDefault();
        const rootId = current.settings.lastCategoryId;
        if (!rootId) return;
        void useNotesStore
          .getState()
          .createNote({ parentId: rootId })
          .then((note) => {
            useViewStore.getState().select(rootId, note.id);
            useUiStore.getState().startRename(note.id);
          })
          .catch(() => useUiStore.getState().toast(t('toast.erroSalvar'), { tone: 'error' }));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-bg-app text-text">
      {memoryOnly || runtimeMemoryOnly ? (
        <div
          role="alert"
          className="flex min-h-11 shrink-0 items-center justify-center gap-3 border-b border-warning/50 bg-bg-raised px-3 py-1.5 text-center text-xs text-text"
        >
          <span>{t('erros.avisoMemoria')}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => useUiStore.getState().openDialog('settings')}
          >
            {t('erros.exportarAgora')}
          </Button>
        </div>
      ) : null}

      {mobileViewport.compact ? (
        <section
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
          data-testid="mobile-shell"
          onKeyDownCapture={(event) => {
            if (event.key === 'Escape') {
              setMobileDrawerOpen(false);
              setMobileNoteOpen(false);
            }
          }}
        >
          <header className="z-20 flex h-14 shrink-0 items-center gap-1 border-b border-border bg-bg-raised px-2">
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted active:bg-bg-hover"
              aria-label={t('mobile.abrirCategorias')}
              onClick={() => setMobileDrawerOpen(true)}
            >
              <Icon name="menu" size={20} />
            </button>
            <Icon name={active?.icon ?? 'list-tree'} size={17} className="shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
              {active?.title || t('app.name')}
            </span>
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted active:bg-bg-hover"
              aria-label={showMobileMap ? t('mobile.verLista') : t('mobile.verMapa')}
              title={showMobileMap ? t('mobile.verLista') : t('mobile.verMapa')}
              onClick={() => setMobileView(showMobileMap ? 'list' : 'map')}
            >
              <Icon name={showMobileMap ? 'list-tree' : 'map'} size={19} />
            </button>
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted active:bg-bg-hover"
              aria-label={t('mobile.novaNota')}
              onClick={() => void createMobileNote()}
            >
              <Icon name="plus" size={20} />
            </button>
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted active:bg-bg-hover"
              aria-label={t('search.titulo')}
              onClick={() => useUiStore.getState().openDialog('search')}
            >
              <Icon name="search" size={19} />
            </button>
            {mobileViewport.landscape ? (
              <button
                type="button"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted active:bg-bg-hover"
                aria-label={t('trash.abrir')}
                title={t('trash.abrir')}
                onClick={() => useUiStore.getState().openDialog('trash')}
              >
                <Icon name="trash" size={19} />
              </button>
            ) : null}
          </header>

          <div className="relative flex min-h-0 flex-1 flex-col">
            {showMobileMap ? (
              <ErrorBoundary panel="canvas">
                <Canvas onMobileSelect={openMobileNote} showWideViewToggle={false} mobileCanvas />
              </ErrorBoundary>
            ) : (
              <MobileTreeList rootId={settings.lastCategoryId} onOpenNote={openMobileNote} />
            )}
          </div>

          {!mobileViewport.landscape ? (
            <nav
              className="z-20 flex h-14 shrink-0 items-stretch justify-around border-t border-border bg-bg-raised"
              aria-label={t('mobile.navegarMobile')}
            >
              <button
                type="button"
                className={`flex min-w-16 flex-col items-center justify-center gap-0.5 text-[10px] ${showMobileMap ? 'text-muted' : 'font-semibold text-accent'}`}
                aria-pressed={!showMobileMap}
                onClick={() => setMobileView('list')}
              >
                <Icon name="list-tree" size={18} />
                {t('mobile.listaNotas')}
              </button>
              <button
                type="button"
                className={`flex min-w-16 flex-col items-center justify-center gap-0.5 text-[10px] ${showMobileMap ? 'font-semibold text-accent' : 'text-muted'}`}
                aria-pressed={showMobileMap}
                onClick={() => setMobileView('map')}
              >
                <Icon name="map" size={18} />
                {t('mobile.mapa')}
              </button>
              <button
                type="button"
                className="flex min-w-16 flex-col items-center justify-center gap-0.5 text-[10px] text-muted"
                onClick={() => setMobileDrawerOpen(true)}
              >
                <Icon name="folder" size={18} />
                {t('mobile.categoriasDrawer')}
              </button>
              <button
                type="button"
                className="flex min-w-16 flex-col items-center justify-center gap-0.5 text-[10px] text-muted"
                onClick={() => useUiStore.getState().openDialog('settings')}
              >
                <Icon name="settings" size={18} />
                {t('settings.titulo')}
              </button>
            </nav>
          ) : null}

          {mobileDrawerOpen ? (
            <div
              className="fixed inset-0 z-40 bg-black/35"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setMobileDrawerOpen(false);
              }}
            >
              <div className="h-full w-60 shadow-2xl" onClick={() => setMobileDrawerOpen(false)}>
                <Sidebar
                  collapsedOverride={false}
                  hideCollapseControl
                  hideTrashButton={mobileViewport.landscape}
                />
              </div>
            </div>
          ) : null}

          {mobileNoteOpen ? (
            <div
              className={`fixed inset-0 z-40 flex bg-black/35 ${mobileViewport.landscape ? 'justify-end' : 'items-end'}`}
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setMobileNoteOpen(false);
              }}
            >
              <div
                className={mobileViewport.landscape ? 'h-full w-[min(390px,88vw)]' : 'w-full'}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <ErrorBoundary panel="editor">
                  <Suspense
                    fallback={
                      <div className="h-[70dvh] rounded-t-2xl bg-bg-editor p-6">
                        <div className="h-5 w-40 animate-pulse rounded bg-bg-hover" />
                      </div>
                    }
                  >
                    <EditorPanel
                      mobilePresentation={mobileViewport.landscape ? 'side' : 'sheet'}
                      onMobileClose={() => setMobileNoteOpen(false)}
                    />
                  </Suspense>
                </ErrorBoundary>
              </div>
            </div>
          ) : null}
        </section>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <ErrorBoundary panel="sidebar">
            <Sidebar collapsedOverride={canvasWide ? true : undefined} />
          </ErrorBoundary>

          <main className="flex min-w-0 flex-1 overflow-hidden">
            <ErrorBoundary panel="canvas">
              <div className="min-w-0 flex-1">
                <Canvas
                  wideView={canvasWide}
                  onToggleWideView={() => setCanvasWide((wide) => !wide)}
                />
              </div>
            </ErrorBoundary>

            {settings.editorOpen && !canvasWide ? (
              <ErrorBoundary panel="editor">
                <Suspense
                  fallback={
                    <div className="flex w-[420px] shrink-0 flex-col gap-4 border-l border-border bg-bg-editor p-6">
                      <div className="h-4 w-40 animate-pulse rounded bg-bg-hover" />
                      <div className="h-8 w-3/4 animate-pulse rounded bg-bg-hover" />
                      <div className="h-4 w-full animate-pulse rounded bg-bg-hover" />
                    </div>
                  }
                >
                  <EditorPanel />
                </Suspense>
              </ErrorBoundary>
            ) : null}
          </main>
        </div>
      )}

      <ToastHost />

      {dialog === 'trash' ? <TrashPanel /> : null}
      {dialog === 'settings' || dialog === 'help' ? (
        <SettingsDialog key={dialog} initialPage={dialog === 'help' ? 'help' : 'appearance'} />
      ) : null}
      {dialog === 'search' ? <SearchDialog /> : null}
    </div>
  );
}
