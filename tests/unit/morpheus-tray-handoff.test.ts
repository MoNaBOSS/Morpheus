import { afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ destroyed: false }));
vi.mock('electron', () => ({
  app: { isPackaged: false },
  Menu: { buildFromTemplate: vi.fn() },
  Tray: class {
    isDestroyed() { return state.destroyed; }
    setToolTip() {} setContextMenu() {} on() {} destroy() {}
  },
  nativeImage: { createFromPath: () => ({ isEmpty: () => false, setTemplateImage: vi.fn() }) },
}));
import { createTray, destroyTray, hideWindowToTray, isWindowParkedInTray, clearWindowTrayHandoff } from '@electron/main/tray';

const windowFixture = () => ({ isDestroyed: () => false, hide: vi.fn() });
const options = () => ({
  getGatewayStatus: () => ({ state: 'running', gatewayReady: true }),
  controls: {
    runtimeControl: () => ({ paused: false }), permissionProfile: () => 'balanced',
    voicePresence: () => ({ ambientEnabled: false, state: 'asleep' }),
    setAmbientVoiceEnabled: vi.fn(),
  },
});
afterEach(() => { destroyTray(); state.destroyed = false; });
describe('explicit Morpheus tray handoff', () => {
  it('keeps the workspace visible when no tray exists', () => {
    const window = windowFixture();
    expect(() => hideWindowToTray(window as never)).toThrow('tray is unavailable');
    expect(window.hide).not.toHaveBeenCalled();
  });
  it('hides only the registered window, without enabling ambient voice', () => {
    const window = windowFixture();
    const controls = options();
    createTray(window as never, controls as never);
    window.hide.mockImplementation(() => expect(isWindowParkedInTray(window as never)).toBe(true));
    hideWindowToTray(window as never);
    expect(window.hide).toHaveBeenCalledOnce();
    expect(controls.controls.setAmbientVoiceEnabled).not.toHaveBeenCalled();
    const unrelated = windowFixture();
    expect(() => hideWindowToTray(unrelated as never)).toThrow();
    expect(unrelated.hide).not.toHaveBeenCalled();
    expect(isWindowParkedInTray(unrelated as never)).toBe(false);
    clearWindowTrayHandoff(window as never);
    expect(isWindowParkedInTray(window as never)).toBe(false);
  });
  it('does not hide when the tray was destroyed', () => {
    const window = windowFixture();
    createTray(window as never, options() as never);
    state.destroyed = true;
    expect(() => hideWindowToTray(window as never)).toThrow();
    expect(window.hide).not.toHaveBeenCalled();
  });
  it('does not leave a tray marker after a failed hide', () => {
    const window = windowFixture();
    createTray(window as never, options() as never);
    window.hide.mockImplementation(() => { throw new Error('window unavailable'); });
    expect(() => hideWindowToTray(window as never)).toThrow('window unavailable');
    expect(isWindowParkedInTray(window as never)).toBe(false);
  });
});
