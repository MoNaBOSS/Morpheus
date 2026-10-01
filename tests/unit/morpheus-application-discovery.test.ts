import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverApprovedWindowsApplication, parseWindowsAppPath, revalidateDiscoveredWindowsApplication, resolveSystemRoot } from '@electron/services/morpheus/capabilities/win32/application-discovery';

const owned: string[] = [];
afterEach(async () => { for (const root of owned.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() { const root = await mkdtemp(join(tmpdir(), 'morpheus-app-discovery-')); owned.push(root); return root; }

describe.runIf(process.platform === 'win32')('Main-owned installed application discovery', () => {
  it('prefers a verified local installation without querying the registry or executing anything', async () => {
    const root = await fixture();
    await mkdir(join(root, 'Programs', 'Spotify'), { recursive: true });
    await writeFile(join(root, 'Programs', 'Spotify', 'Spotify.exe'), 'not executable fixture');
    const reader = vi.fn();
    const result = await discoverApprovedWindowsApplication('spotify', { LOCALAPPDATA: root }, reader);
    expect(result).toMatchObject({ source: 'common-install', executablePath: join(root, 'Programs', 'Spotify', 'Spotify.exe'), args: [] });
    expect(reader).not.toHaveBeenCalled();
    expect(revalidateDiscoveredWindowsApplication(result)).toBe(result.executablePath);
    await rm(result.executablePath);
    expect(() => revalidateDiscoveredWindowsApplication(result)).toThrow();
  });
  it('accepts an App Paths subdirectory only under a compiled approved root', async () => {
    const root = await fixture();
    const directory = join(root, 'Spotify', 'current');
    await mkdir(directory, { recursive: true });
    const path = join(directory, 'Spotify.exe');
    await writeFile(path, 'not executable fixture');
    const reader = vi.fn(async () => [path]);
    const result = await discoverApprovedWindowsApplication('spotify', { APPDATA: root }, reader);
    expect(result).toMatchObject({ source: 'app-paths', executablePath: path });
    expect(reader).toHaveBeenCalledWith('Spotify.exe', { APPDATA: root });
    await expect(discoverApprovedWindowsApplication('spotify', { APPDATA: join(root, 'elsewhere') }, reader)).rejects.toThrow('could not be verified');
  });
  it('rejects unrelated executables, directories and unapproved logical keys', async () => {
    const root = await fixture();
    await mkdir(join(root, 'Spotify', 'Spotify.exe'), { recursive: true });
    const reader = vi.fn(async () => [join(root, 'Spotify', 'Spotify.exe')]);
    await expect(discoverApprovedWindowsApplication('spotify', { APPDATA: root }, reader)).rejects.toThrow();
    await expect(discoverApprovedWindowsApplication('cmd' as never, {}, reader)).rejects.toThrow('Unknown application');
    expect(() => resolveSystemRoot({ SystemRoot: '\\\\network\\Windows' })).toThrow('absolute drive');
  });
  it('parses one bounded REG_SZ executable path, never arguments variables or a protocol', () => {
    const row = (path: string) => `HKEY_CURRENT_USER\\Software\\App Paths\n    (Default)    REG_SZ    ${path}\n`;
    expect(parseWindowsAppPath(row('"C:\\Users\\Test\\Spotify\\Spotify.exe"'), 'Spotify.exe')).toBe('C:\\Users\\Test\\Spotify\\Spotify.exe');
    for (const path of ['C:\\Spotify.exe --flag', 'https://example.com/Spotify.exe', '%APPDATA%\\Spotify.exe', '\\\\server\\Spotify.exe', 'C:\\cmd.exe', 'C:\\Spotify.exe\u0000']) {
      expect(parseWindowsAppPath(row(path), 'Spotify.exe')).toBeNull();
    }
    expect(parseWindowsAppPath(row('C:\\Spotify.exe') + row('C:\\Other\\Spotify.exe'), 'Spotify.exe')).toBeNull();
    expect(parseWindowsAppPath(row('C:\\Spotify.exe').replace('REG_SZ', 'REG_EXPAND_SZ'), 'Spotify.exe')).toBeNull();
  });
});
