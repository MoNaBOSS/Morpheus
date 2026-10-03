import type { Rectangle } from 'electron';
import { wakeCompactBounds } from './morpheus-presence-layout';

import type {
  MorpheusCompanionSurfaceStatus,
  MorpheusCompanionTrigger,
} from '@shared/morpheus/companion-types';

type CompanionWindow = {
  isDestroyed(): boolean;
  isVisible(): boolean;
  isMinimized(): boolean;
  isMaximized(): boolean;
  isFullScreen(): boolean;
  isAlwaysOnTop(): boolean;
  isResizable(): boolean;
  getBounds(): Rectangle;
  getMinimumSize(): number[];
  restore(): void;
  unmaximize(): void;
  maximize(): void;
  setFullScreen(flag: boolean): void;
  setAlwaysOnTop(flag: boolean, level?: 'floating'): void;
  setResizable(flag: boolean): void;
  setMinimumSize(width: number, height: number): void;
  setBounds(bounds: Partial<Rectangle>, animate?: boolean): void;
  show(): void;
  hide(): void;
  focus(): void;
};

type SavedWindowState = {
  bounds: Rectangle;
  minimumSize: [number, number];
  wasVisible: boolean;
  wasMaximized: boolean;
  wasFullScreen: boolean;
  wasAlwaysOnTop: boolean;
  wasResizable: boolean;
};

export interface MorpheusCompanionSurfaceController {
  show(window: CompanionWindow, trigger: MorpheusCompanionTrigger): MorpheusCompanionSurfaceStatus;
  dismiss(window: CompanionWindow): MorpheusCompanionSurfaceStatus;
  expand(window: CompanionWindow): MorpheusCompanionSurfaceStatus;
  reset(window?: CompanionWindow): void;
  status(): MorpheusCompanionSurfaceStatus;
  reposition(): void;
}

export function createMorpheusCompanionSurfaceController(options: {
  getWorkArea: (bounds: Rectangle) => Rectangle;
  getAnchor?: () => Rectangle;
  compactWidth?: number;
  compactHeight?: number;
}): MorpheusCompanionSurfaceController {
  const compactWidth = options.compactWidth ?? 440;
  const compactHeight = options.compactHeight ?? 400;
  let activeWindow: CompanionWindow | null = null;
  let saved: SavedWindowState | null = null;
  let displayChanged = false;
  let current: MorpheusCompanionSurfaceStatus = { mode: 'full' };

  const positionCompact = (window: CompanionWindow, bounds: Rectangle): void => {
    const anchor = options.getAnchor?.();
    const workArea = options.getWorkArea(anchor ?? bounds);
    const target = wakeCompactBounds(workArea, compactWidth, compactHeight, anchor);
    window.setMinimumSize(Math.min(400, target.width), Math.min(360, target.height));
    window.setBounds(target, false);
  };

  const restoreWindow = (window: CompanionWindow, keepVisible: boolean): void => {
    if (!saved || activeWindow !== window || window.isDestroyed()) {
      current = { mode: 'full' };
      activeWindow = null;
      saved = null;
      return;
    }
    const prior = saved;
    const area = options.getWorkArea(displayChanged ? window.getBounds() : prior.bounds);
    const width = Math.min(prior.bounds.width, area.width), height = Math.min(prior.bounds.height, area.height);
    const restoredBounds = displayChanged ? { width, height,
      x: Math.max(area.x, Math.min(prior.bounds.x, area.x + area.width - width)),
      y: Math.max(area.y, Math.min(prior.bounds.y, area.y + area.height - height)) } : prior.bounds;
    // Bounds must be restored while the temporary compact minimum is active.
    window.setAlwaysOnTop(prior.wasAlwaysOnTop);
    window.setResizable(prior.wasResizable);
    window.setBounds(restoredBounds, false);
    window.setMinimumSize(displayChanged ? Math.min(prior.minimumSize[0], area.width) : prior.minimumSize[0], displayChanged ? Math.min(prior.minimumSize[1], area.height) : prior.minimumSize[1]);
    if (prior.wasMaximized) window.maximize();
    if (prior.wasFullScreen) window.setFullScreen(true);
    if (keepVisible) {
      window.show();
      window.focus();
    } else {
      window.hide();
    }
    current = { mode: 'full' };
    activeWindow = null;
    saved = null;
    displayChanged = false;
  };

  return {
    show(window, trigger) {
      if (window.isDestroyed()) return { mode: 'full' };
      if (saved && activeWindow === window) {
        positionCompact(window, saved.bounds);
        current = { mode: 'compact', trigger };
        window.show();
        window.focus();
        return { ...current };
      }
      if (window.isMinimized()) window.restore();
      const minimumSize = window.getMinimumSize();
      saved = {
        bounds: window.getBounds(),
        minimumSize: [minimumSize[0] ?? 0, minimumSize[1] ?? 0],
        wasVisible: window.isVisible(),
        wasMaximized: window.isMaximized(),
        wasFullScreen: window.isFullScreen(),
        wasAlwaysOnTop: window.isAlwaysOnTop(),
        wasResizable: window.isResizable(),
      };
      activeWindow = window;
      if (saved.wasFullScreen) window.setFullScreen(false);
      if (saved.wasMaximized) window.unmaximize();
      window.setResizable(false);
      window.setAlwaysOnTop(true, 'floating');
      positionCompact(window, saved.bounds);
      window.show();
      window.focus();
      current = { mode: 'compact', trigger };
      return { ...current };
    },
    dismiss(window) {
      restoreWindow(window, false);
      return { ...current };
    },
    expand(window) {
      restoreWindow(window, true);
      return { ...current };
    },
    reset(window) {
      if (window && activeWindow !== window) return;
      activeWindow = null;
      saved = null;
      displayChanged = false;
      current = { mode: 'full' };
    },
    status: () => ({ ...current }),
    reposition() { if (activeWindow && saved && current.mode === 'compact' && !activeWindow.isDestroyed()) { displayChanged = true; positionCompact(activeWindow, activeWindow.getBounds()); } },
  };
}
