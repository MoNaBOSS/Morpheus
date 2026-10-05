import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MORPHEUS_PLANNER_ROUTING } from '@shared/morpheus/planner-routing';

const mocks = vi.hoisted(() => ({
  settings: { theme: 'dark', morpheusPlannerRouting: { mode: 'adaptive', routes: {} } } as Record<string, unknown>,
  write: vi.fn(), restart: vi.fn(),
}));
vi.mock('@electron/utils/store', () => ({
  getAllSettings: async () => mocks.settings,
  getSetting: async (key: string) => mocks.settings[key],
  setSetting: async (key: string, value: unknown) => { mocks.write(key, value); mocks.settings[key] = value; },
  resetSettings: vi.fn(),
}));
vi.mock('@electron/main/launch-at-startup', () => ({ syncLaunchAtStartupSettingFromStore: vi.fn() }));
vi.mock('@electron/main/menu', () => ({ createMenu: vi.fn() }));
vi.mock('@electron/main/proxy', () => ({ applyProxySettings: vi.fn() }));
vi.mock('@electron/utils/telemetry', () => ({ initTelemetry: vi.fn(), shutdownTelemetry: vi.fn() }));
vi.mock('@electron/utils/openclaw-proxy', () => ({ syncProxyConfigToOpenClaw: vi.fn() }));

import { createSettingsApi } from '@electron/services/settings-api';

describe('Main-owned task model routing setting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.settings = { theme: 'dark', morpheusPlannerRouting: { ...DEFAULT_MORPHEUS_PLANNER_ROUTING, routes: {} } };
  });
  const api = () => createSettingsApi({ getStatus: () => ({ state: 'running' }), restart: mocks.restart } as never);

  it('saves account-scoped model roles without changing the provider, microphone or runtime', async () => {
    const routing = { mode: 'adaptive' as const, routes: { 'router-account': { efficientModelId: 'vendor/fast', strongModelId: 'vendor/strong' } } };
    await expect(api().set({ key: 'morpheusPlannerRouting', value: routing })).resolves.toEqual({ success: true });
    expect(mocks.write.mock.calls).toEqual([['morpheusPlannerRouting', routing]]);
    await expect(api().get({ key: 'morpheusPlannerRouting' })).resolves.toEqual(routing);
    expect(mocks.restart).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { mode: 'unrestricted', routes: {} },
    { mode: 'adaptive', routes: [], endpoint: 'https://unapproved.example' },
    { mode: 'adaptive', routes: { router: { efficientModelId: 'vendor/fast', apiKey: 'not-a-credential' } } },
    { mode: 'fixed', routes: { router: { strongModelId: 'vendor/strong\nheader' } } },
    { mode: 'adaptive', routes: { router: { strongModelId: 'x'.repeat(201) } } },
    { mode: 'adaptive', routes: { router: { strongModelId: true } } },
    JSON.parse('{"mode":"adaptive","routes":{"__proto__":{"strongModelId":"vendor/strong"}}}'),
  ])('rejects malformed or authority-expanding routing before any write (%j)', async (routing) => {
    await expect(api().set({ key: 'morpheusPlannerRouting', value: routing as never })).rejects.toThrow('Invalid Morpheus task model routing');
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.settings.morpheusPlannerRouting).toEqual(DEFAULT_MORPHEUS_PLANNER_ROUTING);
    expect(mocks.restart).not.toHaveBeenCalled();
  });

  it('validates the complete patch before writing any setting', async () => {
    await expect(api().setMany({ patch: { theme: 'light', morpheusPlannerRouting: { mode: 'adaptive', routes: {}, grant: '*' } as never } })).rejects.toThrow('Invalid Morpheus task model routing');
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.settings.theme).toBe('dark');
  });
});
