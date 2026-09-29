import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MorpheusWakeOrb } from '@electron/main/morpheus-wake-orb';
import { wakeOrbBounds } from '@electron/main/morpheus-presence-layout';

const mock = vi.hoisted(() => ({ windows: [] as Array<{
  finishLoad(): void;
  showInactive: ReturnType<typeof vi.fn>;
  setBounds: ReturnType<typeof vi.fn>;
}> }));

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  class Window extends EventEmitter {
    loading = true;
    destroyed = false;
    showInactive = vi.fn();
    hide = vi.fn();
    setBounds = vi.fn();
    webContents = Object.assign(new EventEmitter(), {
      isLoading: () => this.loading,
      setWindowOpenHandler: vi.fn(),
      executeJavaScript: vi.fn(async () => undefined),
    });
    constructor() { super(); mock.windows.push(this); }
    isDestroyed() { return this.destroyed; }
    loadFile() { return Promise.resolve(); }
    close() { this.destroyed = true; this.emit('closed'); }
    finishLoad() { this.loading = false; this.webContents.emit('did-finish-load'); }
  }
  return {
    BrowserWindow: Window,
    app: { isPackaged: false },
    screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }) },
  };
});

describe.skipIf(process.platform !== 'win32')('native orb visibility across delayed loading', () => {
  beforeEach(() => { mock.windows.length = 0; });

  it('honours hide while loading and permits a later explicit wake', () => {
    const orb = new MorpheusWakeOrb(vi.fn());
    orb.show();
    const window = mock.windows[0];
    orb.hide();
    window.finishLoad();
    expect(window.showInactive).not.toHaveBeenCalled();
    orb.show();
    expect(window.showInactive).toHaveBeenCalledOnce();
  });

  it('does not resurrect an orb after ambient voice is switched off', () => {
    const orb = new MorpheusWakeOrb(vi.fn());
    orb.show();
    orb.updatePresence({ v: 4, state: 'asleep', ambientEnabled: false });
    mock.windows[0].finishLoad();
    expect(mock.windows[0].showInactive).not.toHaveBeenCalled();
  });

  it('waits for loading after repeated wakes and ignores a disposed window', () => {
    const orb = new MorpheusWakeOrb(vi.fn());
    orb.show();
    orb.show();
    const old = mock.windows[0];
    expect(old.showInactive).not.toHaveBeenCalled();
    orb.dispose();
    orb.show();
    old.finishLoad();
    mock.windows[1].finishLoad();
    expect(old.showInactive).not.toHaveBeenCalled();
    expect(mock.windows[1].showInactive).toHaveBeenCalledOnce();
  });

  it('repositions the visible orb when the work area changes without showing it again', () => {
    let workArea = { x: 0, y: 0, width: 1920, height: 1040 };
    const orb = new MorpheusWakeOrb(vi.fn(), () => workArea);
    orb.show();
    mock.windows[0].finishLoad();
    workArea = { x: -1440, y: 50, width: 1440, height: 860 };
    orb.reposition();
    expect(mock.windows[0].setBounds).toHaveBeenLastCalledWith(wakeOrbBounds(workArea));
    expect(mock.windows[0].showInactive).toHaveBeenCalledOnce();
  });
});
