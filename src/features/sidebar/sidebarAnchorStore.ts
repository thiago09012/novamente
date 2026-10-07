import { create } from 'zustand';

/**
 * Origem das linhas que saem da sidebar: borda direita da barra na altura
 * do item de categoria ativo (clamped à lista visível, com esmaecimento).
 * A sidebar publica aqui; as linhas consomem (coordenadas de viewport).
 */
export interface SidebarAnchor {
  /** Borda direita da sidebar (x de viewport). */
  x: number;
  /** Altura central do item ativo (y de viewport). */
  y: number;
  /** false = item fora da área visível (origem presa na borda + fade). */
  inView: boolean;
}

interface AnchorState {
  anchor: SidebarAnchor | null;
  setAnchor: (anchor: SidebarAnchor | null) => void;
}

export const useSidebarAnchorStore = create<AnchorState>((set) => ({
  anchor: null,
  setAnchor: (anchor) => set({ anchor }),
}));
