// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const mocks = vi.hoisted(() => ({
  openExternal: vi.fn(),
  openPath: vi.fn(),
  showItemInFolder: vi.fn(),
}));

vi.mock('electron', () => ({ shell: mocks }));

import { createShellApi } from '../../electron/services/shell-api';

describe('typed shell API security', () => {
  const cleanup: string[] = [];

  afterEach(async () => {
    vi.clearAllMocks();
    await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  it('allows web URLs and blocks command-capable protocols', async () => {
    const api = createShellApi();
    await api.openExternal({ url: 'https://github.com/MoNaBOSS/Morpheus' });
    expect(mocks.openExternal).toHaveBeenCalledWith('https://github.com/MoNaBOSS/Morpheus');

    await expect(api.openExternal({ url: 'file:///C:/Windows/System32/calc.exe' }))
      .rejects.toThrow('protocol is not allowed');
    await expect(api.openExternal({ url: 'ms-settings:privacy' }))
      .rejects.toThrow('protocol is not allowed');
  });

  it('opens only paths within a Main-owned root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'morpheus-shell-root-'));
    const outside = await mkdtemp(join(tmpdir(), 'morpheus-shell-outside-'));
    cleanup.push(root, outside);
    await mkdir(join(root, 'folder'));
    const trustedFile = join(root, 'folder', 'notes.txt');
    const outsideFile = join(outside, 'secret.txt');
    await writeFile(trustedFile, 'notes');
    await writeFile(outsideFile, 'secret');
    mocks.openPath.mockResolvedValue('');
    const api = createShellApi({ allowedPathRoots: () => [root] });

    await expect(api.openPath({ path: trustedFile })).resolves.toBe('');
    await expect(api.showItemInFolder({ path: trustedFile })).resolves.toBeUndefined();
    await expect(api.openPath({ path: outsideFile }))
      .rejects.toThrow('outside Main-approved roots');
    expect(mocks.openPath).toHaveBeenCalledTimes(1);
    expect(mocks.showItemInFolder).toHaveBeenCalledWith(trustedFile);
  });
});
