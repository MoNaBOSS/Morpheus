import { describe, expect, it, vi } from 'vitest';

import { installMorpheusMediaPermissionPolicy } from '../../electron/main/morpheus-media-permissions';

function createHarness() {
  const setPermissionCheckHandler = vi.fn();
  const setPermissionRequestHandler = vi.fn();
  const mainContents = { isDestroyed: vi.fn(() => false) };
  installMorpheusMediaPermissionPolicy({
    targetSession: { setPermissionCheckHandler, setPermissionRequestHandler } as never,
    getMainWebContents: () => mainContents as never,
  });
  return { setPermissionCheckHandler, setPermissionRequestHandler, mainContents };
}

describe('Morpheus renderer permission policy', () => {
  it('allows audio and sanitized clipboard writes only from the exact live Morpheus WebContents', () => {
    const harness = createHarness();
    const check = harness.setPermissionCheckHandler.mock.calls[0]?.[0] as (
      contents: unknown,
      permission: string,
      origin: string,
      details: { mediaType?: string },
    ) => boolean;

    expect(check(harness.mainContents, 'media', 'file://', { mediaType: 'audio' })).toBe(true);
    expect(check(harness.mainContents, 'media', 'file://', { mediaType: 'video' })).toBe(false);
    expect(check(harness.mainContents, 'clipboard-sanitized-write', 'file://', {})).toBe(true);
    expect(check(harness.mainContents, 'clipboard-read', 'file://', {})).toBe(false);
    expect(check(harness.mainContents, 'notifications', 'file://', {})).toBe(false);
    expect(check({ isDestroyed: () => false }, 'clipboard-sanitized-write', 'file://', {})).toBe(false);
    expect(check({ isDestroyed: () => false }, 'media', 'file://', { mediaType: 'audio' })).toBe(false);
    harness.mainContents.isDestroyed.mockReturnValue(true);
    expect(check(harness.mainContents, 'media', 'file://', { mediaType: 'audio' })).toBe(false);
  });

  it('allows audio-only and sanitized-write requests while denying reads, video and embedded guests', () => {
    const harness = createHarness();
    const request = harness.setPermissionRequestHandler.mock.calls[0]?.[0] as (
      contents: unknown,
      permission: string,
      callback: (allowed: boolean) => void,
      details: { mediaTypes?: string[] },
    ) => void;
    const decide = (contents: unknown, permission: string, mediaTypes?: string[]) => {
      const callback = vi.fn();
      request(contents, permission, callback, { mediaTypes });
      return callback;
    };

    expect(decide(harness.mainContents, 'media', ['audio'])).toHaveBeenCalledWith(true);
    expect(decide(harness.mainContents, 'clipboard-sanitized-write')).toHaveBeenCalledWith(true);
    expect(decide(harness.mainContents, 'clipboard-read')).toHaveBeenCalledWith(false);
    expect(decide(harness.mainContents, 'media', ['video'])).toHaveBeenCalledWith(false);
    expect(decide(harness.mainContents, 'media', ['audio', 'video'])).toHaveBeenCalledWith(false);
    expect(decide(harness.mainContents, 'media', [])).toHaveBeenCalledWith(false);
    expect(decide({ isDestroyed: () => false }, 'media', ['audio'])).toHaveBeenCalledWith(false);
    expect(decide({ isDestroyed: () => false }, 'clipboard-sanitized-write')).toHaveBeenCalledWith(false);
    expect(decide(harness.mainContents, 'display-capture', ['audio'])).toHaveBeenCalledWith(false);
  });
});
