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
  webContents: { executeJavaScript: ReturnType<typeof vi.fn> };
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

  it('restores visibility and hover state after a renderer reload without stealing focus', () => {
    const orb = new MorpheusWakeOrb(vi.fn());
    orb.show();
    const window = mock.windows[0];
    window.finishLoad();
    orb.present('hover');
    window.webContents.executeJavaScript.mockClear();
    window.finishLoad();
    const scripts = window.webContents.executeJavaScript.mock.calls.map(([script]) => script);
    expect(scripts.some((script) => script.includes("dataset.windowVisible = 'true'"))).toBe(true);
    expect(scripts.some((script) => script.includes('inert = false'))).toBe(true);
    expect(window.focus).not.toHaveBeenCalled();
    orb.hide();
    window.showInactive.mockClear();
    window.finishLoad();
    expect(window.showInactive).not.toHaveBeenCalled();
    orb.dispose();
  });

  it('projects Main-owned visibility because Electron hide may not change document.hidden', () => {
    const orb = new MorpheusWakeOrb(vi.fn());
    orb.show();
    const window = mock.windows[0];
    window.finishLoad();
    expect(window.webContents.executeJavaScript.mock.calls.some(([script]) => (
      script.includes("dataset.windowVisible = 'true'")
    ))).toBe(true);
    orb.hide();
    expect(window.webContents.executeJavaScript.mock.calls.some(([script]) => (
      script.includes("dataset.windowVisible = 'false'")
    ))).toBe(true);
    orb.show();
    expect(window.webContents.executeJavaScript.mock.calls.filter(([script]) => (
      script.includes("dataset.windowVisible = 'true'")
    ))).toHaveLength(2);
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

  it('acknowledges a focus request only after the composer is no longer inert', async () => {
    const orb = new MorpheusWakeOrb(vi.fn());
    orb.show();
    const window = mock.windows[0];
    window.finishLoad();
    let release!: () => void;
    const applied = new Promise<void>((resolve) => { release = resolve; });
    window.webContents.executeJavaScript.mockImplementation((script: string) =>
      script.includes('inert = false') ? applied : Promise.resolve());
    let acknowledged = false;
    const request = Promise.resolve(orb.present('focus')).then(() => { acknowledged = true; });
    await Promise.resolve();
    expect(acknowledged).toBe(false);
    expect(window.focus).toHaveBeenCalledOnce();
    release();
    await request;
    expect(acknowledged).toBe(true);
    orb.dispose();
  });

  it('shows a bounded social caption without focusing or opening the composer and clears on interaction/expiry', () => {
    vi.useFakeTimers();
    const orb = new MorpheusWakeOrb(vi.fn());
    try {
      orb.show();
      const window = mock.windows[0];
      expect(orb.isAvailableForSocial()).toBe(false);
      window.finishLoad();
      expect(orb.isAvailableForSocial()).toBe(true);
      orb.showCaption('How has your day been?');
      expect(window.getBounds().width).toBe(360);
      expect(window.webContents.executeJavaScript.mock.lastCall?.[0]).toContain('textContent');
      expect(window.focus).not.toHaveBeenCalled();
      expect(window.show).not.toHaveBeenCalled();
      vi.advanceTimersByTime(45_000);
      expect(window.getBounds().width).toBe(100);
      orb.showCaption('A quiet check-in');
      orb.present('hover');
      expect(orb.isAvailableForSocial()).toBe(false);
      expect(window.webContents.executeJavaScript.mock.calls.some(([script]) => script.includes('dataset.social = "false"'))).toBe(true);
      orb.present('collapse');
      orb.showCaption('Another check-in');
      orb.updatePresence({ v: 4, state: 'listening', ambientEnabled: true });
      expect(window.getBounds().width).toBe(100);
      expect(orb.isAvailableForSocial()).toBe(false);
      orb.showCaption('Must not interrupt');
      expect(window.getBounds().width).toBe(100);
    } finally { orb.dispose(); vi.useRealTimers(); }
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

  it('forwards only bounded active audio level and clears it outside listening/speaking', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    try {
    const orb = new MorpheusWakeOrb(vi.fn());
    orb.show();
    const window = mock.windows[0];
    window.finishLoad();
    const scripts = window.webContents.executeJavaScript;
    const before = scripts.mock.calls.length;
    orb.updateLevel(0.6); // No microphone or playback while idle.
    orb.updateLevel(Number.NaN);
    expect(scripts).toHaveBeenCalledTimes(before);

    orb.updatePresence({ v: 4, state: 'listening', ambientEnabled: true });
    orb.updateLevel(0.6);
    expect(scripts.mock.lastCall?.[0]).toContain("'0.600'");
    const activeCount = scripts.mock.calls.length;
    orb.updateLevel(0.8); // Coalesced positive update inside 50ms.
    expect(scripts).toHaveBeenCalledTimes(activeCount);
    orb.updatePresence({ v: 4, state: 'working', ambientEnabled: true });
    expect(scripts.mock.calls.slice(activeCount).some(([script]) => script.includes("'0.000'"))).toBe(true);
    const stoppedCount = scripts.mock.calls.length;
    orb.updateLevel(0.7);
    expect(scripts).toHaveBeenCalledTimes(stoppedCount);
    } finally {
      now.mockRestore();
    }
  });

  it('flushes the latest coalesced level and ignores repeated zero requests', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T00:00:00Z'));
    try {
      const orb = new MorpheusWakeOrb(vi.fn());
      orb.show();
      const window = mock.windows[0];
      window.finishLoad();
      orb.updatePresence({ v: 4, state: 'speaking', ambientEnabled: false });
      const scripts = window.webContents.executeJavaScript;
      orb.updateLevel(0.2);
      const immediateCount = scripts.mock.calls.length;
      orb.updateLevel(0.4);
      orb.updateLevel(0.8);
      expect(scripts).toHaveBeenCalledTimes(immediateCount);
      vi.advanceTimersByTime(50);
      expect(scripts.mock.lastCall?.[0]).toContain("'0.800'");
      orb.updateLevel(0);
      const stoppedCount = scripts.mock.calls.length;
      for (let index = 0; index < 100; index += 1) orb.updateLevel(0);
      expect(scripts).toHaveBeenCalledTimes(stoppedCount);
      orb.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
