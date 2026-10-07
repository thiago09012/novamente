import { create } from 'zustand';

import type { ID } from '@/domain/types';

export interface Toast {
  id: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'info' | 'error';
  persistent?: boolean;
}

export type DialogName = 'none' | 'settings' | 'trash' | 'help' | 'search';

interface UiState {
  toasts: Toast[];
  pendingRenameId: ID | null;
  dialog: DialogName;
  dialogOpenedAt: number;
  /** Elemento que abriu o diálogo (devolução de foco). */
  dialogTrigger: HTMLElement | null;
  navigationRequestId: ID | null;
  selectedNodeIds: ID[];
  memoryOnly: boolean;
  toast: (message: string, options?: Omit<Toast, 'id' | 'message'>) => void;
  dismissToast: (id: string) => void;
  startRename: (id: ID | null) => void;
  openDialog: (dialog: DialogName) => void;
  closeDialog: () => void;
  requestNavigation: (id: ID) => void;
  clearNavigationRequest: () => void;
  setSelectedNodeIds: (ids: readonly ID[]) => void;
  clearSelectedNodeIds: () => void;
  setMemoryOnly: (memoryOnly: boolean) => void;
}

const MAX_TOASTS = 3;

export const useUiStore = create<UiState>((set, get) => ({
  toasts: [],
  pendingRenameId: null,
  dialog: 'none',
  dialogOpenedAt: 0,
  dialogTrigger: null,
  navigationRequestId: null,
  selectedNodeIds: [],
  memoryOnly: false,

  toast: (message, options = {}) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const toast: Toast = { id, message, ...options };
    set((state) => ({ toasts: [...state.toasts, toast].slice(-MAX_TOASTS) }));
  },

  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },

  startRename: (id) => {
    set({ pendingRenameId: id });
  },

  openDialog: (dialog) => {
    set({ dialog, dialogOpenedAt: Date.now(), dialogTrigger: document.activeElement as HTMLElement | null });
  },

  closeDialog: () => {
    const trigger = get().dialogTrigger;
    set({ dialog: 'none', dialogTrigger: null });
    trigger?.focus?.({ preventScroll: true });
  },

  requestNavigation: (id) => set({ navigationRequestId: id }),
  clearNavigationRequest: () => set({ navigationRequestId: null }),
  setSelectedNodeIds: (ids) => set({ selectedNodeIds: [...new Set(ids)] }),
  clearSelectedNodeIds: () => set({ selectedNodeIds: [] }),
  setMemoryOnly: (memoryOnly) => set({ memoryOnly }),
}));
