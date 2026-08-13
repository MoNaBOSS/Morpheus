import type { BrowserWindow, GlobalShortcut } from 'electron';

export const MORPHEUS_QUICK_COMMAND_ACCELERATOR = 'CommandOrControl+Shift+Space';

export interface MorpheusQuickCommandRegistration {
  start(): boolean;
  stop(): void;
}

/**
 * Fixed and Main-owned. The renderer cannot register an accelerator or turn a
 * shortcut into a command string; it can only receive the request to show the
 * trusted command surface.
 */
export function createMorpheusQuickCommandRegistration(options: {
  shortcuts: Pick<GlobalShortcut, 'register' | 'unregister'>;
  getMainWindow: () => BrowserWindow | null;
  prepareSurface?: (window: BrowserWindow) => void;
  emit: (window: BrowserWindow) => void;
}): MorpheusQuickCommandRegistration {
  let registered = false;
  return {
    start() {
      if (registered) return true;
      registered = options.shortcuts.register(MORPHEUS_QUICK_COMMAND_ACCELERATOR, () => {
        const window = options.getMainWindow();
        if (!window || window.isDestroyed()) return;
        if (options.prepareSurface) options.prepareSurface(window);
        else {
          if (window.isMinimized()) window.restore();
          window.show();
          window.focus();
        }
        options.emit(window);
      });
      return registered;
    },
    stop() {
      if (!registered) return;
      options.shortcuts.unregister(MORPHEUS_QUICK_COMMAND_ACCELERATOR);
      registered = false;
    },
  };
}
