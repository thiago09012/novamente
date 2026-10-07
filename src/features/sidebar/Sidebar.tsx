import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { ColorPicker } from '@/features/pickers/ColorPicker';
import { IconPicker } from '@/features/pickers/IconPicker';
import { colorValue } from '@/features/pickers/colors';
import { useSidebarAnchorStore } from '@/features/sidebar/sidebarAnchorStore';
import { buildIndex, countDescendants } from '@/domain/tree';
import type { ID, Note } from '@/domain/types';
import { t } from '@/i18n';
import { useCategories, useNotesStore, useTrashCount } from '@/store/notesStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { useViewStore } from '@/store/viewStore';

interface MenuState {
  id: ID;
  position?: { x: number; y: number };
  anchor?: DOMRect;
  /** Elemento gatilho para devolver o foco (guardado em estado, não em ref). */
  trigger: HTMLElement | null;
}

interface PickerState {
  type: 'icon' | 'color';
  id: ID;
}

const LONG_PRESS_MS = 500;

export function Sidebar({
  collapsedOverride,
  hideCollapseControl = false,
}: {
  collapsedOverride?: boolean;
  hideCollapseControl?: boolean;
}) {
  const categories = useCategories();
  const trashCount = useTrashCount();
  const notes = useNotesStore();
  const settings = useSettingsStore((state) => state.settings);
  const updateSettings = useSettingsStore((state) => state.update);
  const startRename = useUiStore((state) => state.startRename);
  const pendingRenameId = useUiStore((state) => state.pendingRenameId);
  const clearRename = useUiStore((state) => state.startRename);
  const toast = useUiStore((state) => state.toast);
  const openDialog = useUiStore((state) => state.openDialog);

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [dropCategoryId, setDropCategoryId] = useState<ID | null>(null);
  const longPress = useRef<{ timer: number; id: ID } | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const activeBtnRef = useRef<HTMLButtonElement>(null);

  const index = useMemo(() => buildIndex(Object.values(notes.byId)), [notes.byId]);
  const descendantCounts = useMemo(
    () => new Map(categories.map((category) => [category.id, countDescendants(index, category.id)])),
    [categories, index],
  );
  const collapsed = collapsedOverride ?? settings.sidebarCollapsed;

  // Publica a origem das linhas sidebar→canvas (borda direita na altura
  // do item ativo, clamped à lista visível) — recalcula em scroll/resize.
  useEffect(() => {
    const publish = () => {
      const setAnchor = useSidebarAnchorStore.getState().setAnchor;
      const aside = asideRef.current;
      const nav = navRef.current;
      const button = activeBtnRef.current;
      if (!aside || !nav || !button) {
        setAnchor(null);
        return;
      }
      const asideRect = aside.getBoundingClientRect();
      const navRect = nav.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();
      const centerY = buttonRect.top + buttonRect.height / 2;
      const inView = centerY >= navRect.top && centerY <= navRect.bottom;
      const clamped = Math.min(Math.max(centerY, navRect.top + 4), navRect.bottom - 4);
      setAnchor({ x: asideRect.right, y: clamped, inView });
    };

    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        publish();
      });
    };

    publish();
    const nav = navRef.current;
    nav?.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    if (observer) {
      if (asideRef.current) observer.observe(asideRef.current);
      if (activeBtnRef.current) observer.observe(activeBtnRef.current);
    }
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      nav?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
    };
  }, [categories, settings.lastCategoryId, collapsed]);

  function cancelLongPress() {
    if (longPress.current) {
      window.clearTimeout(longPress.current.timer);
      longPress.current = null;
    }
  }

  useEffect(() => () => cancelLongPress(), []);

  async function guard(action: () => Promise<unknown>, success?: string) {
    try {
      await action();
      if (success) toast(success);
    } catch {
      toast(t('toast.erroSalvar'), { tone: 'error' });
    }
  }

  async function handleCreateCategory() {
    try {
      const note = await notes.createCategory('');
      toast(t('toast.categoriaCriada'));
      startRename(note.id);
    } catch {
      toast(t('toast.erroSalvar'), { tone: 'error' });
    }
  }

  function activate(id: ID) {
    useUiStore.getState().clearSelectedNodeIds();
    useSettingsStore.getState().setActiveCategory(id);
    useViewStore.getState().select(id, id);
  }

  function buildMenuItems(cat: Note, position: number, total: number): MenuItem[] {
    return [
      {
        id: 'open',
        label: t('sidebar.abrirNota'),
        icon: <Icon name="arrow-right" size={14} />,
        onSelect: () => activate(cat.id),
      },
      {
        id: 'icon',
        label: t('sidebar.trocarIcone'),
        icon: <Icon name="smile" size={14} />,
        onSelect: () => setPicker({ type: 'icon', id: cat.id }),
      },
      {
        id: 'color',
        label: t('sidebar.trocarCor'),
        icon: <Icon name="palette" size={14} />,
        onSelect: () => setPicker({ type: 'color', id: cat.id }),
      },
      {
        id: 'rename',
        label: t('common.renomear'),
        icon: <Icon name="pencil" size={14} />,
        onSelect: () => startRename(cat.id),
      },
      {
        id: 'up',
        label: t('sidebar.moverCima'),
        icon: <Icon name="arrow-up" size={14} />,
        disabled: position === 0,
        separatorBefore: true,
        onSelect: () => void guard(() => notes.reorderNote(cat.id, position - 1)),
      },
      {
        id: 'down',
        label: t('sidebar.moverBaixo'),
        icon: <Icon name="arrow-down" size={14} />,
        disabled: position >= total - 1,
        onSelect: () => void guard(() => notes.reorderNote(cat.id, position + 1)),
      },
      {
        id: 'duplicate',
        label: t('sidebar.duplicar'),
        icon: <Icon name="copy" size={14} />,
        separatorBefore: true,
        onSelect: () =>
          void guard(() => notes.duplicateNote(cat.id, true), t('toast.categoriaDuplicada')),
      },
      {
        id: 'trash',
        label: t('sidebar.moverLixeira'),
        icon: <Icon name="trash" size={14} />,
        danger: true,
        separatorBefore: true,
        onSelect: () => void deleteCategory(cat),
      },
    ];
  }

  async function deleteCategory(cat: Note) {
    try {
      const deleted = await notes.softDelete([cat.id]);
      const message =
        deleted.length > 1
          ? t('toast.notaExcluidaComFilhas', { n: deleted.length })
          : t('toast.categoriaExcluida');
      toast(message, {
        actionLabel: t('common.desfazer'),
        onAction: () => {
          void useNotesStore
            .getState()
            .restoreNotes([cat.id])
            .then(() => toast(t('toast.restaurada')))
            .catch(() => toast(t('toast.erroSalvar'), { tone: 'error' }));
        },
      });
    } catch {
      toast(t('toast.erroSalvar'), { tone: 'error' });
    }
  }

  function openMenuFor(id: ID, from: HTMLButtonElement | null) {
    setMenu(
      from ? { id, anchor: from.getBoundingClientRect(), trigger: from } : { id, trigger: null },
    );
  }

  function onRowPointerDown(event: React.PointerEvent, id: ID) {
    if (event.pointerType === 'mouse') return;
    cancelLongPress();
    const { clientX, clientY } = event;
    longPress.current = {
      id,
      timer: window.setTimeout(() => {
        setMenu({ id, position: { x: clientX, y: clientY }, trigger: null });
        longPress.current = null;
      }, LONG_PRESS_MS),
    };
  }

  const menuCategory = menu ? categories.find((cat) => cat.id === menu.id) : null;
  const menuPosition = menuCategory
    ? categories.findIndex((cat) => cat.id === menuCategory.id)
    : -1;
  const pickerNote = picker ? notes.byId[picker.id] : null;

  return (
    <aside
      ref={asideRef}
      className={`flex h-full shrink-0 flex-col border-r border-border bg-bg-sidebar transition-[width] duration-[var(--dur-slow)] ${
        collapsed ? 'w-14' : 'w-60'
      }`}
      aria-label={t('a11y.barraLateral')}
    >
      {/* Cabeçalho */}
      <div
        className={`flex h-14 shrink-0 items-center gap-2 px-3 ${collapsed ? 'justify-center px-1' : ''}`}
      >
        {!collapsed ? (
          <h1 className="flex-1 truncate text-base font-semibold tracking-wide text-text">
            <Icon name="list-tree" size={16} className="mr-1.5 inline align-[-2px]" />
            {t('app.name')}
          </h1>
        ) : null}
        {hideCollapseControl ? null : (
          <button
            type="button"
            onClick={() => void updateSettings({ sidebarCollapsed: !collapsed })}
            aria-label={collapsed ? t('sidebar.expandir') : t('sidebar.recolher')}
            title={collapsed ? t('sidebar.expandir') : t('sidebar.recolher')}
            className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-muted hover:bg-bg-hover hover:text-text"
          >
            <Icon name="sidebar" size={16} />
          </button>
        )}
      </div>

      {/* Criar categoria */}
      <div className={collapsed ? 'px-2 pb-2' : 'px-3 pb-2'}>
        <Button
          variant="primary"
          size="sm"
          className="w-full"
          onClick={() => void handleCreateCategory()}
          aria-label={t('sidebar.novaCategoria')}
          title={t('sidebar.novaCategoria')}
          icon={<Icon name="plus" size={14} />}
        >
          {collapsed ? '' : t('sidebar.novaCategoria')}
        </Button>
      </div>

      <div className={collapsed ? 'px-2 pb-2' : 'px-3 pb-2'}>
        <button
          type="button"
          onClick={() => openDialog('search')}
          aria-label={t('search.titulo')}
          title={`${t('search.titulo')} (Ctrl+K)`}
          className={`flex h-10 w-full items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-bg-app px-2 text-sm text-muted hover:border-border-strong hover:text-text ${collapsed ? 'justify-center' : ''}`}
        >
          <Icon name="search" size={15} />
          {!collapsed ? <><span className="flex-1 text-left">{t('search.titulo')}</span><kbd className="text-[10px]">Ctrl+K</kbd></> : null}
        </button>
      </div>

      {/* Lista de categorias */}
      <nav ref={navRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <h2
          className={`${collapsed ? 'sr-only' : 'px-2 pt-1 pb-1.5'} text-xs font-semibold tracking-wide text-muted uppercase`}
        >
          {t('sidebar.titulo')}
        </h2>

        {categories.length === 0 ? (
          <div
            className={`mt-2 rounded-[var(--radius)] border border-dashed border-border p-3 ${collapsed ? 'hidden' : ''}`}
          >
            <p className="text-sm font-medium text-text">{t('sidebar.vazioTitulo')}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{t('sidebar.vazioTexto')}</p>
          </div>
        ) : (
          <ul role="list" className="flex flex-col gap-0.5">
            {categories.map((cat) => {
              const isRenaming = pendingRenameId === cat.id;
              const isActive = settings.lastCategoryId === cat.id;
              const count = descendantCounts.get(cat.id) ?? 0;
              const label = cat.title || t('common.semTitulo');
              return (
                <li key={cat.id}>
                  {isRenaming ? (
                    <input
                      defaultValue={cat.title}
                      placeholder={t('sidebar.placeholderNovo')}
                      autoFocus
                      onFocus={(event) => event.target.select()}
                      className="h-11 w-full rounded-[var(--radius)] border border-accent bg-bg-app px-2 text-sm text-text outline-none placeholder:text-muted"
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          clearRename(null);
                        }
                        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                          event.preventDefault();
                          const value = event.currentTarget.value;
                          void guard(() => notes.renameNote(cat.id, value)).then(() =>
                            clearRename(null),
                          );
                        }
                      }}
                      onBlur={(event) => {
                        const value = event.currentTarget.value;
                        void guard(() => notes.renameNote(cat.id, value)).then(() =>
                          clearRename(null),
                        );
                      }}
                    />
                  ) : (
                    <div className="group relative">
                      <button
                        ref={isActive ? activeBtnRef : undefined}
                        type="button"
                        aria-current={isActive ? 'true' : undefined}
                        onClick={() => activate(cat.id)}
                        onDoubleClick={() => startRename(cat.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'F2') {
                            event.preventDefault();
                            startRename(cat.id);
                          }
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setMenu({
                            id: cat.id,
                            position: { x: event.clientX, y: event.clientY },
                            trigger: null,
                          });
                        }}
                        onPointerDown={(event) => onRowPointerDown(event, cat.id)}
                        onPointerUp={cancelLongPress}
                        onPointerLeave={cancelLongPress}
                        onPointerCancel={cancelLongPress}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'move';
                          setDropCategoryId(cat.id);
                        }}
                        onDragLeave={() => setDropCategoryId(null)}
                        onDrop={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setDropCategoryId(null);
                          const sourceId = event.dataTransfer.getData('application/x-mente-note') || event.dataTransfer.getData('text/plain');
                          if (!sourceId) return;
                          void useNotesStore
                            .getState()
                            .moveNote(sourceId, cat.id)
                            .then(() => {
                              activate(cat.id);
                              useViewStore.getState().select(cat.id, sourceId);
                            })
                            .catch(() => toast(t('toast.erroMoverNota'), { tone: 'error' }));
                        }}
                        title={collapsed ? label : undefined}
                        className={`flex h-11 w-full items-center gap-2 rounded-[var(--radius)] border px-2 pr-9 text-left transition-colors ${dropCategoryId === cat.id ? 'border-dashed border-accent ring-2 ring-accent/30' : ''} ${
                          isActive
                            ? 'border-accent bg-accent-bg text-on-accent'
                            : 'border-transparent text-text hover:bg-bg-hover'
                        }`}
                        style={
                          colorValue(cat.color)
                            ? { boxShadow: `inset 3px 0 0 ${colorValue(cat.color)}` }
                            : undefined
                        }
                      >
                        <Icon name={cat.icon} size={16} className="shrink-0" />
                        <span className="truncate text-sm font-medium">{label}</span>
                        {!collapsed && count > 0 ? (
                          <span
                            className={`ml-auto text-xs tabular-nums ${isActive ? 'text-on-accent/80' : 'text-muted'}`}
                          >
                            {count}
                          </span>
                        ) : null}
                      </button>
                      {!collapsed ? (
                        <button
                          type="button"
                          aria-label={t('sidebar.expandirMenu', { nome: label })}
                          title={t('sidebar.expandirMenu', { nome: label })}
                          onClick={(event) => openMenuFor(cat.id, event.currentTarget)}
                          className="absolute top-1 right-1 flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-bg-app hover:text-text focus-visible:opacity-100"
                        >
                          <Icon name="more-horizontal" size={16} />
                        </button>
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </nav>

      {/* Rodapé */}
      <div className="flex flex-col gap-1 border-t border-border p-2">
        <FooterButton
          collapsed={collapsed}
          icon={<Icon name="trash" size={16} />}
          label={t('trash.abrir')}
          badge={trashCount > 0 ? trashCount : undefined}
          onClick={() => openDialog('trash')}
        />
        <FooterButton
          collapsed={collapsed}
          icon={<Icon name="settings" size={16} />}
          label={t('settings.abrir')}
          onClick={() => openDialog('settings')}
        />
        <FooterButton
          collapsed={collapsed}
          icon={<Icon name="help" size={16} />}
          label={t('help.abrir')}
          onClick={() => openDialog('help')}
        />
      </div>

      {menu && menuCategory ? (
        <Menu
          items={buildMenuItems(menuCategory, menuPosition, categories.length)}
          label={t('sidebar.expandirMenu', { nome: menuCategory.title || t('common.semTitulo') })}
          onClose={() => setMenu(null)}
          position={menu.position}
          anchor={menu.anchor}
          returnFocusTo={menu.trigger}
        />
      ) : null}

      {picker && pickerNote ? (
        <>
          <IconPicker
            open={picker.type === 'icon'}
            current={pickerNote.icon}
            onClose={() => setPicker(null)}
            onSelect={(icon) =>
              void guard(() => notes.setNoteIcon(picker.id, icon), t('toast.iconeSalvo'))
            }
          />
          <ColorPicker
            open={picker.type === 'color'}
            current={pickerNote.color}
            onClose={() => setPicker(null)}
            onSelect={(color) =>
              void guard(() => notes.setNoteColor(picker.id, color), t('toast.corSalva'))
            }
          />
        </>
      ) : null}
    </aside>
  );
}

interface FooterButtonProps {
  collapsed: boolean;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  onClick: () => void;
}

function FooterButton({ collapsed, icon, label, badge, onClick }: FooterButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`relative flex h-11 items-center gap-2 rounded-[var(--radius)] text-sm text-muted transition-colors hover:bg-bg-hover hover:text-text ${
        collapsed ? 'justify-center px-0' : 'px-2.5'
      }`}
    >
      {icon}
      {!collapsed ? <span className="truncate">{label}</span> : null}
      {badge !== undefined ? (
        <span
          className={`absolute flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-semibold text-white ${
            collapsed ? 'top-1 right-1' : 'top-1.5 right-1.5'
          }`}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
    </button>
  );
}
