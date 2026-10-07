import type { Settings, ThemeSetting, Density, ReducedMotion, UiScale } from './types';

export const SETTINGS_KEY = 'app';
export const SETTINGS_SCHEMA_VERSION = 1;

export function defaultSettings(): Settings {
  return {
    theme: 'dark',
    showLinkEdges: false,
    sidebarCollapsed: false,
    editorWidth: 420,
    editorOpen: true,
    reducedMotion: 'system',
    lastCategoryId: null,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    density: 'comfortable',
    uiScale: 1,
    tagStripAccents: false,
  };
}

const THEMES: ThemeSetting[] = ['dark', 'light', 'system'];
const MOTIONS: ReducedMotion[] = ['system', 'on', 'off'];
const DENSITIES: Density[] = ['comfortable', 'compact'];
const SCALES: UiScale[] = [1, 1.15, 1.3];

/**
 * Higieniza qualquer linha vinda do banco (banco corrompido ou versão futura).
 * Campos desconhecidos são descartados; faltantes recebem o padrão.
 */
export function sanitizeSettings(input: unknown): Settings {
  const defaults = defaultSettings();
  if (typeof input !== 'object' || input === null) return defaults;
  const row = input as Record<string, unknown>;

  const theme = THEMES.includes(row.theme as ThemeSetting)
    ? (row.theme as ThemeSetting)
    : defaults.theme;
  const reducedMotion = MOTIONS.includes(row.reducedMotion as ReducedMotion)
    ? (row.reducedMotion as ReducedMotion)
    : defaults.reducedMotion;
  const density = DENSITIES.includes(row.density as Density)
    ? (row.density as Density)
    : defaults.density;
  const uiScale = SCALES.includes(row.uiScale as UiScale)
    ? (row.uiScale as UiScale)
    : defaults.uiScale;

  return {
    theme,
    showLinkEdges:
      typeof row.showLinkEdges === 'boolean' ? row.showLinkEdges : defaults.showLinkEdges,
    sidebarCollapsed:
      typeof row.sidebarCollapsed === 'boolean' ? row.sidebarCollapsed : defaults.sidebarCollapsed,
    editorWidth:
      typeof row.editorWidth === 'number' && row.editorWidth >= 320 && row.editorWidth <= 640
        ? row.editorWidth
        : defaults.editorWidth,
    editorOpen: typeof row.editorOpen === 'boolean' ? row.editorOpen : defaults.editorOpen,
    reducedMotion,
    lastCategoryId: typeof row.lastCategoryId === 'string' ? row.lastCategoryId : null,
    schemaVersion:
      typeof row.schemaVersion === 'number' ? row.schemaVersion : defaults.schemaVersion,
    density,
    uiScale,
    tagStripAccents:
      typeof row.tagStripAccents === 'boolean' ? row.tagStripAccents : defaults.tagStripAccents,
  };
}
