import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { isPackaged: false, quit: vi.fn() },
  Menu: { buildFromTemplate: vi.fn() },
  Tray: vi.fn(),
  BrowserWindow: vi.fn(),
  nativeImage: { createFromPath: vi.fn() },
}));

import { buildTrayMenuTemplate } from '@electron/main/tray';

describe('Morpheus Windows tray', () => {
  it('uses real runtime/trust state and contains no inherited ClawX or fake update actions', async () => {
    const setRuntimePaused = vi.fn(async () => ({
      v: 1 as const, paused: true, updatedAt: '2026-08-11T00:00:00.000Z',
    }));
    const setPermissionProfile = vi.fn(async () => undefined);
    const template = buildTrayMenuTemplate({
      isDestroyed: () => false,
      show: vi.fn(),
      focus: vi.fn(),
      webContents: { send: vi.fn() },
    } as never, {
      getGatewayStatus: () => ({ state: 'running', gatewayReady: true, port: 18_789 }),
      controls: {
        permissionProfile: () => 'balanced',
        setPermissionProfile,
        runtimeControl: () => ({ v: 1, paused: false, updatedAt: '2026-08-11T00:00:00.000Z' }),
        setRuntimePaused,
      },
      showQuickCommand: vi.fn(),
      showVoiceCommand: vi.fn(),
    });

    const serialized = JSON.stringify(template);
    expect(serialized).toContain('Morpheus');
    expect(serialized).toContain('OpenClaw runtime · Ready');
    expect(serialized).toContain('Permission profile · Balanced');
    expect(serialized).not.toContain('ClawX');
    expect(serialized).not.toContain('Check for Updates');

    const pause = template.find((entry) => entry.label === 'Pause new Morpheus work');
    expect(pause).toMatchObject({ type: 'checkbox', checked: false });
    pause?.click?.({} as never, {} as never, {} as never);
    await vi.waitFor(() => expect(setRuntimePaused).toHaveBeenCalledWith(true));
  });
});
