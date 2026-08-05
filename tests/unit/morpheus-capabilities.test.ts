import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({
  default: { spawn: spawnMock },
  spawn: spawnMock,
}));

import { EventEmitter } from 'node:events';

import { createMorpheusCapabilityRegistry, MorpheusCapabilityError } from '@electron/services/morpheus/capability-registry';
import type { MorpheusCapability, MorpheusCapabilityContext } from '@electron/services/morpheus/capability-registry';
import { createMorpheusRootProvider } from '@electron/services/morpheus/roots';
import { win32AppLaunchCapability, resolveSystemRoot } from '@electron/services/morpheus/capabilities/win32/app-launch';
import { win32CreateTextFileCapability } from '@electron/services/morpheus/capabilities/win32/create-text-file';
import { win32SystemReportCapability, collectMorpheusSystemInfo } from '@electron/services/morpheus/capabilities/win32/system-report';

const scratch = mkdtempSync(join(tmpdir(), 'morpheus-capabilities-'));
const fakeSystemRoot = join(scratch, 'FakeWindows');
mkdirSync(join(fakeSystemRoot, 'System32'), { recursive: true });
writeFileSync(join(fakeSystemRoot, 'System32', 'notepad.exe'), 'stub', 'utf8');

const roots = createMorpheusRootProvider({ userDataDir: join(scratch, 'userData') });

function context(env: NodeJS.ProcessEnv = { SystemRoot: fakeSystemRoot }): MorpheusCapabilityContext {
  return { roots, appVersion: '9.9.9', env };
}

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

beforeEach(() => {
  spawnMock.mockReset();
});

function stubChild(pid: number | null = 4242) {
  const child = new EventEmitter() as EventEmitter & { pid: number | null; kill: () => void; unref: () => void };
  child.pid = pid;
  child.kill = vi.fn();
  child.unref = vi.fn();
  return child;
}

describe('capability registry', () => {
  it('resolves by action id and platform', () => {
    const registry = createMorpheusCapabilityRegistry();
    registry.register(win32SystemReportCapability);
    expect(registry.resolve('system.report', 'win32')).toBe(win32SystemReportCapability);
  });

  it('returns undefined for an unsupported platform rather than throwing', () => {
    const registry = createMorpheusCapabilityRegistry();
    registry.register(win32SystemReportCapability);
    expect(registry.resolve('system.report', 'linux')).toBeUndefined();
    expect(registry.resolve('system.report', 'darwin')).toBeUndefined();
  });

  it('refuses a duplicate registration', () => {
    const registry = createMorpheusCapabilityRegistry();
    registry.register(win32SystemReportCapability);
    expect(() => registry.register(win32SystemReportCapability)).toThrow(/already registered/);
  });

  it('lists supported actions per platform', () => {
    const registry = createMorpheusCapabilityRegistry();
    registry.register(win32AppLaunchCapability);
    registry.register(win32SystemReportCapability);
    expect(registry.supportedActions('win32').sort()).toEqual(['app.launch', 'system.report']);
    expect(registry.supportedActions('linux')).toEqual([]);
  });

  it('keeps composite keys unambiguous across action/platform boundaries', () => {
    // The internal key joins actionId and platform with a textual separator.
    // A separator that could appear inside either part would let two distinct
    // pairs collide onto one entry, silently resolving the wrong capability.
    const registry = createMorpheusCapabilityRegistry();
    const make = (actionId: string, platform: string): MorpheusCapability => ({
      actionId,
      platform,
      resolve: async () => ({ target: { kind: 'none' }, execute: async () => ({ kind: 'system', info: {} }) }),
    } as unknown as MorpheusCapability);

    // Adjacent pairs that a naive separator could conflate.
    registry.register(make('a', 'b::c'));
    registry.register(make('a::b', 'c'));

    expect(registry.resolve('a' as never, 'b::c')?.platform).toBe('b::c');
    expect(registry.resolve('a::b' as never, 'c')?.platform).toBe('c');
    expect(registry.resolve('a' as never, 'c')).toBeUndefined();
  });

  it('stores no control characters in composite keys', () => {
    // Guards against a stray NUL or other control byte creeping back into the
    // key separator, which would also make the source file non-textual.
    const source = readFileSync(
      join(__dirname, '..', '..', 'electron', 'services', 'morpheus', 'capability-registry.ts'),
      'utf8',
    );
    // eslint-disable-next-line no-control-regex
    expect(source).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
    expect(source).toContain('JSON.stringify([actionId, platform])');
  });
});

describe('win32 app.launch', () => {
  it('rejects an unknown application key without resolving a path', async () => {
    await expect(win32AppLaunchCapability.resolve({ applicationKey: 'calc' }, context()))
      .rejects.toThrow(/Unknown application key/);
    await expect(win32AppLaunchCapability.resolve({ applicationKey: 'NOTEPAD' }, context()))
      .rejects.toThrow(/Unknown application key/);
    await expect(win32AppLaunchCapability.resolve({}, context()))
      .rejects.toThrow(/Unknown application key/);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('never accepts a path from the caller', async () => {
    await expect(
      win32AppLaunchCapability.resolve(
        { applicationKey: 'C:\\Windows\\System32\\cmd.exe' } as never,
        context(),
      ),
    ).rejects.toThrow(/Unknown application key/);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('derives the executable from the trusted environment base', async () => {
    const resolution = await win32AppLaunchCapability.resolve({ applicationKey: 'notepad' }, context());
    expect(resolution.target.kind).toBe('executable');
    if (resolution.target.kind !== 'executable') throw new Error('unreachable');
    expect(resolution.target.path.endsWith('notepad.exe')).toBe(true);
    expect(resolution.target.path.toLowerCase()).toContain('system32');
  });

  it('rejects a non-absolute or non-drive-rooted SystemRoot', () => {
    expect(() => resolveSystemRoot({ SystemRoot: 'Windows' })).toThrow(/absolute/);
    expect(() => resolveSystemRoot({ SystemRoot: 'relative\\path' })).toThrow(/absolute/);
    // A UNC path is absolute but not drive-rooted, so containment comparisons
    // against a drive-rooted expected directory would be meaningless.
    expect(() => resolveSystemRoot({ SystemRoot: '\\\\server\\share' })).toThrow(/absolute/);
  });

  it('falls back to the drive-rooted default when SystemRoot is unset', () => {
    // An unset or empty value must not become a relative or attacker-chosen
    // base; it resolves to the well-known system location instead.
    expect(resolveSystemRoot({})).toBe('C:\\Windows');
    expect(resolveSystemRoot({ SystemRoot: '' })).toBe('C:\\Windows');
  });

  it('fails resolution when the registered executable is absent', async () => {
    const emptyRoot = join(scratch, 'EmptyWindows');
    mkdirSync(join(emptyRoot, 'System32'), { recursive: true });
    await expect(
      win32AppLaunchCapability.resolve({ applicationKey: 'notepad' }, context({ SystemRoot: emptyRoot })),
    ).rejects.toThrow(/could not be verified/);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('does not spawn during resolution, only during execution', async () => {
    const resolution = await win32AppLaunchCapability.resolve({ applicationKey: 'notepad' }, context());
    expect(spawnMock).not.toHaveBeenCalled();

    const child = stubChild();
    spawnMock.mockReturnValue(child);
    const executed = resolution.execute();
    child.emit('spawn');
    const result = await executed;

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ kind: 'launch', applicationKey: 'notepad', pid: 4242 });
  });

  it('spawns with shell disabled, window hiding, no stdio and fixed empty args', async () => {
    const resolution = await win32AppLaunchCapability.resolve({ applicationKey: 'notepad' }, context());
    const child = stubChild();
    spawnMock.mockReturnValue(child);
    const executed = resolution.execute();
    child.emit('spawn');
    await executed;

    const [executable, args, spawnOptions] = spawnMock.mock.calls[0];
    expect(typeof executable).toBe('string');
    expect(executable.endsWith('notepad.exe')).toBe(true);
    expect(args).toEqual([]);
    expect(spawnOptions).toMatchObject({
      shell: false,
      windowsHide: true,
      stdio: 'ignore',
      detached: false,
    });
  });

  it('surfaces a spawn error as an execution failure', async () => {
    const resolution = await win32AppLaunchCapability.resolve({ applicationKey: 'notepad' }, context());
    const child = stubChild();
    spawnMock.mockReturnValue(child);
    const executed = resolution.execute();
    child.emit('error', new Error('boom'));
    await expect(executed).rejects.toThrow(MorpheusCapabilityError);
  });
});

describe('win32 file.createText', () => {
  const params = { fileName: 'notes.txt', content: 'hello morpheus' };

  it('resolves inside the approved root and does not write during resolution', async () => {
    const resolution = await win32CreateTextFileCapability.resolve(params, context());
    expect(resolution.target.kind).toBe('file');
    if (resolution.target.kind !== 'file') throw new Error('unreachable');
    expect(resolution.target.path).toContain(join('morpheus', 'files'));
    expect(existsSync(resolution.target.path)).toBe(false);
  });

  it('writes the file on execution and reports bytes plus a digest', async () => {
    const resolution = await win32CreateTextFileCapability.resolve(
      { fileName: 'written.txt', content: 'hello morpheus' },
      context(),
    );
    const result = await resolution.execute();
    expect(result.kind).toBe('file');
    if (result.kind !== 'file') throw new Error('unreachable');
    expect(readFileSync(result.path, 'utf8')).toBe('hello morpheus');
    expect(result.bytes).toBe(14);
    expect(result.contentSha256).toMatch(/^[0-9a-f]{16}$/);
  });

  it('refuses to overwrite an existing file', async () => {
    const resolution = await win32CreateTextFileCapability.resolve(
      { fileName: 'once.txt', content: 'first' },
      context(),
    );
    await resolution.execute();

    const second = await win32CreateTextFileCapability.resolve(
      { fileName: 'once.txt', content: 'second' },
      context(),
    );
    await expect(second.execute()).rejects.toThrow(/already exists/);
    const target = second.target;
    if (target.kind !== 'file') throw new Error('unreachable');
    expect(readFileSync(target.path, 'utf8')).toBe('first');
  });

  it('rejects traversal, reserved names and wrong extensions at resolution', async () => {
    for (const fileName of ['../escape.txt', 'a\\b.txt', 'NUL.txt', 'notes.exe']) {
      await expect(
        win32CreateTextFileCapability.resolve({ fileName, content: 'x' }, context()),
      ).rejects.toThrow(MorpheusCapabilityError);
    }
  });

  it('rejects non-string and oversized content', async () => {
    await expect(
      win32CreateTextFileCapability.resolve({ fileName: 'a.txt' }, context()),
    ).rejects.toThrow(/Content must be a string/);
    await expect(
      win32CreateTextFileCapability.resolve({ fileName: 'a.txt', content: 'x'.repeat(65_537) }, context()),
    ).rejects.toThrow(/exceeds the permitted size/);
  });

  it('accepts content exactly at the size bound', async () => {
    const resolution = await win32CreateTextFileCapability.resolve(
      { fileName: 'bound.txt', content: 'x'.repeat(65_536) },
      context(),
    );
    const result = await resolution.execute();
    if (result.kind !== 'file') throw new Error('unreachable');
    expect(result.bytes).toBe(65_536);
  });

  it('rejects unpaired surrogates', async () => {
    await expect(
      win32CreateTextFileCapability.resolve({ fileName: 'bad.txt', content: '\uD800' }, context()),
    ).rejects.toThrow(/unpaired surrogates/);
    // A well-formed pair is fine.
    await expect(
      win32CreateTextFileCapability.resolve({ fileName: 'ok.txt', content: '😀' }, context()),
    ).resolves.toBeTruthy();
  });
});

describe('win32 system.report', () => {
  it('reports runtime facts and no identifying information', async () => {
    const resolution = await win32SystemReportCapability.resolve({}, context());
    expect(resolution.target).toEqual({ kind: 'none' });

    const result = await resolution.execute();
    if (result.kind !== 'system') throw new Error('unreachable');
    expect(result.info.appVersion).toBe('9.9.9');
    expect(typeof result.info.cpuCount).toBe('number');
    expect(typeof result.info.totalMemoryBytes).toBe('number');

    const serialized = JSON.stringify(result.info).toLowerCase();
    for (const forbidden of ['username', 'hostname', 'homedir', 'macaddress', 'networkinterface', 'serial']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('exposes a stable key set', () => {
    expect(Object.keys(collectMorpheusSystemInfo('1.0.0')).sort()).toEqual([
      'appVersion',
      'arch',
      'chromeVersion',
      'cpuCount',
      'electronVersion',
      'freeMemoryBytes',
      'nodeVersion',
      'platform',
      'release',
      'totalMemoryBytes',
      'uptimeSeconds',
    ]);
  });
});
