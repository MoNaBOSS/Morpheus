import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAppData, win32AppLaunchCapability } from '@electron/services/morpheus/capabilities/win32/app-launch';
import type { MorpheusCapabilityContext } from '@electron/services/morpheus/capability-registry';

describe('registered Spotify launch resolution', () => {
  it.runIf(process.platform === 'win32')('resolves only the fixed per-user installation and never launches during preparation', async () => {
    const root = mkdtempSync(join(tmpdir(), 'morpheus-app-'));
    try {
      const context = { env: { APPDATA: root }, platform: 'win32' } as MorpheusCapabilityContext;
      await expect(win32AppLaunchCapability.resolve({ applicationKey: 'spotify' }, context)).rejects.toThrow('could not be verified');
      mkdirSync(join(root, 'Spotify'));
      writeFileSync(join(root, 'Spotify', 'Spotify.exe'), 'test fixture, never executed');
      const resolved = await win32AppLaunchCapability.resolve({ applicationKey: 'spotify' }, context);
      expect(resolved.target).toEqual({ kind: 'executable', path: join(root, 'Spotify', 'Spotify.exe'), applicationKey: 'spotify' });
      expect(() => resolveAppData({ APPDATA: 'relative/path' })).toThrow('absolute');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
