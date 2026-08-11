import { describe, expect, it, vi } from 'vitest';

import {
  MORPHEUS_VOICE_COMMAND_ACCELERATOR,
  createMorpheusVoiceCommandRegistration,
} from '../../electron/main/morpheus-voice-command';

describe('Morpheus Voice Command registration', () => {
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
    const registration = createMorpheusVoiceCommandRegistration({
      shortcuts: { register, unregister } as never,
      getMainWindow: () => window as never,
      emit,
    });

    expect(registration.start()).toBe(true);
    expect(registration.start()).toBe(true);
    expect(register).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith(MORPHEUS_VOICE_COMMAND_ACCELERATOR, expect.any(Function));
    callback?.();
    expect(window.restore).toHaveBeenCalledOnce();
    expect(window.show).toHaveBeenCalledOnce();
    expect(window.focus).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledWith(window);

    registration.stop();
    expect(unregister).toHaveBeenCalledWith(MORPHEUS_VOICE_COMMAND_ACCELERATOR);
  });

  it('does not emit for a destroyed window', () => {
    let callback: (() => void) | undefined;
    const emit = vi.fn();
    const registration = createMorpheusVoiceCommandRegistration({
      shortcuts: {
        register: vi.fn((_accelerator, handler) => { callback = handler; return true; }),
        unregister: vi.fn(),
      } as never,
      getMainWindow: () => ({ isDestroyed: () => true }) as never,
      emit,
    });
    registration.start();
    callback?.();
    expect(emit).not.toHaveBeenCalled();
  });
});
