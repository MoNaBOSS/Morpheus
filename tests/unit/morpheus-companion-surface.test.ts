import { describe, expect, it, vi } from 'vitest';

import { createMorpheusCompanionSurfaceController } from '@electron/main/morpheus-companion-surface';
import { wakeOrbBounds, wakeOrbHoverBounds, wakeCompactBounds } from '@electron/main/morpheus-presence-layout';

function fakeWindow(options: { visible?: boolean; maximized?: boolean } = {}) {
  let bounds = { x: 40, y: 50, width: 1280, height: 800 };
  let minimumSize: [number, number] = [960, 600];
  let visible = options.visible ?? false;
  let maximized = options.maximized ?? false;
  let fullScreen = false;
  let alwaysOnTop = false;
  let resizable = true;
  return {
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => visible),
    isMinimized: vi.fn(() => false),
    isMaximized: vi.fn(() => maximized),
    isFullScreen: vi.fn(() => fullScreen),
    isAlwaysOnTop: vi.fn(() => alwaysOnTop),
    isResizable: vi.fn(() => resizable),
    getBounds: vi.fn(() => ({ ...bounds })),
    getMinimumSize: vi.fn(() => [...minimumSize] as [number, number]),
    restore: vi.fn(),
    unmaximize: vi.fn(() => { maximized = false; }),
    maximize: vi.fn(() => { maximized = true; }),
    setFullScreen: vi.fn((value: boolean) => { fullScreen = value; }),
    setAlwaysOnTop: vi.fn((value: boolean) => { alwaysOnTop = value; }),
    setResizable: vi.fn((value: boolean) => { resizable = value; }),
    setMinimumSize: vi.fn((width: number, height: number) => { minimumSize = [width, height]; }),
    setBounds: vi.fn((value: Partial<typeof bounds>) => { bounds = { ...bounds, ...value }; }),
    show: vi.fn(() => { visible = true; }),
    hide: vi.fn(() => { visible = false; }),
    focus: vi.fn(),
    snapshot: () => ({ bounds, minimumSize, visible, maximized, alwaysOnTop, resizable }),
  };
}

describe('Main-owned compact companion surface', () => {
  it('repositions compact and fits restored full bounds after a display change', () => {
    const window = fakeWindow(); let area = { x: 0, y: 0, width: 1920, height: 1040 };
    const controller = createMorpheusCompanionSurfaceController({ getWorkArea: () => area });
    controller.show(window, 'tray'); area = { x: -800, y: 0, width: 800, height: 580 }; controller.reposition();
    const compact = window.snapshot().bounds; expect(compact.x).toBeGreaterThanOrEqual(-800); expect(compact.x + compact.width).toBeLessThanOrEqual(0);
    controller.expand(window); expect(window.snapshot()).toMatchObject({ bounds: { x: -800, y: 0, width: 800, height: 580 }, minimumSize: [800, 580], visible: true });
  });
  it('anchors wake chat above the orb on a secondary display and restores full bounds', () => {
    const window = fakeWindow();
    const controller = createMorpheusCompanionSurfaceController({
      getWorkArea: () => ({ x: -1920, y: 100, width: 1920, height: 1040 }),
    });
    controller.show(window, 'global-shortcut');
    controller.show(window, 'wake-word');
    expect(window.snapshot().bounds).toEqual({ x: -456, y: 656, width: 440, height: 400 });
    controller.expand(window);
    expect(window.snapshot().bounds).toEqual({ x: 40, y: 50, width: 1280, height: 800 });
  });

  it('keeps wake chat inside a small work area instead of forcing its usual minimum size', () => {
    const window = fakeWindow();
    const controller = createMorpheusCompanionSurfaceController({
      getWorkArea: () => ({ x: 100, y: -500, width: 600, height: 400 }),
    });
    controller.show(window, 'wake-word');
    expect(window.snapshot()).toMatchObject({
      bounds: { x: 244, y: -484, width: 440, height: 368 }, minimumSize: [400, 360],
    });
  });

  it('summons from the tray and restores the exact hidden full-window state', () => {
    const window = fakeWindow({ visible: false });
    const controller = createMorpheusCompanionSurfaceController({
      getWorkArea: () => ({ x: 0, y: 0, width: 1920, height: 1040 }),
    });

    expect(controller.show(window, 'global-shortcut')).toEqual({ mode: 'compact', trigger: 'global-shortcut' });
    expect(window.snapshot()).toMatchObject({
      bounds: { width: 440, height: 400 }, minimumSize: [400, 360],
      visible: true, alwaysOnTop: true, resizable: false,
    });

    expect(controller.dismiss(window)).toEqual({ mode: 'full' });
    expect(window.snapshot()).toEqual({
      bounds: { x: 40, y: 50, width: 1280, height: 800 },
      minimumSize: [960, 600], visible: false, maximized: false,
      alwaysOnTop: false, resizable: true,
    });
  });

  it('does not overwrite the saved full-window state on repeated summons', () => {
    const window = fakeWindow({ visible: true, maximized: true });
    const controller = createMorpheusCompanionSurfaceController({
      getWorkArea: () => ({ x: 0, y: 0, width: 1600, height: 900 }),
    });
    controller.show(window, 'tray');
    controller.show(window, 'global-shortcut');
    controller.expand(window);

    expect(window.snapshot()).toMatchObject({
      bounds: { x: 40, y: 50, width: 1280, height: 800 },
      visible: true, maximized: true, alwaysOnTop: false, resizable: true,
    });
    expect(window.getBounds).toHaveBeenCalledOnce();
  });
});

describe('bottom-right presence placement', () => {
  it.each(['tray', 'global-shortcut', 'wake-word', 'orb-click'] as const)('keeps %s beside the same screen edge', (trigger) => {
    const area = { x: 48, y: 24, width: 1872, height: 1016 };
    const window = fakeWindow();
    const controller = createMorpheusCompanionSurfaceController({ getWorkArea: () => area });
    controller.show(window, trigger);
    const compact = window.snapshot().bounds;
    const orb = wakeOrbBounds(area);
    expect(orb.x + orb.width).toBe(area.x + area.width - 16);
    expect(orb.y + orb.height).toBe(area.y + area.height - 16);
    expect(compact.x + compact.width).toBe(orb.x + orb.width);
    expect(compact.y + compact.height).toBeLessThan(orb.y);
  });

  it.each([
    { x: -1920, y: 100, width: 1920, height: 1040 },
    { x: 100, y: -500, width: 600, height: 400 },
    { x: -80, y: -60, width: 80, height: 60 },
  ])('fits both surfaces inside work area $width × $height', (area) => {
    for (const bounds of [wakeOrbBounds(area), wakeOrbHoverBounds(area), wakeCompactBounds(area, 440, 520)]) {
      expect(bounds.x).toBeGreaterThanOrEqual(area.x);
      expect(bounds.y).toBeGreaterThanOrEqual(area.y);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(area.x + area.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(area.y + area.height);
    }
  });

  it('reveals the hover composer upward without moving the orb', () => {
    const area = { x: -1920, y: 100, width: 1920, height: 1040 };
    const orb = wakeOrbBounds(area);
    const hover = wakeOrbHoverBounds(area);
    expect(hover.width).toBeGreaterThan(orb.width);
    expect(hover.height).toBeGreaterThan(orb.height);
    expect(hover.x + hover.width).toBe(orb.x + orb.width);
    expect(hover.y + hover.height).toBe(orb.y + orb.height);
  });
});
