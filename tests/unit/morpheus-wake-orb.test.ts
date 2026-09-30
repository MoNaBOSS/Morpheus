import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MorpheusWakeOrb } from '@electron/main/morpheus-wake-orb';
import { wakeOrbBounds, wakeOrbHoverBounds } from '@electron/main/morpheus-presence-layout';

const mock = vi.hoisted(() => ({ windows: [] as Array<{
  finishLoad(): void;
  showInactive: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  hide: ReturnType<typeof vi.fn>;
  setBounds: ReturnType<typeof vi.fn>;
  setShape: ReturnType<typeof vi.fn>;
  getBounds(): { x: number; y: number; width: number; height: number };
  webContents: object;
}> }));

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  class Window extends EventEmitter {
    loading = true;
    destroyed = false;
    bounds: { x: number; y: number; width: number; height: number };
    showInactive = vi.fn();
    show = vi.fn();
    focus = vi.fn();
    hide = vi.fn();
    setBounds = vi.fn((bounds: Partial<Window['bounds']>) => { this.bounds = { ...this.bounds, ...bounds }; });
    setShape = vi.fn();
    webContents = Object.assign(new EventEmitter(), {
      isLoading: () => this.loading,
      setWindowOpenHandler: vi.fn(),
      executeJavaScript: vi.fn(async () => undefined),
    });
    constructor(bounds: Window['bounds']) {
      super();
      this.bounds = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
      mock.windows.push(this);
    }
    isDestroyed() { return this.destroyed; }
    getBounds() { return { ...this.bounds }; }
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

  it('keeps the typed companion available when ambient voice is disabled', () => {
    const orb = new MorpheusWakeOrb(vi.fn());
    orb.show();
    orb.updatePresence({ v: 4, state: 'asleep', ambientEnabled: false });
    mock.windows[0].finishLoad();
    expect(mock.windows[0].showInactive).toHaveBeenCalledOnce();
    expect(mock.windows[0].hide).not.toHaveBeenCalled();
  });

  it('exposes only the current orb webContents and clears it on disposal', () => {
    const orb = new MorpheusWakeOrb(vi.fn());
    expect(orb.getWebContents()).toBeNull();
    orb.show();
    expect(orb.getWebContents()).toBe(mock.windows[0].webContents);
    orb.dispose();
    expect(orb.getWebContents()).toBeNull();
  });

  it('reveals the upward composer inactive and focuses only on explicit input', () => {
    const area = { x: -1920, y: 100, width: 1920, height: 1040 };
    const orb = new MorpheusWakeOrb(vi.fn(), () => area);
    orb.show();
    const window = mock.windows[0];
    window.finishLoad();
    expect(window.showInactive).toHaveBeenCalledOnce();

    orb.present('hover');
    expect(window.setBounds).toHaveBeenLastCalledWith(wakeOrbHoverBounds(area));
    expect(window.show).not.toHaveBeenCalled();
    expect(window.focus).not.toHaveBeenCalled();

    orb.present('focus');
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
    orb.present('collapse');
    expect(window.setBounds).toHaveBeenLastCalledWith(wakeOrbBounds(area));
  });

  it('keeps the hover panel anchored to the orb through a display change', () => {
    let area = { x: 0, y: 0, width: 1920, height: 1040 };
    const orb = new MorpheusWakeOrb(vi.fn(), () => area);
    orb.show();
    const window = mock.windows[0];
    window.finishLoad();
    orb.present('hover');
    area = { x: -1440, y: 50, width: 1440, height: 860 };
    orb.reposition();
    expect(window.setBounds).toHaveBeenLastCalledWith(wakeOrbHoverBounds(area));
    expect(window.showInactive).toHaveBeenCalledOnce();
    expect(window.show).not.toHaveBeenCalled();
    expect(window.focus).not.toHaveBeenCalled();
  });

  it('limits native hit testing to the orb and upward panel', () => {
    const orb = new MorpheusWakeOrb(vi.fn());
    orb.show();
    const window = mock.windows[0];
    window.finishLoad();
    orb.present('hover');
    const shapes = window.setShape.mock.lastCall?.[0] as Array<{
      x: number; y: number; width: number; height: number;
    }>;
    expect(shapes).toEqual(expect.arrayContaining([
      expect.objectContaining({ width: 344, height: 55 }),
    ]));
    // The transparent rectangle between the panel and orb must let other apps receive clicks.
    expect(shapes.some((rect) => 180 >= rect.x && 180 < rect.x + rect.width
      && 100 >= rect.y && 100 < rect.y + rect.height)).toBe(false);
    orb.present('collapse');
    const collapsedShapes = window.setShape.mock.lastCall?.[0] as typeof shapes;
    expect(collapsedShapes).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ width: 344, height: 55 }),
    ]));
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
