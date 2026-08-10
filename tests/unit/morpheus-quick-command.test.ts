import { describe, expect, it, vi } from 'vitest';

import {
  MORPHEUS_QUICK_COMMAND_ACCELERATOR,
  createMorpheusQuickCommandRegistration,
} from '../../electron/main/morpheus-quick-command';

describe('Morpheus Quick Command registration', () => {
  it('uses one fixed Main-owned accelerator and focuses the existing window', () => {
    let callback: (() => void) | undefined;
    const register = vi.fn((_accelerator: string, handler: () => void) => {
      callback = handler;
      return true;
    });
    const unregister = vi.fn();
    const window = {
      isDestroyed: vi.fn(() => false),
      isMinimized: vi.fn(() => true),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
    };
    const emit = vi.fn();
    const registration = createMorpheusQuickCommandRegistration({
      shortcuts: { register, unregister } as never,
      getMainWindow: () => window as never,
      emit,
    });

    expect(registration.start()).toBe(true);
    expect(registration.start()).toBe(true);
    expect(register).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith(MORPHEUS_QUICK_COMMAND_ACCELERATOR, expect.any(Function));
    callback?.();
    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith(window);

    registration.stop();
    expect(unregister).toHaveBeenCalledWith(MORPHEUS_QUICK_COMMAND_ACCELERATOR);
  });

  it('does nothing if the application window no longer exists', () => {
    let callback: (() => void) | undefined;
    const emit = vi.fn();
    const registration = createMorpheusQuickCommandRegistration({
      shortcuts: {
        register: vi.fn((_accelerator, handler) => { callback = handler; return true; }),
        unregister: vi.fn(),
      } as never,
      getMainWindow: () => null,
      emit,
    });
    registration.start();
    callback?.();
    expect(emit).not.toHaveBeenCalled();
  });
});
