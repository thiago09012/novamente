import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { ColorPicker } from '@/features/pickers/ColorPicker';
import { IconPicker } from '@/features/pickers/IconPicker';
import { CULLING_MARGIN, DENSITY_NODE_PX, ZOOM_LEGIBLE_MIN } from '@/domain/constants';
import { buildIndex, countDescendants, depthOf, getDescendants, getPath, isAlive } from '@/domain/tree';
import type { ID, Note } from '@/domain/types';
import { t } from '@/i18n';
import { CATEGORY_PARENT_KEY, useNotesStore } from '@/store/notesStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import {
  clampZoom,
  easeOut,
  selectViewById,
  useViewStore,
  type CategoryView,
} from '@/store/viewStore';

import { CanvasEdges } from './CanvasEdges';
import { CanvasMinimap } from './CanvasMinimap';
import { CanvasNode } from './CanvasNode';
import { CanvasToolbar } from './CanvasToolbar';
import { SidebarLines } from './SidebarLines';
import {
  buildLayout,
  intersects,
  nodeRect,
  pathToNode,
  type LayoutNode,
  type WorldRect,
} from './layout';
import { useLayoutStore } from './layoutStore';
import { createApproximateTextMeasure, createTextMeasure } from './measure';

/** Duração das transições estruturais (expandir/recolher) — sincroniza com o CSS. */
const DURATION_STRUCTURAL = 200;
/** Centralizar/animar pan: 400 ms ease-out (§5.3). */
const DURATION_CENTER = 400;
const PAN_CLICK_SLOP = 4;
const AUTO_PAN_EDGE_PX = 56;
const AUTO_PAN_MAX_SPEED = 12;
const TOUCH_DRAG_HOLD_MS = 450;
const TOUCH_DRAG_SLOP = 8;

interface TouchDragState {
  pointerId: number;
  sourceId: ID;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  timer: number | null;
  targetId: ID | null;
  position: 'inside' | 'before' | 'after' | null;
}

interface TouchDragPreview {
  sourceId: ID;
  x: number;
  y: number;
  targetId: ID | null;
}

interface ContextMenuState {
  id: ID;
  position: { x: number; y: number };
}

interface PickerState {
  type: 'icon' | 'color';
  id?: ID;
  ids?: ID[];
}

function currentRootId(): ID | null {
  return useSettingsStore.getState().settings.lastCategoryId;
}

function currentView(rootId: ID | null): CategoryView {
  return selectViewById(useViewStore.getState(), rootId);
}

function escapeAttr(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/["\\]/g, '\\$&');
}

function measureCanvasPhase<T>(name: string, action: () => T): T {
  let enabled = false;
  try {
    enabled = typeof window !== 'undefined' && window.sessionStorage.getItem('mente-perf-phases') === '1';
  } catch {
    // O profiling é opcional; falha de sessionStorage não afeta o canvas.
  }
  if (!enabled) return action();
  const start = performance.now();
  const result = action();
  performance.measure(`mente:${name}`, { start, end: performance.now() });
  return result;
}

/** Canvas da árvore: layout d3, pan/zoom, culling, CRUD e navegação ARIA. */
export function Canvas({
  wideView = false,
  onToggleWideView = () => undefined,
  onMobileSelect,
  showWideViewToggle = true,
  mobileCanvas = false,
}: {
  wideView?: boolean;
  onToggleWideView?: () => void;
  onMobileSelect?: (id: ID) => void;
  showWideViewToggle?: boolean;
  mobileCanvas?: boolean;
}) {
  const rootId = useSettingsStore((state) => state.settings.lastCategoryId);
  const settings = useSettingsStore((state) => state.settings);
  const byId = useNotesStore((state) => state.byId);
  const childIds = useNotesStore((state) => state.childIds);
  const noteLinks = useNotesStore((state) => state.links);
  const view = useViewStore((state) => selectViewById(state, rootId));
  const pendingRenameId = useUiStore((state) => state.pendingRenameId);
  const selectedNodeIds = useUiStore((state) => state.selectedNodeIds);
  const clearSelectedNodeIds = useUiStore((state) => state.clearSelectedNodeIds);
  const toast = useUiStore((state) => state.toast);
  const navigationRequestId = useUiStore((state) => state.navigationRequestId);

  const treeRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
  const [selectionRect, setSelectionRect] = useState<WorldRect | null>(null);
  const [touchDragPreview, setTouchDragPreview] = useState<TouchDragPreview | null>(null);
  const [bulkTag, setBulkTag] = useState('');
  const [bulkTargetCategoryId, setBulkTargetCategoryId] = useState('');
  const [focus, setFocus] = useState<{ rootId: ID; nodeId: ID } | null>(null);
  const focusNodeId = focus?.rootId === rootId ? focus.nodeId : null;
  const centerOnNextId = useRef<{ rootId: ID; id: ID } | null>(null);
  const mobileFitOrientation = useRef<'portrait' | 'landscape' | null>(null);

  // Trocar de categoria sai do modo foco: ajuste de estado durante o render
  // (padrão React "adjusting state when a prop changes"). Centralizações
  // pendentes de outra categoria já são ignoradas pelo guard do effect.
  const [prevRootId, setPrevRootId] = useState(rootId);
  if (prevRootId !== rootId) {
    setPrevRootId(rootId);
    setFocus(null);
  }

  const labelFontSize = Math.round(14 * settings.uiScale);
  const measure = useMemo(() => createTextMeasure(labelFontSize), [labelFontSize]);
  const approximateMeasure = useMemo(
    () => createApproximateTextMeasure(labelFontSize),
    [labelFontSize],
  );
  const [fontTick, setFontTick] = useState(0);

  // Densidade/escala = as mesmas variáveis CSS aplicadas em settingsStore.
  const nodeHeight = Math.round(DENSITY_NODE_PX[settings.density] * settings.uiScale);

  const focusLayout = useMemo(() => {
    if (!focusNodeId || !rootId) {
      return {
        childIds,
        expanded: view.expanded,
        activeNodeId: null as ID | null,
        path: [] as Note[],
      };
    }
    const index = buildIndex(Object.values(byId));
    const path = getPath(index, focusNodeId);
    if (path[0]?.id !== rootId || !isAlive(byId[focusNodeId])) {
      return {
        childIds,
        expanded: view.expanded,
        activeNodeId: null as ID | null,
        path: [] as Note[],
      };
    }

    const included = new Set(path.map((note) => note.id));
    for (const note of getDescendants(index, focusNodeId)) included.add(note.id);
    const scopedChildIds: Record<string, ID[]> = {};
    for (const [parentId, ids] of Object.entries(childIds)) {
      const visible = ids.filter((id) => included.has(id));
      if (visible.length > 0) scopedChildIds[parentId] = visible;
    }
    const expanded = { ...view.expanded };
    // Mantém aberto apenas o caminho até o nó focado. O próprio ramo focado
    // continua respeitando seu estado, para que possa ser recolhido no foco.
    for (const note of path.slice(1, -1)) expanded[note.id] = true;
    return { childIds: scopedChildIds, expanded, activeNodeId: focusNodeId, path };
  }, [byId, childIds, focusNodeId, rootId, view.expanded]);

  // Fonte medida antes da Inter carregar → re-layout quando pronta.
  useEffect(() => {
    let alive = true;
    if (typeof document !== 'undefined' && document.fonts) {
      void document.fonts.ready.then(() => {
        if (alive) setFontTick((value) => value + 1);
      });
    }
    return () => {
      alive = false;
    };
  }, []);

  const layoutInput = useMemo(
    () => ({
      rootId: rootId ?? '__none__',
      byId,
      childIds: focusLayout.childIds,
      expanded: focusLayout.expanded,
      nodeHeight,
      measure,
      approximateMeasure,
      fontTick,
    }),
    [rootId, byId, focusLayout, nodeHeight, measure, approximateMeasure, fontTick],
  );

  const layout = useMemo(
    () => measureCanvasPhase('layout', () => buildLayout(layoutInput)),
    [layoutInput],
  );

  const layoutNodeById = useMemo(
    () => new Map(layout.nodes.map((node) => [node.id, node])),
    [layout.nodes],
  );
  const byParent = useMemo(() => {
    const map = new Map<ID, LayoutNode[]>();
    for (const node of layout.nodes) {
      const siblings = map.get(node.parentId);
      if (siblings) siblings.push(node);
      else map.set(node.parentId, [node]);
    }
    return map;
  }, [layout.nodes]);

  // Compartilha o layout com as linhas da sidebar.
  useLayoutEffect(() => {
    useLayoutStore.getState().setLayout(
      layoutNodeById,
      rootId ? (focusLayout.childIds[rootId] ?? []) : [],
    );
  }, [layoutNodeById, focusLayout.childIds, rootId]);

  // View da categoria ativa (primeira visita lê do banco).
  useEffect(() => {
    if (rootId) void useViewStore.getState().loadView(rootId);
  }, [rootId]);

  const measureViewport = useCallback(() => {
    const element = viewportRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setViewportSize({ w: rect.width, h: rect.height });
    useLayoutStore.getState().setViewport({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
  }, []);

  useLayoutEffect(() => {
    measureViewport();
  }, [measureViewport, settings.sidebarCollapsed, settings.editorWidth, settings.editorOpen]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measureViewport);
      return () => window.removeEventListener('resize', measureViewport);
    }
    const observer = new ResizeObserver(() => measureViewport());
    observer.observe(element);
    return () => observer.disconnect();
  }, [measureViewport]);

  // Flush da navegação ao sair da página (nada se perde ao fechar aba).
  useEffect(() => {
    const flush = () => void useViewStore.getState().flush();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // ---------- seleção / edição ----------

  const select = useCallback((id: ID | null) => {
    const root = currentRootId();
    if (root) useViewStore.getState().select(root, id);
  }, []);

  const focusNode = useCallback((id: ID) => {
    const element = treeRef.current?.querySelector<HTMLElement>(
      `[data-node-id="${escapeAttr(id)}"]`,
    );
    element?.focus({ preventScroll: false });
  }, []);

  const selectAndFocus = useCallback(
    (id: ID) => {
      clearSelectedNodeIds();
      select(id);
      focusNode(id);
    },
    [clearSelectedNodeIds, select, focusNode],
  );

  useEffect(() => {
    if (!navigationRequestId) return;
    const target = byId[navigationRequestId];
    if (!target || !isAlive(target)) {
      useUiStore.getState().clearNavigationRequest();
      return;
    }
    const path = getPath(buildIndex(Object.values(byId)), target.id);
    const category = path.find((part) => part.parentId === null);
    if (!category) {
      useUiStore.getState().clearNavigationRequest();
      return;
    }

    let cancelled = false;
    void (async () => {
      await useViewStore.getState().loadView(category.id);
      if (cancelled) return;
      const current = currentView(category.id);
      const expanded = { ...current.expanded };
      for (const ancestor of path.slice(1, -1)) expanded[ancestor.id] = true;
      useSettingsStore.getState().setActiveCategory(category.id);
      useViewStore.getState().patch(category.id, { expanded, selectedId: target.id });
      centerOnNextId.current = target.id === category.id ? null : { rootId: category.id, id: target.id };
      useUiStore.getState().clearNavigationRequest();
    })();
    return () => {
      cancelled = true;
    };
  }, [byId, navigationRequestId]);

  const openEditor = useCallback(() => {
    if (!useSettingsStore.getState().settings.editorOpen) {
      void useSettingsStore.getState().update({ editorOpen: true });
    }
  }, []);

  const openNodeFromMenu = useCallback(
    (id: ID) => {
      selectAndFocus(id);
      openEditor();
    },
    [openEditor, selectAndFocus],
  );

  const focusBranch = useCallback(
    (id: ID) => {
      const activeRoot = currentRootId();
      if (!activeRoot) return;
      centerOnNextId.current = { rootId: activeRoot, id };
      setFocus({ rootId: activeRoot, nodeId: id });
      selectAndFocus(id);
    },
    [selectAndFocus],
  );

  const handleSelect = useCallback(
    (id: ID, modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
      const ui = useUiStore.getState();
      const root = currentRootId();
      const current = currentView(root);
      if (modifiers.shiftKey && current.selectedId) {
        const anchor = layoutNodeById.get(current.selectedId);
        const target = layoutNodeById.get(id);
        if (anchor && target && anchor.parentId === target.parentId) {
          const siblings = byParent.get(target.parentId) ?? [];
          const from = siblings.findIndex((item) => item.id === anchor.id);
          const to = siblings.findIndex((item) => item.id === target.id);
          const range = siblings.slice(Math.min(from, to), Math.max(from, to) + 1).map((item) => item.id);
          ui.setSelectedNodeIds(range);
        } else {
          ui.setSelectedNodeIds([id]);
        }
      } else if (modifiers.ctrlKey || modifiers.metaKey) {
        const selected = new Set(ui.selectedNodeIds.length ? ui.selectedNodeIds : [current.selectedId ?? id]);
        if (selected.has(id)) selected.delete(id);
        else selected.add(id);
        ui.setSelectedNodeIds([...selected]);
      } else {
        ui.clearSelectedNodeIds();
      }
      select(id);
      onMobileSelect?.(id);
    },
    [byParent, layoutNodeById, onMobileSelect, select],
  );

  const handleOpen = useCallback(
    (id: ID) => {
      if (onMobileSelect) onMobileSelect(id);
      else openEditor();
    },
    [onMobileSelect, openEditor],
  );

  // ---------- expansão (com compensação de pan) ----------

  /**
   * Aplica um novo mapa `expanded` mantendo o nó âncora fixo na tela:
   * o pan é animado com a mesma curva/duração da transição CSS dos nós.
   */
  const applyExpanded = useCallback(
    (nextExpanded: Record<ID, boolean>, anchorId: ID | null) => {
      const root = currentRootId();
      if (!root) return;
      const store = useViewStore.getState();
      const before = currentView(root);
      const anchor = anchorId ? layoutNodeById.get(anchorId) : undefined;
      const screen = anchor
        ? { x: before.panX + anchor.x * before.zoom, y: before.panY + anchor.y * before.zoom }
        : null;

      store.patch(root, { expanded: nextExpanded });

      if (screen && anchorId) {
        const nextLayout = buildLayout({ ...layoutInput, expanded: nextExpanded });
        const after = nextLayout.nodes.find((node) => node.id === anchorId);
        if (after) {
          const panX = screen.x - after.x * before.zoom;
          const panY = screen.y - after.y * before.zoom;
          if (Math.abs(panX - before.panX) > 0.5 || Math.abs(panY - before.panY) > 0.5) {
            store.animatePanTo(root, panX, panY, DURATION_STRUCTURAL);
          }
        }
      }
    },
    [layoutNodeById, layoutInput],
  );

  const handleToggle = useCallback(
    (id: ID) => {
      const root = currentRootId();
      if (!root) return;
      const current = currentView(root);
      applyExpanded({ ...current.expanded, [id]: !current.expanded[id] }, id);
    },
    [applyExpanded],
  );

  /** Garante que `id` está visível e exposto (para criar filho nele). */
  const ensureChildrenVisible = useCallback(
    (id: ID) => {
      const root = currentRootId();
      if (!root) return;
      const current = currentView(root);
      const next = { ...current.expanded };
      let changed = false;
      if (!next[id]) {
        next[id] = true;
        changed = true;
      }
      let cursor: Note | undefined = byId[id];
      while (cursor?.parentId && cursor.parentId !== root) {
        if (!next[cursor.parentId]) {
          next[cursor.parentId] = true;
          changed = true;
        }
        cursor = byId[cursor.parentId];
      }
      if (changed) applyExpanded(next, id);
    },
    [applyExpanded, byId],
  );

  // ---------- CRUD ----------

  const createChild = useCallback(
    async (parentId: ID) => {
      ensureChildrenVisible(parentId);
      try {
        const notes = useNotesStore.getState();
        const note = await notes.createNote({ parentId });
        select(note.id);
        useUiStore.getState().startRename(note.id);
        toast(t('toast.notaCriada'));
      } catch {
        toast(t('toast.erroSalvar'), { tone: 'error' });
      }
    },
    [ensureChildrenVisible, select, toast],
  );

  const createSibling = useCallback(
    (node: LayoutNode) => {
      void createChild(node.parentId);
    },
    [createChild],
  );

  const startRename = useCallback((id: ID) => {
    useUiStore.getState().startRename(id);
    select(id);
  }, [select]);

  const finishRename = useCallback(() => {
    useUiStore.getState().startRename(null);
  }, []);

  const commitRename = useCallback(
    async (id: ID, title: string) => {
      try {
        await useNotesStore.getState().renameNote(id, title);
      } catch {
        toast(t('toast.erroSalvar'), { tone: 'error' });
      } finally {
        finishRename();
        focusNode(id);
      }
    },
    [finishRename, focusNode, toast],
  );

  const cancelRename = useCallback(() => {
    finishRename();
    const root = currentRootId();
    if (root) {
      const selected = currentView(root).selectedId;
      if (selected) focusNode(selected);
    }
  }, [finishRename, focusNode]);

  const deleteNodes = useCallback(
    async (ids: readonly ID[]) => {
      const root = currentRootId();
      const selectedBefore = root ? currentView(root).selectedId : null;
      try {
        const deleted = await useNotesStore.getState().softDelete(ids);
        if (deleted.length === 0) return;
        const message =
          deleted.length > 1
            ? t('toast.notaExcluidaComFilhas', { n: deleted.length })
            : t('toast.notaExcluida');
        toast(message, {
          actionLabel: t('common.desfazer'),
          onAction: () => {
            void useNotesStore
              .getState()
              .restoreNotes(ids)
              .then(() => toast(t('toast.restaurada')))
              .catch(() => toast(t('toast.erroSalvar'), { tone: 'error' }));
          },
        });
        if (selectedBefore && deleted.includes(selectedBefore)) select(null);
        useUiStore.getState().clearSelectedNodeIds();
      } catch {
        toast(t('toast.erroSalvar'), { tone: 'error' });
      }
    },
    [select, toast],
  );

  const deleteNode = useCallback((id: ID) => void deleteNodes([id]), [deleteNodes]);

  const applyTagToSelection = useCallback(async () => {
    const tag = bulkTag.trim();
    if (!tag || selectedNodeIds.length < 2) return;
    try {
      const changed = await useNotesStore
        .getState()
        .addTagsToNotes(selectedNodeIds, [tag], settings.tagStripAccents);
      setBulkTag('');
      toast(t('toast.tagsAplicadas', { n: changed }));
    } catch {
      toast(t('toast.erroSalvar'), { tone: 'error' });
    }
  }, [bulkTag, selectedNodeIds, settings.tagStripAccents, toast]);

  const moveSelectionToCategory = useCallback(async () => {
    if (!bulkTargetCategoryId || selectedNodeIds.length < 2) return;
    try {
      const moved = await useNotesStore.getState().moveNotes(selectedNodeIds, bulkTargetCategoryId);
      if (moved === 0) return;
      clearSelectedNodeIds();
      setBulkTargetCategoryId('');
      useViewStore.getState().select(bulkTargetCategoryId, null);
      useSettingsStore.getState().setActiveCategory(bulkTargetCategoryId);
      toast(t('toast.selecaoMovida', { n: moved }));
    } catch {
      toast(t('toast.erroMoverNota'), { tone: 'error' });
    }
  }, [bulkTargetCategoryId, clearSelectedNodeIds, selectedNodeIds, toast]);

  const duplicateNode = useCallback(
    async (id: ID, withChildren: boolean) => {
      try {
        const newId = await useNotesStore.getState().duplicateNote(id, withChildren);
        if (newId) {
          select(newId);
          toast(t('toast.notaDuplicada'));
        }
      } catch {
        toast(t('toast.erroSalvar'), { tone: 'error' });
      }
    },
    [select, toast],
  );

  const dropOnNode = useCallback(
    (sourceId: ID, targetId: ID, position: 'inside' | 'before' | 'after') => {
      const target = byId[targetId];
      if (!target) return;
      let newParentId: ID | null = target.id;
      let targetIndex: number | undefined;
      if (position !== 'inside') {
        newParentId = target.parentId;
        const siblingKey = target.parentId ?? '__root__';
        const withoutSource = (childIds[siblingKey] ?? []).filter((id) => id !== sourceId);
        const targetPosition = withoutSource.indexOf(targetId);
        targetIndex = targetPosition + (position === 'after' ? 1 : 0);
      }
      void useNotesStore
        .getState()
        .moveNote(sourceId, newParentId, targetIndex)
        .then(() => {
          if (position === 'inside') ensureChildrenVisible(targetId);
          select(sourceId);
        })
        .catch(() => toast(t('toast.erroMoverNota'), { tone: 'error' }));
    },
    [byId, childIds, ensureChildrenVisible, select, toast],
  );

  const setBranchExpanded = useCallback(
    (id: ID, expanded: boolean) => {
      const root = currentRootId();
      if (!root) return;
      const current = currentView(root);
      const index = buildIndex(Object.values(byId));
      const next = { ...current.expanded, [id]: expanded };
      for (const descendant of getDescendants(index, id)) next[descendant.id] = expanded;
      applyExpanded(next, id);
    },
    [applyExpanded, byId],
  );

  // ---------- pan / zoom ----------

  const panRaf = useRef<number | null>(null);
  const panTarget = useRef<{ x: number; y: number } | null>(null);
  const autoPanRaf = useRef<number | null>(null);
  const autoPanPoint = useRef<{ x: number; y: number } | null>(null);
  const touchDrag = useRef<TouchDragState | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const panDrag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const selectionDrag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    moved: boolean;
  } | null>(null);
  const pinch = useRef<{ dist: number } | null>(null);

  const flushPan = useCallback(() => {
    if (panRaf.current !== null) {
      window.cancelAnimationFrame(panRaf.current);
      panRaf.current = null;
    }
    const target = panTarget.current;
    panTarget.current = null;
    if (target) {
      const id = currentRootId();
      if (id) useViewStore.getState().patch(id, { panX: target.x, panY: target.y });
    }
  }, []);

  const schedulePan = useCallback(
    (x: number, y: number) => {
      panTarget.current = { x, y };
      if (panRaf.current !== null) return;
      panRaf.current = window.requestAnimationFrame(() => {
        panRaf.current = null;
        flushPan();
      });
    },
    [flushPan],
  );

  const startAutoPan = useCallback((x: number, y: number) => {
    autoPanPoint.current = { x, y };
    if (autoPanRaf.current !== null) return;

    const tick = () => {
      autoPanRaf.current = null;
      const point = autoPanPoint.current;
      const element = viewportRef.current;
      if (!point || !element) return;

      const bounds = element.getBoundingClientRect();
      const panDelta = (coordinate: number, extent: number) => {
        if (coordinate < AUTO_PAN_EDGE_PX) {
          return AUTO_PAN_MAX_SPEED * (1 - coordinate / AUTO_PAN_EDGE_PX);
        }
        if (coordinate > extent - AUTO_PAN_EDGE_PX) {
          return -AUTO_PAN_MAX_SPEED * (1 - (extent - coordinate) / AUTO_PAN_EDGE_PX);
        }
        return 0;
      };
      const deltaX = panDelta(point.x, bounds.width);
      const deltaY = panDelta(point.y, bounds.height);
      if (deltaX === 0 && deltaY === 0) return;

      const root = currentRootId();
      if (root) {
        const current = currentView(root);
        useViewStore.getState().patch(root, {
          panX: current.panX + deltaX,
          panY: current.panY + deltaY,
        });
      }
      autoPanRaf.current = window.requestAnimationFrame(tick);
    };

    autoPanRaf.current = window.requestAnimationFrame(tick);
  }, []);

  const stopAutoPan = useCallback(() => {
    autoPanPoint.current = null;
    if (autoPanRaf.current !== null) {
      window.cancelAnimationFrame(autoPanRaf.current);
      autoPanRaf.current = null;
    }
  }, []);

  const handleCanvasDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('application/x-mente-note')) return;
    if (!(event.target instanceof Element && event.target.closest('[data-node-id]'))) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'none';
    }
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    startAutoPan(event.clientX - rect.left, event.clientY - rect.top);
  }, [startAutoPan]);

  useEffect(() => {
    const updateAutoPan = (event: DragEvent) => {
      if (!Array.from(event.dataTransfer?.types ?? []).includes('application/x-mente-note')) return;
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      startAutoPan(event.clientX - rect.left, event.clientY - rect.top);
    };
    window.addEventListener('drag', updateAutoPan);
    window.addEventListener('dragend', stopAutoPan);
    window.addEventListener('drop', stopAutoPan);
    return () => {
      stopAutoPan();
      window.removeEventListener('drag', updateAutoPan);
      window.removeEventListener('dragend', stopAutoPan);
      window.removeEventListener('drop', stopAutoPan);
    };
  }, [startAutoPan, stopAutoPan]);

  useEffect(
    () => () => {
      if (panRaf.current !== null) window.cancelAnimationFrame(panRaf.current);
    },
    [],
  );

  const zoomAt = useCallback(
    (centerX: number, centerY: number, nextZoomRaw: number) => {
      const root = currentRootId();
      if (!root) return;
      const viewState = currentView(root);
      const nextZoom = clampZoom(nextZoomRaw);
      if (nextZoom === viewState.zoom) return;
      const worldX = (centerX - viewState.panX) / viewState.zoom;
      const worldY = (centerY - viewState.panY) / viewState.zoom;
      useViewStore.getState().patch(root, {
        zoom: nextZoom,
        panX: centerX - worldX * nextZoom,
        panY: centerY - worldY * nextZoom,
      });
    },
    [],
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const size = viewportSize.w > 0 ? viewportSize : { w: 600, h: 400 };
      const viewState = currentView(currentRootId());
      zoomAt(size.w / 2, size.h / 2, viewState.zoom * factor);
    },
    [viewportSize, zoomAt],
  );

  const panToMinimap = useCallback(
    (panX: number, panY: number) => {
      if (rootId) useViewStore.getState().patch(rootId, { panX, panY });
    },
    [rootId],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (target.closest('button, input')) return;
      const element = event.currentTarget;

      const node = target.closest<HTMLElement>('[data-node-id]');
      if (event.pointerType === 'touch' && node?.dataset.nodeId) {
        const pending: TouchDragState = {
          pointerId: event.pointerId,
          sourceId: node.dataset.nodeId,
          startX: event.clientX,
          startY: event.clientY,
          x: event.clientX,
          y: event.clientY,
          active: false,
          timer: null,
          targetId: null,
          position: null,
        };
        touchDrag.current = pending;
        pending.timer = window.setTimeout(() => {
          if (touchDrag.current !== pending) return;
          pending.active = true;
          try {
            element.setPointerCapture(event.pointerId);
          } catch {
            // captura indisponível: continua com os eventos dentro do viewport
          }
          setTouchDragPreview({ sourceId: pending.sourceId, x: pending.x, y: pending.y, targetId: null });
        }, TOUCH_DRAG_HOLD_MS);
        return;
      }

      if (node) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const root = currentRootId();
      if (root) useViewStore.getState().cancelAnimation(root);

      if (pointers.current.size === 2) {
        panDrag.current = null;
        selectionDrag.current = null;
        setSelectionRect(null);
        const [a, b] = [...pointers.current.values()];
        pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
        return;
      }

      try {
        element.setPointerCapture(event.pointerId);
      } catch {
        // captura indisponível: eventos continuam chegando enquanto o ponteiro vive
      }
      if (event.shiftKey) {
        const rect = element.getBoundingClientRect();
        const startX = event.clientX - rect.left;
        const startY = event.clientY - rect.top;
        selectionDrag.current = {
          pointerId: event.pointerId,
          startX,
          startY,
          currentX: startX,
          currentY: startY,
          moved: false,
        };
        panDrag.current = null;
        setSelectionRect({ x: startX, y: startY, width: 0, height: 0 });
        return;
      }

      const viewState = currentView(root);
      panDrag.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: viewState.panX,
        originY: viewState.panY,
        moved: false,
      };
    },
    [],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const touch = touchDrag.current;
      if (touch?.pointerId === event.pointerId) {
        touch.x = event.clientX;
        touch.y = event.clientY;
        if (!touch.active) {
          if (Math.hypot(touch.x - touch.startX, touch.y - touch.startY) > TOUCH_DRAG_SLOP) {
            if (touch.timer !== null) window.clearTimeout(touch.timer);
            touchDrag.current = null;
          }
          return;
        }

        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-node-id]');
        const targetId = target?.dataset.nodeId ?? null;
        const targetRect = target?.getBoundingClientRect();
        let position: TouchDragState['position'] = null;
        if (targetId && targetId !== touch.sourceId && targetRect) {
          const relativeY = (event.clientY - targetRect.top) / Math.max(targetRect.height, 1);
          position = relativeY < 0.25 ? 'before' : relativeY > 0.75 ? 'after' : 'inside';
        }
        touch.targetId = position ? targetId : null;
        touch.position = position;
        setTouchDragPreview({
          sourceId: touch.sourceId,
          x: event.clientX,
          y: event.clientY,
          targetId: touch.targetId,
        });
        const rect = event.currentTarget.getBoundingClientRect();
        startAutoPan(event.clientX - rect.left, event.clientY - rect.top);
        return;
      }

      const map = pointers.current;
      if (!map.has(event.pointerId)) return;
      map.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pinch.current && map.size === 2) {
        const [a, b] = [...map.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const rect = event.currentTarget.getBoundingClientRect();
        const centerX = (a.x + b.x) / 2 - rect.left;
        const centerY = (a.y + b.y) / 2 - rect.top;
        const last = pinch.current;
        pinch.current = { dist };
        if (last.dist > 0 && dist > 0) {
          zoomAt(centerX, centerY, currentView(currentRootId()).zoom * (dist / last.dist));
        }
        return;
      }

      const selection = selectionDrag.current;
      if (selection?.pointerId === event.pointerId) {
        const rect = event.currentTarget.getBoundingClientRect();
        const currentX = event.clientX - rect.left;
        const currentY = event.clientY - rect.top;
        const dx = currentX - selection.startX;
        const dy = currentY - selection.startY;
        if (!selection.moved && Math.hypot(dx, dy) < PAN_CLICK_SLOP) return;
        selection.currentX = currentX;
        selection.currentY = currentY;
        selection.moved = true;
        setSelectionRect({
          x: Math.min(selection.startX, currentX),
          y: Math.min(selection.startY, currentY),
          width: Math.abs(dx),
          height: Math.abs(dy),
        });
        return;
      }

      const drag = panDrag.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < PAN_CLICK_SLOP) return;
      drag.moved = true;
      schedulePan(drag.originX + dx, drag.originY + dy);
    },
    [schedulePan, startAutoPan, zoomAt],
  );

  const endPointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const touch = touchDrag.current;
      if (touch?.pointerId === event.pointerId) {
        if (touch.timer !== null) window.clearTimeout(touch.timer);
        touchDrag.current = null;
        setTouchDragPreview(null);
        stopAutoPan();
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          // já liberado
        }
        if (event.type === 'pointerup' && touch.active && touch.targetId && touch.position) {
          dropOnNode(touch.sourceId, touch.targetId, touch.position);
        }
        return;
      }

      pointers.current.delete(event.pointerId);
      if (pointers.current.size < 2) pinch.current = null;
      const selection = selectionDrag.current;
      if (selection?.pointerId === event.pointerId) {
        selectionDrag.current = null;
        setSelectionRect(null);
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          // já liberado
        }
        if (event.type === 'pointerup' && selection.moved) {
          const root = currentRootId();
          const viewState = currentView(root);
          const left = (Math.min(selection.startX, selection.currentX) - viewState.panX) / viewState.zoom;
          const top = (Math.min(selection.startY, selection.currentY) - viewState.panY) / viewState.zoom;
          const right = (Math.max(selection.startX, selection.currentX) - viewState.panX) / viewState.zoom;
          const bottom = (Math.max(selection.startY, selection.currentY) - viewState.panY) / viewState.zoom;
          const selectedIds = layout.nodes
            .filter((node) => intersects(nodeRect(node), { x: left, y: top, width: right - left, height: bottom - top }))
            .map((node) => node.id);
          useUiStore.getState().setSelectedNodeIds(selectedIds);
        }
        return;
      }

      const drag = panDrag.current;
      if (drag && drag.pointerId === event.pointerId) {
        panDrag.current = null;
        try {
          event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          // já liberado
        }
        if (drag.moved) flushPan();
      }
    },
    [dropOnNode, flushPan, layout.nodes, stopAutoPan],
  );

  const cancelTouchDrag = useCallback(() => {
    const touch = touchDrag.current;
    if (!touch) return;
    if (touch.timer !== null) window.clearTimeout(touch.timer);
    touchDrag.current = null;
    setTouchDragPreview(null);
    stopAutoPan();
    try {
      viewportRef.current?.releasePointerCapture(touch.pointerId);
    } catch {
      // captura já liberada ou não suportada
    }
  }, [stopAutoPan]);

  // Wheel nativo (não passivo): pan por padrão, zoom com Ctrl/⌘ no cursor.
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const root = currentRootId();
      if (!root) return;
      const rect = element.getBoundingClientRect();
      const centerX = event.clientX - rect.left;
      const centerY = event.clientY - rect.top;
      const viewState = currentView(root);
      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * 0.0025);
        zoomAt(centerX, centerY, viewState.zoom * factor);
      } else {
        schedulePan(viewState.panX - event.deltaX, viewState.panY - event.deltaY);
      }
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [schedulePan, zoomAt]);

  // ---------- ferramentas ----------

  const center = useCallback(() => {
    const root = currentRootId();
    if (!root) return;
    const viewState = currentView(root);
    const size = viewportSize.w > 0 ? viewportSize : { w: 600, h: 400 };
    const selected = viewState.selectedId
      ? layoutNodeById.get(viewState.selectedId)
      : undefined;
    const target = selected
      ? { x: selected.x + selected.width / 2, y: selected.y + selected.height / 2 }
      : { x: layout.width / 2, y: layout.height / 2 };
    useViewStore.getState().animatePanTo(
      root,
      size.w / 2 - target.x * viewState.zoom,
      size.h / 2 - target.y * viewState.zoom,
      DURATION_CENTER,
      easeOut,
    );
  }, [layout.height, layout.width, layoutNodeById, viewportSize]);

  useEffect(() => {
    const pending = centerOnNextId.current;
    if (!pending || pending.rootId !== rootId) return;
    if (!layoutNodeById.has(pending.id) || viewportSize.w <= 0 || viewportSize.h <= 0) return;
    centerOnNextId.current = null;
    center();
  }, [center, layoutNodeById, rootId, viewportSize.h, viewportSize.w, view.selectedId]);

  const fit = useCallback(() => {
    const root = currentRootId();
    if (!root || layout.width === 0 || layout.height === 0) return;
    const size = viewportSize.w > 0 ? viewportSize : { w: 600, h: 400 };
    const margin = 48;
    const zoom = clampZoom(
      Math.min((size.w - margin * 2) / layout.width, (size.h - margin * 2) / layout.height, 1),
    );
    useViewStore.getState().patch(root, {
      zoom,
      panX: (size.w - layout.width * zoom) / 2,
      panY: (size.h - layout.height * zoom) / 2,
    });
  }, [layout.height, layout.width, viewportSize]);

  useEffect(() => {
    if (!mobileCanvas || viewportSize.w <= 0 || viewportSize.h <= 0) return;
    const orientation = viewportSize.w > viewportSize.h ? 'landscape' : 'portrait';
    if (mobileFitOrientation.current === orientation) return;
    mobileFitOrientation.current = orientation;
    const frame = window.requestAnimationFrame(fit);
    return () => window.cancelAnimationFrame(frame);
  }, [fit, mobileCanvas, viewportSize.h, viewportSize.w]);

  const expandAll = useCallback(() => {
    const root = currentRootId();
    if (!root) return;
    const current = currentView(root);
    const index = buildIndex(Object.values(byId));
    const next = { ...current.expanded };
    for (const note of getDescendants(index, root)) next[note.id] = true;
    applyExpanded(next, current.selectedId);
  }, [applyExpanded, byId]);

  const collapseAll = useCallback(() => {
    const root = currentRootId();
    if (!root) return;
    const current = currentView(root);
    applyExpanded({}, current.selectedId);
  }, [applyExpanded]);

  const expandLevel = useCallback(
    (level: number) => {
      const root = currentRootId();
      if (!root) return;
      const current = currentView(root);
      const index = buildIndex(Object.values(byId));
      const next = { ...current.expanded };
      for (const note of getDescendants(index, root)) {
        next[note.id] = depthOf(index, note.id) < level;
      }
      applyExpanded(next, current.selectedId);
    },
    [applyExpanded, byId],
  );

  // ---------- teclado (ARIA tree) ----------

  const onTreeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const target = event.target;
      if (target instanceof HTMLInputElement) return;

      const root = currentRootId();
      if (!root) return;
      const current = currentView(root);
      const node = current.selectedId ? layoutNodeById.get(current.selectedId) : undefined;

      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowUp': {
          event.preventDefault();
          if (!node) {
            const first = layout.nodes[0];
            if (first) selectAndFocus(first.id);
            return;
          }
          if (event.altKey) {
            const siblings = focusLayout.childIds[node.parentId] ?? [];
            const index = siblings.indexOf(node.id);
            const targetIndex = index + (event.key === 'ArrowDown' ? 1 : -1);
            if (index >= 0 && targetIndex >= 0 && targetIndex < siblings.length) {
              void useNotesStore.getState().reorderNote(node.id, targetIndex).catch(() =>
                toast(t('toast.erroSalvar'), { tone: 'error' }),
              );
            }
            return;
          }
          const siblings = byParent.get(node.parentId) ?? [];
          const index = siblings.findIndex((sibling) => sibling.id === node.id);
          const next = siblings[index + (event.key === 'ArrowDown' ? 1 : -1)];
          if (next) selectAndFocus(next.id);
          return;
        }
        case 'ArrowLeft': {
          event.preventDefault();
          if (!node) return;
          if (node.hasChildren && node.expanded) {
            applyExpanded({ ...current.expanded, [node.id]: false }, node.id);
            return;
          }
          if (node.parentId !== root) selectAndFocus(node.parentId);
          return;
        }
        case 'ArrowRight': {
          event.preventDefault();
          if (!node) return;
          if (node.hasChildren && !node.expanded) {
            applyExpanded({ ...current.expanded, [node.id]: true }, node.id);
            return;
          }
          const firstChild = (byParent.get(node.id) ?? [])[0];
          if (firstChild) selectAndFocus(firstChild.id);
          return;
        }
        case 'Enter': {
          event.preventDefault();
          if (node) createSibling(node);
          else void createChild(root);
          return;
        }
        case 'Tab': {
          if (event.shiftKey) {
            if (!node) return;
            event.preventDefault();
            const parent = byId[node.parentId];
            if (parent) {
              void useNotesStore.getState().moveNote(node.id, parent.parentId).catch(() =>
                toast(t('toast.erroMoverNota'), { tone: 'error' }),
              );
            }
            return;
          }
          event.preventDefault();
          void createChild(node ? node.id : root);
          return;
        }
        case ' ': {
          if (!node?.hasChildren) return;
          event.preventDefault();
          applyExpanded({ ...current.expanded, [node.id]: !node.expanded }, node.id);
          return;
        }
        case 'F2': {
          if (!node) return;
          event.preventDefault();
          startRename(node.id);
          return;
        }
        case 'Delete':
        case 'Backspace': {
          if (!node) return;
          event.preventDefault();
          const ids = useUiStore.getState().selectedNodeIds;
          void deleteNodes(ids.includes(node.id) ? ids : [node.id]);
          return;
        }
        case 'd':
        case 'D': {
          if (!node || !(event.ctrlKey || event.metaKey)) return;
          event.preventDefault();
          void duplicateNode(node.id, true);
          return;
        }
        case 'e':
        case 'E': {
          if (!node || event.ctrlKey || event.metaKey || event.altKey) return;
          event.preventDefault();
          void useSettingsStore
            .getState()
            .update({ editorOpen: true })
            .then(() => {
              window.requestAnimationFrame(() => {
                document.querySelector<HTMLInputElement>(`[aria-label="${t('editor.tituloNota')}"]`)?.focus();
              });
            })
            .catch(() => toast(t('toast.erroSalvar'), { tone: 'error' }));
          return;
        }
        case 'Escape': {
          if (focusLayout.activeNodeId) {
            event.preventDefault();
            setFocus(null);
            return;
          }
          if (touchDrag.current) {
            event.preventDefault();
            cancelTouchDrag();
            return;
          }
          clearSelectedNodeIds();
          if (current.selectedId) {
            event.preventDefault();
            select(null);
          }
          return;
        }
        default:
      }
    },
    [
      applyExpanded,
      byParent,
      byId,
      cancelTouchDrag,
      focusLayout.childIds,
      focusLayout.activeNodeId,
      createChild,
      createSibling,
      deleteNodes,
      duplicateNode,
      layout.nodes,
      layoutNodeById,
      select,
      selectAndFocus,
      startRename,
      toast,
      clearSelectedNodeIds,
    ],
  );

  // ---------- menu de contexto ----------

  const menuNode = menu ? layoutNodeById.get(menu.id) : undefined;
  const menuNote = menu ? (byId[menu.id] ?? null) : null;

  function buildNodeMenuItems(node: LayoutNode): MenuItem[] {
    return [
      {
        id: 'open',
        label: t('sidebar.abrirNota'),
        icon: <Icon name="arrow-right" size={14} />,
        onSelect: () => openNodeFromMenu(node.id),
      },
      {
        id: 'rename',
        label: t('common.renomear'),
        icon: <Icon name="pencil" size={14} />,
        onSelect: () => startRename(node.id),
      },
      {
        id: 'child',
        label: t('node.novoFilho'),
        icon: <Icon name="file-plus" size={14} />,
        onSelect: () => void createChild(node.id),
      },
      {
        id: 'sibling',
        label: t('node.novoIrmao'),
        icon: <Icon name="plus" size={14} />,
        onSelect: () => createSibling(node),
      },
      {
        id: 'duplicate',
        label: t('node.duplicarComFilhos'),
        icon: <Icon name="copy" size={14} />,
        separatorBefore: true,
        onSelect: () => void duplicateNode(node.id, true),
      },
      {
        id: 'duplicate-one',
        label: t('node.duplicarSoEsta'),
        icon: <Icon name="copy" size={14} />,
        onSelect: () => void duplicateNode(node.id, false),
      },
      {
        id: 'icon',
        label: t('sidebar.trocarIcone'),
        icon: <Icon name="smile" size={14} />,
        separatorBefore: true,
        onSelect: () => setPicker({ type: 'icon', id: node.id }),
      },
      {
        id: 'color',
        label: t('sidebar.trocarCor'),
        icon: <Icon name="palette" size={14} />,
        onSelect: () => setPicker({ type: 'color', id: node.id }),
      },
      {
        id: 'expand-branch',
        label: t('node.expandirRamo'),
        icon: <Icon name="chevrons-up-down" size={14} />,
        disabled: !node.hasChildren || node.expanded,
        separatorBefore: true,
        onSelect: () => setBranchExpanded(node.id, true),
      },
      {
        id: 'collapse-branch',
        label: t('node.recolherRamo'),
        icon: <Icon name="minimize" size={14} />,
        disabled: !node.expanded,
        onSelect: () => setBranchExpanded(node.id, false),
      },
      {
        id: 'focus-branch',
        label: t('node.focarRamo'),
        icon: <Icon name="eye" size={14} />,
        separatorBefore: true,
        onSelect: () => focusBranch(node.id),
      },
      {
        id: 'trash',
        label: t('node.moverLixeira'),
        icon: <Icon name="trash" size={14} />,
        danger: true,
        separatorBefore: true,
        onSelect: () => void deleteNode(node.id),
      },
      // "Copiar link [[…]]" e "Mover para…" ainda pertencem a fases seguintes.
    ];
  }

  // ---------- render ----------

  const category: Note | null = rootId ? (byId[rootId] ?? null) : null;
  const categoryAlive = category !== null && !category.deletedAt && category.parentId === null;
  const index = useMemo(
    () => measureCanvasPhase('index', () => buildIndex(Object.values(byId))),
    [byId],
  );
  const noteCount = categoryAlive
    ? measureCanvasPhase('count', () => countDescendants(index, category.id))
    : 0;

  const viewRect = useMemo<WorldRect>(() => {
    if (viewportSize.w <= 0 || viewportSize.h <= 0) {
      return { x: -Infinity, y: -Infinity, width: Infinity, height: Infinity };
    }
    return {
      x: (-view.panX - CULLING_MARGIN) / view.zoom,
      y: (-view.panY - CULLING_MARGIN) / view.zoom,
      width: viewportSize.w / view.zoom + CULLING_MARGIN * 2,
      height: viewportSize.h / view.zoom + CULLING_MARGIN * 2,
    };
  }, [viewportSize, view.panX, view.panY, view.zoom]);

  const visibleNodes = useMemo(
    () => measureCanvasPhase(
      'culling-nodes',
      () =>
        viewportSize.w <= 0 || viewportSize.h <= 0
          ? []
          : layout.nodes.filter((node) => intersects(nodeRect(node), viewRect)),
    ),
    [layout.nodes, viewRect, viewportSize],
  );

  const visibleEdges = useMemo(() => {
    return measureCanvasPhase('culling-edges', () => {
      if (viewportSize.w <= 0 || viewportSize.h <= 0) return [];
      return layout.edges.filter((edge) =>
        intersects(
          {
            x: Math.min(edge.x1, edge.x2),
            y: Math.min(edge.y1, edge.y2) - 8,
            width: Math.abs(edge.x2 - edge.x1) + 8,
            height: Math.abs(edge.y2 - edge.y1) + 16,
          },
          viewRect,
        ),
      );
    });
  }, [layout.edges, viewRect, viewportSize]);

  const visibleLinkEdges = useMemo(() => {
    if (!settings.showLinkEdges || viewportSize.w <= 0 || viewportSize.h <= 0) return [];
    const nodes = new Map(layout.nodes.map((node) => [node.id, node]));
    return noteLinks.flatMap((link) => {
      if (!link.toId || link.fromId === link.toId) return [];
      const source = nodes.get(link.fromId);
      const target = nodes.get(link.toId);
      if (!source || !target) return [];
      const edge = {
        id: link.id,
        parentId: source.parentId,
        childId: target.id,
        x1: source.x + source.width,
        y1: source.y + source.height / 2,
        x2: target.x,
        y2: target.y + target.height / 2,
      };
      return intersects(
        {
          x: Math.min(edge.x1, edge.x2),
          y: Math.min(edge.y1, edge.y2) - 8,
          width: Math.abs(edge.x2 - edge.x1) + 8,
          height: Math.abs(edge.y2 - edge.y1) + 16,
        },
        viewRect,
      )
        ? [edge]
        : [];
    });
  }, [layout.nodes, noteLinks, settings.showLinkEdges, viewRect, viewportSize]);

  const highlight = useMemo(
    () => (view.selectedId ? pathToNode(layout.nodes, view.selectedId) : new Set<string>()),
    [layout.nodes, view.selectedId],
  );

  const tabStopId = useMemo(() => {
    if (view.selectedId && layoutNodeById.has(view.selectedId)) return view.selectedId;
    return layout.nodes[0]?.id ?? null;
  }, [layout.nodes, layoutNodeById, view.selectedId]);

  const pickerNote = picker?.id ? (byId[picker.id] ?? null) : null;
  const pickerNotes = picker?.ids?.map((id) => byId[id]).filter((note): note is Note => note !== undefined) ?? [];
  const pickerIds = picker?.ids ?? (picker?.id ? [picker.id] : []);
  const pickerIcon = pickerNote?.icon ?? (
    pickerNotes.length > 0 && pickerNotes.every((note) => note.icon === pickerNotes[0].icon)
      ? pickerNotes[0].icon
      : ''
  );
  const pickerColor = pickerNote
    ? pickerNote.color
    : pickerNotes.length > 0 && pickerNotes.every((note) => note.color === pickerNotes[0].color)
      ? pickerNotes[0].color
      : null;

  const focusPath = focusLayout.path;
  const focusActive = focusLayout.activeNodeId !== null && focusPath.length > 0;

  return (
    <div className="flex h-full min-w-0 flex-col bg-bg-app" data-testid="canvas">
      {!mobileCanvas ? <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        {categoryAlive ? (
          focusActive ? (
            <nav
              className="flex min-w-0 flex-1 items-center gap-2"
              aria-label={t('canvas.focoRamo', {
                nome: focusPath[focusPath.length - 1]?.title || t('common.semTitulo'),
              })}
              data-testid="focus-breadcrumb"
            >
              <Button
                size="sm"
                variant="ghost"
                icon={<Icon name="arrow-left" size={12} />}
                aria-label={t('canvas.sairFocoRamo')}
                onClick={() => setFocus(null)}
              >
                {t('canvas.voltarArvore')}
              </Button>
              <ol className="flex min-w-0 items-center gap-1">
                {focusPath.map((crumb, crumbIndex) => {
                  const isCurrent = crumbIndex === focusPath.length - 1;
                  const title = crumb.title || t('common.semTitulo');
                  return (
                    <li key={crumb.id} className="flex min-w-0 items-center gap-1">
                      {crumbIndex > 0 ? (
                        <Icon
                          name="chevron-right"
                          size={12}
                          className="shrink-0 text-muted"
                          aria-hidden="true"
                        />
                      ) : null}
                      {isCurrent ? (
                        <span
                          aria-current="true"
                          className="max-w-64 truncate rounded px-1.5 py-1 text-sm font-semibold text-accent"
                          title={title}
                        >
                          {title}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="max-w-64 truncate rounded px-1.5 py-1 text-sm text-muted transition-colors hover:bg-bg-hover hover:text-text"
                          aria-label={t('canvas.focarEm', { nome: title })}
                          title={title}
                          onClick={() => (crumbIndex === 0 ? setFocus(null) : focusBranch(crumb.id))}
                        >
                          {title}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>
          ) : (
            <>
              <Icon name={category.icon} size={18} className="shrink-0 text-muted" />
              <span className="truncate text-sm font-semibold text-text">{category.title}</span>
              <span className="ml-2 shrink-0 text-xs text-muted">
                {noteCount === 1
                  ? t('canvas.umaNotaAqui')
                  : noteCount > 1
                    ? t('canvas.notasNaCategoria', { n: noteCount })
                    : t('canvas.vazioTitulo')}
              </span>
            </>
          )
        ) : (
          <span className="truncate text-sm font-semibold text-text">
            {t('canvas.semCategoria')}
          </span>
        )}
      </header> : null}

      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 touch-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onDragEnter={handleCanvasDragOver}
        onDragOver={handleCanvasDragOver}
        data-canvas-viewport
      >
        <div
          ref={treeRef}
          role="tree"
          aria-label={t('a11y.navegarArvore')}
          tabIndex={layout.nodes.length === 0 ? 0 : -1}
          className="absolute inset-0"
          onKeyDown={onTreeKeyDown}
        >
          <div
            className="absolute top-0 left-0 origin-top-left will-change-transform"
            data-simple={view.zoom < ZOOM_LEGIBLE_MIN ? '' : undefined}
            style={{
              transform: `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`,
              width: layout.width,
              height: layout.height,
            }}
          >
            <CanvasEdges
              edges={visibleEdges}
              linkEdges={visibleLinkEdges}
              highlight={highlight}
              width={layout.width}
              height={layout.height}
            />
            {visibleNodes.map((node) => {
              const note = byId[node.id];
              if (!note) return null;
              return (
                <CanvasNode
                  key={node.id}
                  node={node}
                  note={note}
                  selected={view.selectedId === node.id || selectedNodeIds.includes(node.id)}
                  tabStop={tabStopId === node.id}
                  renaming={pendingRenameId === node.id}
                  simplified={view.zoom < ZOOM_LEGIBLE_MIN}
                  touchDragging={touchDragPreview?.sourceId === node.id}
                  touchDropTarget={touchDragPreview?.targetId === node.id}
                  onSelect={handleSelect}
                  onOpen={handleOpen}
                  onToggle={handleToggle}
                  onStartRename={startRename}
                  onCommitRename={(id, title) => void commitRename(id, title)}
                  onCancelRename={cancelRename}
                  onRenameConfirm={(id, title) => void commitRename(id, title)}
                  onRenameConfirmCreateChild={(id, title) => {
                    void commitRename(id, title).then(() => createChild(id));
                  }}
                  onCreateChild={(id) => void createChild(id)}
                  onContextMenu={(id, event) =>
                    setMenu({ id, position: { x: event.clientX, y: event.clientY } })
                  }
                  onDropOnNode={dropOnNode}
                />
              );
            })}
          </div>
        </div>

        {selectionRect ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-20 border border-accent bg-accent/10"
            data-testid="selection-box"
            style={{
              left: selectionRect.x,
              top: selectionRect.y,
              width: selectionRect.width,
              height: selectionRect.height,
            }}
          />
        ) : null}

        {touchDragPreview ? (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed z-50 flex -translate-y-full items-center gap-2 rounded-[var(--radius)] border border-accent bg-bg-raised px-3 py-2 text-sm text-text shadow-lg"
            data-testid="touch-drag-ghost"
            style={{ left: touchDragPreview.x + 12, top: touchDragPreview.y - 12 }}
          >
            <Icon name={byId[touchDragPreview.sourceId]?.icon ?? 'circle'} size={14} />
            <span>{byId[touchDragPreview.sourceId]?.title ?? ''}</span>
          </div>
        ) : null}

        {categoryAlive && layout.nodes.length === 0 ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 p-6 text-center">
            <Icon name="list-tree" size={32} className="text-muted" />
            <p className="text-sm font-medium text-text">{t('canvas.vazioTitulo')}</p>
            <p className="max-w-sm text-sm text-muted">{t('canvas.vazioTexto')}</p>
          </div>
        ) : null}

        {!categoryAlive ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 p-6 text-center">
            <Icon name="mouse-pointer" size={32} className="text-muted" />
            <p className="text-sm font-medium text-text">{t('canvas.semCategoriaTexto')}</p>
          </div>
        ) : null}

        {selectedNodeIds.length > 1 ? (
          <div
            role="toolbar"
            aria-label={t('canvas.acoesSelecao')}
            className="absolute top-2 left-1/2 z-30 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-[var(--radius)] border border-border bg-bg-raised/95 p-1.5 shadow-sm backdrop-blur-sm"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <span className="px-1 text-xs text-muted">
              {t('canvas.notasSelecionadas', { n: selectedNodeIds.length })}
            </span>
            <select
              aria-label={t('canvas.destinoSelecao')}
              value={bulkTargetCategoryId}
              onChange={(event) => setBulkTargetCategoryId(event.currentTarget.value)}
              className="h-9 max-w-40 rounded border border-border bg-bg-app px-2 text-xs text-text outline-none focus:border-accent"
            >
              <option value="">{t('canvas.destinoSelecao')}</option>
              {(childIds[CATEGORY_PARENT_KEY] ?? []).map((id) => (
                <option key={id} value={id}>
                  {byId[id]?.title.trim() || t('common.semTitulo')}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              icon={<Icon name="folder" size={14} />}
              disabled={!bulkTargetCategoryId}
              onClick={() => void moveSelectionToCategory()}
            >
              {t('canvas.moverSelecao')}
            </Button>
            <Button
              size="sm"
              icon={<Icon name="palette" size={14} />}
              onClick={() => setPicker({ type: 'color', ids: [...selectedNodeIds] })}
            >
              {t('canvas.corSelecao')}
            </Button>
            <Button
              size="sm"
              icon={<Icon name="smile" size={14} />}
              onClick={() => setPicker({ type: 'icon', ids: [...selectedNodeIds] })}
            >
              {t('canvas.iconeSelecao')}
            </Button>
            <input
              aria-label={t('editor.placeholderTag')}
              placeholder={t('editor.placeholderTag')}
              value={bulkTag}
              onChange={(event) => setBulkTag(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void applyTagToSelection();
                }
              }}
              className="h-9 w-28 rounded border border-border bg-bg-app px-2 text-xs text-text outline-none focus:border-accent"
            />
            <Button size="sm" disabled={!bulkTag.trim()} onClick={() => void applyTagToSelection()}>
              {t('editor.adicionarTag')}
            </Button>
            <Button size="sm" variant="danger" onClick={() => void deleteNodes(selectedNodeIds)}>
              {t('canvas.excluirSelecao')}
            </Button>
            <Button size="sm" variant="ghost" onClick={clearSelectedNodeIds}>
              {t('common.cancelar')}
            </Button>
          </div>
        ) : null}

        <CanvasToolbar
          zoom={view.zoom}
          onCenter={center}
          onFit={fit}
          onExpandAll={expandAll}
          onCollapseAll={collapseAll}
          onExpandLevel={expandLevel}
          onZoomIn={() => zoomBy(1.25)}
          onZoomOut={() => zoomBy(1 / 1.25)}
          onZoomReset={() => {
            const size = viewportSize.w > 0 ? viewportSize : { w: 600, h: 400 };
            zoomAt(size.w / 2, size.h / 2, 1);
          }}
          wideView={wideView}
          onToggleWideView={onToggleWideView}
          showWideViewToggle={showWideViewToggle}
        />

        {mobileCanvas ? null : (
          <CanvasMinimap
            nodes={layout.nodes}
            layoutWidth={layout.width}
            layoutHeight={layout.height}
            viewportWidth={viewportSize.w}
            viewportHeight={viewportSize.h}
            panX={view.panX}
            panY={view.panY}
            zoom={view.zoom}
            onPanTo={panToMinimap}
          />
        )}

        {mobileCanvas ? null : <SidebarLines />}
      </div>

      {menu && menuNode && menuNote ? (
        <Menu
          items={buildNodeMenuItems(menuNode)}
          label={t('node.opcoes', {
            nome: menuNote.title.trim() || t('common.semTitulo'),
          })}
          position={menu.position}
          onClose={() => setMenu(null)}
        />
      ) : null}

      {picker && (pickerNote || pickerNotes.length > 0) ? (
        <>
          <IconPicker
            open={picker.type === 'icon'}
            current={pickerIcon}
            onClose={() => setPicker(null)}
            onSelect={(icon) =>
              void useNotesStore
                .getState()
                .updateNotesStyle(pickerIds, { icon })
                .then((count) => toast(t(pickerIds.length > 1 ? 'toast.iconesAplicados' : 'toast.iconeSalvo', { n: count })))
                .catch(() => toast(t('toast.erroSalvar'), { tone: 'error' }))
            }
          />
          <ColorPicker
            open={picker.type === 'color'}
            current={pickerColor}
            onClose={() => setPicker(null)}
            onSelect={(color) =>
              void useNotesStore
                .getState()
                .updateNotesStyle(pickerIds, { color })
                .then((count) => toast(t(pickerIds.length > 1 ? 'toast.coresAplicadas' : 'toast.corSalva', { n: count })))
                .catch(() => toast(t('toast.erroSalvar'), { tone: 'error' }))
            }
          />
        </>
      ) : null}
    </div>
  );
}
