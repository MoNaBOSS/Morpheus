import type { Rectangle } from 'electron';

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
}

export function createMorpheusCompanionSurfaceController(options: {
  getWorkArea: (bounds: Rectangle) => Rectangle;
  compactWidth?: number;
  compactHeight?: number;
}): MorpheusCompanionSurfaceController {
  const compactWidth = options.compactWidth ?? 760;
  const compactHeight = options.compactHeight ?? 340;
  let activeWindow: CompanionWindow | null = null;
  let saved: SavedWindowState | null = null;
  let current: MorpheusCompanionSurfaceStatus = { mode: 'full' };

  const restoreWindow = (window: CompanionWindow, keepVisible: boolean): void => {
    if (!saved || activeWindow !== window || window.isDestroyed()) {
      current = { mode: 'full' };
      activeWindow = null;
      saved = null;
      return;
    }
    const prior = saved;
    // Bounds must be restored while the temporary compact minimum is active.
    window.setAlwaysOnTop(prior.wasAlwaysOnTop);
    window.setResizable(prior.wasResizable);
    window.setBounds(prior.bounds, false);
    window.setMinimumSize(prior.minimumSize[0], prior.minimumSize[1]);
    if (prior.wasMaximized) window.maximize();
    if (prior.wasFullScreen) window.setFullScreen(true);
    if (keepVisible || prior.wasVisible) {
      window.show();
      window.focus();
    } else {
      window.hide();
    }
    current = { mode: 'full' };
    activeWindow = null;
    saved = null;
  };

  return {
    show(window, trigger) {
      if (window.isDestroyed()) return { mode: 'full' };
      if (saved && activeWindow === window) {
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
      window.setMinimumSize(640, 280);
      window.setResizable(false);
      window.setAlwaysOnTop(true, 'floating');
      const workArea = options.getWorkArea(saved.bounds);
      const width = Math.max(640, Math.min(compactWidth, workArea.width - 24));
      const height = Math.max(280, Math.min(compactHeight, workArea.height - 24));
      window.setBounds({
        x: Math.round(workArea.x + (workArea.width - width) / 2),
        y: Math.round(workArea.y + Math.max(12, (workArea.height - height) * 0.18)),
        width,
        height,
      }, false);
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
      current = { mode: 'full' };
    },
    status: () => ({ ...current }),
  };
}
