import { create } from 'zustand';

import type { ID } from '@/domain/types';

/**
 * Dados do layout corrente compartilhados entre o Canvas e as linhas
 * sidebar→canvas (medem retângulos no mundo + viewport).
 * Sem React aqui: só estado de medição.
 */
export interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface LayoutState {
  /** Incrementa a cada layout novo (assinatura para consumidores). */
  version: number;
  /** Todos os nós do layout visível (não só os renderizados). */
  boxes: ReadonlyMap<ID, LayoutBox>;
  /** Filhos diretos da categoria (destinos das linhas da sidebar). */
  rootChildren: ID[];
  viewport: ViewportRect | null;
  setLayout: (boxes: ReadonlyMap<ID, LayoutBox>, rootChildren: ID[]) => void;
  setViewport: (rect: ViewportRect | null) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  version: 0,
  boxes: new Map(),
  rootChildren: [],
  viewport: null,

  setLayout: (boxes, rootChildren) => {
    set((state) => ({
      version: state.version + 1,
      boxes,
      rootChildren,
    }));
  },

  setViewport: (rect) => {
    set({ viewport: rect });
  },
}));
