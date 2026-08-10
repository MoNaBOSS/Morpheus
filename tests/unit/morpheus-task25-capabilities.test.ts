import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.hoisted(() => vi.fn());
const openExternalMock = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ default: { spawn: spawnMock }, spawn: spawnMock }));
vi.mock('electron', () => ({ shell: { openExternal: openExternalMock } }));

import { createMorpheusRootProvider } from '@electron/services/morpheus/roots';
import type { MorpheusCapabilityContext } from '@electron/services/morpheus/capability-registry';
import { win32SystemStorageCapability } from '@electron/services/morpheus/capabilities/win32/system-storage';
import { parseTaskListCsv, win32SystemProcessesCapability } from '@electron/services/morpheus/capabilities/win32/system-processes';
import { win32OpenUrlCapability } from '@electron/services/morpheus/capabilities/win32/open-url';
import { win32LaunchProjectCapability } from '@electron/services/morpheus/capabilities/win32/launch-project';

const scratch = mkdtempSync(join(tmpdir(), 'morpheus-task25-'));
const userData = join(scratch, 'user-data');
const roots = createMorpheusRootProvider({ userDataDir: userData });

function context(env: NodeJS.ProcessEnv = {}): MorpheusCapabilityContext {
  return { roots, env, appVersion: '0.5.0' };
}

afterAll(() => rmSync(scratch, { recursive: true, force: true }));
beforeEach(() => {
  spawnMock.mockReset();
  openExternalMock.mockReset();
  openExternalMock.mockResolvedValue(undefined);
});

function child(pid = 4321) {
  const process = new EventEmitter() as EventEmitter & {
    pid: number;
    stdout: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
    unref: ReturnType<typeof vi.fn>;
  };
  process.pid = pid;
  process.stdout = new EventEmitter();
  process.kill = vi.fn();
  process.unref = vi.fn();
  return process;
}

describe('task 25 bounded system capabilities', () => {
  it('reports aggregate storage for the Morpheus root without exposing a caller path', async () => {
    const resolution = await win32SystemStorageCapability.resolve({}, context());
    expect(resolution.target.kind).toBe('folder');
    const result = await resolution.execute();
    expect(result).toMatchObject({ kind: 'storage', root: 'morpheusFiles' });
    if (result.kind !== 'storage') throw new Error('unreachable');
    expect(result.totalBytes).toBeGreaterThan(0);
    expect(result.freeBytes).toBeGreaterThan(0);
    expect(result.usedBytes).toBeGreaterThanOrEqual(0);
  });

  it('parses bounded process names and pids, never command lines', () => {
    const result = parseTaskListCsv('"explorer.exe","120","Console","1","12,345 K"\n"bad"');
    expect(result).toEqual([{ pid: 120, name: 'explorer.exe', memoryBytes: 12_345 * 1024 }]);
    expect(JSON.stringify(result)).not.toContain('Console');
  });

  it('runs process inventory with a fixed helper and no shell', async () => {
    const systemRoot = join(scratch, 'Windows');
    mkdirSync(join(systemRoot, 'System32'), { recursive: true });
    writeFileSync(join(systemRoot, 'System32', 'tasklist.exe'), 'stub');
    const resolution = await win32SystemProcessesCapability.resolve({}, context({ SystemRoot: systemRoot }));
    expect(resolution.target).toEqual({ kind: 'none' });
    const running = child();
    spawnMock.mockReturnValue(running);
    const execution = resolution.execute();
    running.stdout.emit('data', '"morpheus.exe","7","Console","1","1,024 K"\n');
    running.emit('close', 0);
    await expect(execution).resolves.toMatchObject({ kind: 'processes', processes: [{ pid: 7, name: 'morpheus.exe' }] });
    expect(spawnMock).toHaveBeenCalledWith(expect.stringContaining('tasklist.exe'), ['/FO', 'CSV', '/NH'], expect.objectContaining({ shell: false }));
  });

  it('opens only http(s) URLs through Electron shell', async () => {
    const resolution = await win32OpenUrlCapability.resolve({ url: 'https://example.com/docs' }, context());
    await resolution.execute();
    expect(openExternalMock).toHaveBeenCalledWith('https://example.com/docs');
    await expect(win32OpenUrlCapability.resolve({ url: 'javascript:alert(1)' }, context())).rejects.toThrow(/http and https/);
  });

  it('launches only the fixed VS Code template with an approved workspace folder', async () => {
    const programFiles = join(scratch, 'Program Files');
    const codeDir = join(programFiles, 'Microsoft VS Code');
    mkdirSync(codeDir, { recursive: true });
    writeFileSync(join(codeDir, 'Code.exe'), 'stub');
    const project = join(roots.resolve('morpheusFiles'), 'project');
    mkdirSync(project, { recursive: true });
    const resolution = await win32LaunchProjectCapability.resolve(
      { templateKey: 'vscode', path: 'project' },
      context({ ProgramFiles: programFiles }),
    );
    const running = child();
    spawnMock.mockReturnValue(running);
    const execution = resolution.execute();
    running.emit('spawn');
    await expect(execution).resolves.toMatchObject({ kind: 'project-launch', templateKey: 'vscode', pid: 4321, path: project });
    expect(spawnMock).toHaveBeenCalledWith(join(codeDir, 'Code.exe'), [project], expect.objectContaining({ shell: false }));
    await expect(win32LaunchProjectCapability.resolve({ templateKey: 'vscode', path: '..' }, context({ ProgramFiles: programFiles }))).rejects.toThrow();
  });
});
