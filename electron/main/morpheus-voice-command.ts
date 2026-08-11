import type { BrowserWindow, GlobalShortcut } from 'electron';

export const MORPHEUS_VOICE_COMMAND_ACCELERATOR = 'CommandOrControl+Alt+Space';

export interface MorpheusVoiceCommandRegistration {
  start(): boolean;
  stop(): void;
}

/**
 * Fixed and Main-owned. The renderer cannot register an accelerator, select a
 * capture device or turn the shortcut into executable input. It receives only
 * a typed request to open the trusted voice surface.
 */
export function createMorpheusVoiceCommandRegistration(options: {
  shortcuts: Pick<GlobalShortcut, 'register' | 'unregister'>;
  getMainWindow: () => BrowserWindow | null;
  emit: (window: BrowserWindow) => void;
}): MorpheusVoiceCommandRegistration {
  let registered = false;
  return {
    start() {
      if (registered) return true;
      registered = options.shortcuts.register(MORPHEUS_VOICE_COMMAND_ACCELERATOR, () => {
        const window = options.getMainWindow();
        if (!window || window.isDestroyed()) return;
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
        options.emit(window);
      });
      return registered;
    },
    stop() {
      if (!registered) return;
      options.shortcuts.unregister(MORPHEUS_VOICE_COMMAND_ACCELERATOR);
      registered = false;
    },
  };
}
