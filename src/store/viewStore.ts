import { create } from 'zustand';

import { runtime, hasRuntime } from '@/app/runtime';
import { ZOOM_MAX, ZOOM_MIN } from '@/domain/constants';
import type { ID, ViewRecord } from '@/domain/types';

/**
 * Estado de navegação do canvas por categoria (§3 ViewState).
 * Nunca entra no histórico de undo; é persistido na tabela `views`.
 */
export interface CategoryView {
  expanded: Record<ID, boolean>;
  panX: number;
  panY: number;
  zoom: number;
  selectedId: ID | null;
}

/** Pan inicial de uma categoria sem registro salvo (margem de 48 px). */
export const INITIAL_PAN = 48;

export function defaultView(): CategoryView {
  return { expanded: {}, panX: INITIAL_PAN, panY: INITIAL_PAN, zoom: 1, selectedId: null };
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function viewFromRecord(record: ViewRecord): CategoryView {
  const base = defaultView();
  return {
    expanded:
      record.expanded && typeof record.expanded === 'object' ? record.expanded : base.expanded,
    panX: finite(record.panX, base.panX),
    panY: finite(record.panY, base.panY),
    zoom: clampZoom(record.zoom),
    selectedId: typeof record.selectedId === 'string' ? record.selectedId : null,
  };
}

export function toRecord(rootId: ID, view: CategoryView): ViewRecord {
  return {
    rootId,
    expanded: view.expanded,
    panX: view.panX,
    panY: view.panY,
    zoom: view.zoom,
    selectedId: view.selectedId,
  };
}

/** Coordenada do ponto do mundo sob um ponto da viewport. */
export function worldPointAt(
  view: CategoryView,
  clientX: number,
  clientY: number,
  originX: number,
  originY: number,
): { x: number; y: number } {
  return { x: (clientX - originX - view.panX) / view.zoom, y: (clientY - originY - view.panY) / view.zoom };
}

interface ViewStoreState {
  views: Record<ID, CategoryView>;
  loaded: Record<ID, boolean>;
  /** Garante que a categoria tem estado em memória (lê do banco na primeira vez). */
  loadView: (rootId: ID) => Promise<void>;
  applyRemoteView: (rootId: ID, view: ViewRecord | null) => void;
  /** Atualização imediata (pan/zoom/seleção) com persistência adiada. */
  patch: (rootId: ID, patch: Partial<CategoryView>) => void;
  toggleExpanded: (rootId: ID, id: ID, next?: boolean) => void;
  /** Define expanded para vários ids de uma vez (expandir/recolher tudo, nível N). */
  setExpandedMany: (rootId: ID, ids: readonly ID[], expanded: boolean) => void;
  select: (rootId: ID, id: ID | null) => void;
  /**
   * Anima pan até o destino (rAF + easing). Nó em movimento acompanha a
   * transição CSS dos nós (mesma duração/curva) para não "pular" na tela.
   */
  animatePanTo: (
    rootId: ID,
    panX: number,
    panY: number,
    durationMs: number,
    easing?: (t: number) => number,
  ) => void;
  /** Cancela animação de pan em andamento (se houver). */
  cancelAnimation: (rootId: ID) => void;
  /** Persiste imediatamente a view pendente (troca de categoria/pagehide). */
  flush: (rootId?: ID) => Promise<void>;
}

const PERSIST_DELAY = 400;
const pending = new Set<ID>();
let persistTimer: number | null = null;
const animations = new Map<ID, number>();

export function isMotionReduced(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.dataset.motion === 'reduced';
}

/** easing padrão das transições de layout (cubic-bezier(0.4, 0, 0.2, 1)). */
export function easeStandard(t: number): number {
  return cubicBezier(0.4, 0, 0.2, 1, t);
}

export function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number, t: number): number {
  // Newton-Raphson: encontra t para o x alvo e devolve y.
  let u = t;
  for (let i = 0; i < 8; i += 1) {
    const x = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
    const d = 3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2);
    if (Math.abs(d) < 1e-6) break;
    u -= (x - t) / d;
    u = Math.min(1, Math.max(0, u));
  }
  return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
}

export const useViewStore = create<ViewStoreState>((set, get) => {
  function schedulePersist(rootId: ID): void {
    if (!hasRuntime()) return;
    pending.add(rootId);
    if (persistTimer !== null) window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      persistTimer = null;
      void get().flush();
    }, PERSIST_DELAY);
  }

  function apply(rootId: ID, patch: Partial<CategoryView>): void {
    const current = get().views[rootId] ?? defaultView();
    set((state) => ({
      views: { ...state.views, [rootId]: { ...current, ...patch } },
    }));
    schedulePersist(rootId);
  }

  return {
    views: {},
    loaded: {},

    loadView: async (rootId) => {
      if (get().loaded[rootId]) return;
      set((state) => ({ loaded: { ...state.loaded, [rootId]: true } }));
      if (get().views[rootId]) return;
      try {
        const record = await runtime().repos.views.get(rootId);
        if (record && !get().views[rootId]) {
          set((state) => ({
            views: { ...state.views, [rootId]: viewFromRecord(record) },
          }));
        }
      } catch {
        // view indisponível: segue com o padrão (navegação nunca bloqueia)
      }
    },

    applyRemoteView: (rootId, record) => {
      pending.delete(rootId);
      if (pending.size === 0 && persistTimer !== null) {
        window.clearTimeout(persistTimer);
        persistTimer = null;
      }
      if (record) {
        set((state) => ({
          views: { ...state.views, [rootId]: viewFromRecord(record) },
          loaded: { ...state.loaded, [rootId]: true },
        }));
        return;
      }
      set((state) => {
        const views = { ...state.views };
        delete views[rootId];
        return { views, loaded: { ...state.loaded, [rootId]: true } };
      });
    },

    patch: (rootId, patch) => {
      apply(rootId, patch);
    },

    toggleExpanded: (rootId, id, next) => {
      const view = get().views[rootId] ?? defaultView();
      const value = next ?? !view.expanded[id];
      apply(rootId, { expanded: { ...view.expanded, [id]: value } });
    },

    setExpandedMany: (rootId, ids, expanded) => {
      const view = get().views[rootId] ?? defaultView();
      const next = { ...view.expanded };
      for (const id of ids) next[id] = expanded;
      apply(rootId, { expanded: next });
    },

    select: (rootId, id) => {
      apply(rootId, { selectedId: id });
    },

    animatePanTo: (rootId, panX, panY, durationMs, easing = easeStandard) => {
      get().cancelAnimation(rootId);
      const from = get().views[rootId] ?? defaultView();
      const targetX = finite(panX, from.panX);
      const targetY = finite(panY, from.panY);
      if (isMotionReduced() || durationMs <= 0) {
        apply(rootId, { panX: targetX, panY: targetY });
        return;
      }
      const startX = from.panX;
      const startY = from.panY;
      const startedAt = performance.now();
      const frame = window.requestAnimationFrame(function step(now) {
        const raw = Math.min(1, (now - startedAt) / durationMs);
        const eased = easing(raw);
        const view = get().views[rootId] ?? defaultView();
        set((state) => ({
          views: {
            ...state.views,
            [rootId]: {
              ...view,
              panX: startX + (targetX - startX) * eased,
              panY: startY + (targetY - startY) * eased,
            },
          },
        }));
        if (raw < 1) {
          animations.set(rootId, window.requestAnimationFrame(step));
        } else {
          animations.delete(rootId);
          schedulePersist(rootId);
        }
      });
      animations.set(rootId, frame);
    },

    cancelAnimation: (rootId) => {
      const frame = animations.get(rootId);
      if (frame !== undefined) {
        window.cancelAnimationFrame(frame);
        animations.delete(rootId);
      }
    },

    flush: async (rootId) => {
      const ids = rootId ? [rootId] : [...pending];
      if (ids.length === 0) return;
      if (persistTimer !== null) {
        window.clearTimeout(persistTimer);
        persistTimer = null;
      }
      if (!hasRuntime()) {
        pending.clear();
        return;
      }
      for (const id of ids) {
        pending.delete(id);
        const view = get().views[id];
        if (!view) continue;
        try {
          await runtime().repos.views.put(toRecord(id, view));
        } catch {
          // persistência de navegação é best-effort: nunca bloqueia a UI
        }
      }
    },
  };
});

/** View da categoria ativa (com default estável para seletores). */
const FALLBACK_VIEW = defaultView();

export function selectViewById(state: ViewStoreState, rootId: ID | null): CategoryView {
  if (!rootId) return FALLBACK_VIEW;
  return state.views[rootId] ?? FALLBACK_VIEW;
}
