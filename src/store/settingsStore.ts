import { create } from 'zustand';

import { runtime } from '@/app/runtime';
import { DENSITY_NODE_PX } from '@/domain/constants';
import { defaultSettings } from '@/domain/settings';
import type { ID, Settings } from '@/domain/types';

export interface SystemPreferences {
  dark: boolean;
  reducedMotion: boolean;
}

/** Preferências atuais do sistema (lidas uma vez na inicialização). */
export function readSystemPreferences(): SystemPreferences {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return { dark: true, reducedMotion: false };
  }
  return {
    dark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

export const INITIAL_SYSTEM: SystemPreferences = readSystemPreferences();

/** Aplica tema, movimento e escala no documento (fonte da verdade visual). */
export function applySettingsToDom(settings: Settings, system: SystemPreferences): void {
  const root = document.documentElement;
  const theme = settings.theme === 'system' ? (system.dark ? 'dark' : 'light') : settings.theme;
  root.dataset.theme = theme;

  const reduced =
    settings.reducedMotion === 'on' ||
    (settings.reducedMotion === 'system' && system.reducedMotion);
  root.dataset.motion = reduced ? 'reduced' : 'full';

  const scale = settings.uiScale;
  root.style.setProperty('--ui-scale', String(scale));
  root.style.setProperty(
    '--node-height',
    `${Math.round(DENSITY_NODE_PX[settings.density] * scale)}px`,
  );
  root.style.setProperty('--node-font-size', `${Math.round(14 * scale)}px`);

  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', theme === 'dark' ? '#0f0f0f' : '#fafaf9');
}

interface SettingsState {
  settings: Settings;
  system: SystemPreferences;
  status: 'idle' | 'loading' | 'ready' | 'error';
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
  setActiveCategory: (id: ID | null) => void;
}

let writeQueue: Promise<unknown> = Promise.resolve();
let settingsRevision = 0;

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultSettings(),
  system: INITIAL_SYSTEM,
  status: 'idle',

  load: async () => {
    set({ status: 'loading' });
    try {
      const settings = await runtime().repos.settings.get();
      set({ settings, status: 'ready' });
    } catch (error) {
      set({ status: 'error' });
      throw error;
    }
  },

  update: async (patch) => {
    const previous = get().settings;
    const optimistic = { ...previous, ...patch };
    if (Object.keys(patch).every((key) => Object.is(previous[key as keyof Settings], patch[key as keyof Settings]))) {
      return;
    }
    const revision = ++settingsRevision;
    set({ settings: optimistic });
    try {
      writeQueue = writeQueue.then(async () => {
        const saved = await runtime().repos.settings.set(patch);
        if (revision !== settingsRevision) return;
        const current = get().settings;
        const changed = Object.keys(saved).some(
          (key) => !Object.is(current[key as keyof Settings], saved[key as keyof Settings]),
        );
        if (changed) set({ settings: saved });
      });
      await writeQueue;
    } catch (error) {
      if (revision === settingsRevision) set({ settings: previous });
      throw error;
    }
  },

  setActiveCategory: (id) => {
    void get()
      .update({ lastCategoryId: id })
      .catch(() => {
        // falha de persistência do último contexto: a UI segue usável
      });
  },
}));

/** Observa preferências do sistema (tema e movimento). Retorna o cleanup. */
export function watchSystemPreferences(onChange: (system: SystemPreferences) => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
  const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');

  const emit = () => onChange({ dark: darkMq.matches, reducedMotion: motionMq.matches });

  darkMq.addEventListener('change', emit);
  motionMq.addEventListener('change', emit);
  return () => {
    darkMq.removeEventListener('change', emit);
    motionMq.removeEventListener('change', emit);
  };
}
