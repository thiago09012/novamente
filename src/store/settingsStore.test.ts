import { beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultSettings, sanitizeSettings } from '@/domain/settings';
import type { Settings } from '@/domain/types';

const { settingsSet } = vi.hoisted(() => ({ settingsSet: vi.fn() }));

vi.mock('@/app/runtime', () => ({
  runtime: () => ({ repos: { settings: { set: settingsSet } } }),
}));

import { useSettingsStore } from './settingsStore';

let storedSettings: Settings;

beforeEach(() => {
  storedSettings = defaultSettings();
  settingsSet.mockReset();
  settingsSet.mockImplementation((patch: Partial<Settings>) => {
    storedSettings = sanitizeSettings({ ...storedSettings, ...patch });
    return Promise.resolve(storedSettings);
  });
  useSettingsStore.setState({ settings: defaultSettings(), status: 'idle' });
});

describe('store de configurações', () => {
  it('não grava nem notifica para um patch sem alterações', async () => {
    const current = useSettingsStore.getState().settings;

    await useSettingsStore.getState().update({ theme: current.theme });

    expect(settingsSet).not.toHaveBeenCalled();
  });

  it('não publica novamente quando o valor persistido já é o otimista', async () => {
    const listener = vi.fn();
    const unsubscribe = useSettingsStore.subscribe(listener);

    await useSettingsStore.getState().update({ theme: 'light' });

    expect(useSettingsStore.getState().settings.theme).toBe('light');
    expect(settingsSet).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('preserva patches mais novos quando uma gravação anterior termina depois', async () => {
    let resolveFirst!: (settings: Settings) => void;
    const firstSaved = sanitizeSettings({ ...defaultSettings(), theme: 'light' });
    settingsSet
      .mockImplementationOnce(
        () =>
          new Promise<Settings>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce((patch: Partial<Settings>) => {
        storedSettings = sanitizeSettings({ ...storedSettings, ...patch });
        return Promise.resolve(storedSettings);
      });

    const themeUpdate = useSettingsStore.getState().update({ theme: 'light' });
    const widthUpdate = useSettingsStore.getState().update({ editorWidth: 520 });
    await vi.waitFor(() => expect(settingsSet).toHaveBeenCalledTimes(1));
    storedSettings = firstSaved;
    resolveFirst(firstSaved);
    await Promise.all([themeUpdate, widthUpdate]);

    expect(useSettingsStore.getState().settings.theme).toBe('light');
    expect(useSettingsStore.getState().settings.editorWidth).toBe(520);
    expect(storedSettings.editorWidth).toBe(520);
  });
});