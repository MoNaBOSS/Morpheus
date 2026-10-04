import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isMorpheusAppearance, normalizeMorpheusAppearance } from '@shared/morpheus/appearance-types';
import en from '@shared/i18n/locales/en/dashboard.json';
import zh from '@shared/i18n/locales/zh/dashboard.json';
import ja from '@shared/i18n/locales/ja/dashboard.json';
import ru from '@shared/i18n/locales/ru/dashboard.json';

const mocks = vi.hoisted(() => ({
  settings: { theme: 'dark', morpheusAppearance: 'green', language: 'en' } as Record<string, unknown>,
  write: vi.fn(), rendererWrite: vi.fn(), read: vi.fn(),
}));
vi.mock('@electron/utils/store', () => ({
  getAllSettings: async () => mocks.settings,
  getSetting: async (key: string) => mocks.settings[key],
  setSetting: async (key: string, value: unknown) => { mocks.write(key, value); mocks.settings[key] = value; },
  resetSettings: async () => { mocks.settings = { theme: 'dark', morpheusAppearance: 'green', language: 'en' }; },
}));
vi.mock('@electron/main/launch-at-startup', () => ({ syncLaunchAtStartupSettingFromStore: vi.fn() }));
vi.mock('@electron/main/menu', () => ({ createMenu: vi.fn() }));
vi.mock('@electron/main/proxy', () => ({ applyProxySettings: vi.fn() }));
vi.mock('@electron/utils/telemetry', () => ({ initTelemetry: vi.fn(), shutdownTelemetry: vi.fn() }));
vi.mock('@electron/utils/openclaw-proxy', () => ({ syncProxyConfigToOpenClaw: vi.fn() }));
vi.mock('@/lib/host-api', () => ({ hostApi: { settings: { getAll: mocks.read, set: mocks.rendererWrite } } }));

import { createSettingsApi } from '@electron/services/settings-api';
import type { GatewayManager } from '@electron/gateway/manager';
import { useSettingsStore } from '@/stores/settings';

describe('Morpheus appearance stays a local presentation preference', () => {
  beforeEach(() => {
    mocks.settings = { theme: 'dark', morpheusAppearance: 'green', language: 'en' };
    mocks.write.mockClear(); mocks.rendererWrite.mockReset(); mocks.read.mockReset();
    useSettingsStore.setState({ morpheusAppearance: 'green' });
  });
  it('preserves the green default for old or malformed profiles without accepting plan names', () => {
    for (const value of [undefined, null, 'unrestricted', 'premium', {}, true]) {
      expect(isMorpheusAppearance(value)).toBe(false);
      expect(normalizeMorpheusAppearance(value)).toBe('green');
    }
    expect(normalizeMorpheusAppearance('unrestricted-preview')).toBe('unrestricted-preview');
  });
  it('validates the complete Main patch before changing any setting and projects only a committed appearance', async () => {
    const changed = vi.fn();
    const api = createSettingsApi({} as GatewayManager, changed);
    await expect(api.setMany({ patch: { theme: 'light', morpheusAppearance: 'unrestricted' as never } })).rejects.toThrow('Invalid Morpheus appearance');
    expect(mocks.write).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
    await expect(api.set({ key: 'morpheusAppearance', value: 'unrestricted-preview' })).resolves.toEqual({ success: true });
    expect(mocks.write).toHaveBeenCalledExactlyOnceWith('morpheusAppearance', 'unrestricted-preview');
    expect(changed).toHaveBeenCalledExactlyOnceWith('unrestricted-preview');
    expect(mocks.settings.theme).toBe('dark');
  });
  it('keeps the previous renderer choice on failed persistence and restores the Main choice on reload', async () => {
    mocks.rendererWrite.mockRejectedValueOnce(new Error('Persistence failed'));
    await expect(useSettingsStore.getState().setMorpheusAppearance('unrestricted-preview')).rejects.toThrow();
    expect(useSettingsStore.getState().morpheusAppearance).toBe('green');
    mocks.rendererWrite.mockResolvedValueOnce({ success: false });
    await expect(useSettingsStore.getState().setMorpheusAppearance('unrestricted-preview')).rejects.toThrow();
    expect(useSettingsStore.getState().morpheusAppearance).toBe('green');
    mocks.rendererWrite.mockResolvedValueOnce({ success: true });
    await useSettingsStore.getState().setMorpheusAppearance('unrestricted-preview');
    expect(mocks.rendererWrite).toHaveBeenLastCalledWith('morpheusAppearance', 'unrestricted-preview');
    expect(useSettingsStore.getState().morpheusAppearance).toBe('unrestricted-preview');
    mocks.read.mockResolvedValueOnce({ morpheusAppearance: 'green' });
    await useSettingsStore.getState().init();
    expect(useSettingsStore.getState().morpheusAppearance).toBe('green');
  });
  it.each([['en', en], ['zh', zh], ['ja', ja], ['ru', ru]] as const)('includes the complete preview boundary and repair copy in %s', (_language, dictionary) => {
    const copy = dictionary.morpheus.experience.unrestrictedPreview;
    expect(Object.keys(copy).sort()).toEqual(['badge', 'boundary', 'description', 'failed', 'green', 'greenBody', 'red', 'redBody', 'saving', 'title']);
    expect(Object.values(copy).every((value) => typeof value === 'string' && value.trim().length > 0)).toBe(true);
    expect(copy.boundary).toContain('NerdGPT');
    expect(copy.red).toContain('Unrestricted');
    expect(copy.red).toContain(copy.badge);
  });
});
