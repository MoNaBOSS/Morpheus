import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createWindowControlCapability, type WindowIdentity, type WindowTransport } from '../../electron/services/morpheus/capabilities/win32/window-control';
import { actionResources } from '../../electron/services/morpheus/core/task-coordinator';
import { interpretCommand } from '../../shared/morpheus/interpreter/deterministic';
import { validateParam } from '../../shared/morpheus/capabilities/params';
import { validateRequestActionPayload } from '../../electron/services/morpheus-api';
import { sanitizeAuditOutcome } from '../../electron/services/morpheus/audit';
import type { MorpheusCapabilityContext } from '../../electron/services/morpheus/capability-registry';

const directories: string[] = [];
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'morpheus-window-')); directories.push(root);
  await mkdir(join(root, 'System32')); const path = join(root, 'System32', 'notepad.exe'); await writeFile(path, 'fixture-never-executed');
  const context: MorpheusCapabilityContext = { roots: {} as never, env: { SystemRoot: root }, appVersion: 'test' };
  const window: WindowIdentity = { path, handle: '12345', processId: 7, started: '6389912444', minimized: false, foreground: true };
  let windows = [window], changed: Partial<WindowIdentity> = {}, observed = true;
  const transport = vi.fn<WindowTransport>(async (request) => request.command === 'inspect' ? { ok: true, windows, packageRoot: null, foreground: '12345' }
    : { ok: observed, window: { ...window, minimized: request.operation === 'minimize', ...changed } });
  return { context, window, transport, capability: createWindowControlCapability(transport), setWindows: (value: WindowIdentity[]) => { windows = value; }, setChanged: (value: Partial<WindowIdentity>) => { changed = value; }, unavailable: () => { observed = false; } };
}

describe('named typed window controls', () => {
  it.each(['focus', 'minimize', 'restore'])('maps %s locally, validates narrow parameters and holds the desktop lease', (operation) => {
    const result = interpretCommand({ objective: `${operation} Notepad`, platform: 'win32', filesRoot: 'C:\\files', origin: { type: 'command-bar' } });
    expect(result.ok).toBe(true); if (!result.ok) throw new Error('No local plan');
    expect(result.plan.steps[0]).toMatchObject({ capabilityId: 'app.controlWindow', params: { applicationKey: 'notepad', operation } });
    expect(validateParam('windowOperation', operation).ok).toBe(true);
    expect(actionResources('app.controlWindow', 'C:\\files')).toEqual([{ key: 'desktop', access: 'write' }]);
  });
  it('rejects arbitrary scripts, window ids and compound commands', () => {
    expect(validateParam('windowOperation', 'close').ok).toBe(false);
    expect(() => validateRequestActionPayload({ actionId: 'app.controlWindow', params: { applicationKey: 'notepad', operation: 'focus', hwnd: '123' } })).toThrow();
    const result = interpretCommand({ objective: 'Minimize Notepad and erase my files', platform: 'win32', filesRoot: 'C:\\files', origin: { type: 'command-bar' } });
    expect(result.ok && result.plan.steps.some((s) => s.capabilityId === 'app.controlWindow')).toBe(false);
  });
  it.runIf(process.platform === 'win32').each(['focus', 'minimize', 'restore'])('only reports observed %s on the exact resolved app identity', async (operation) => {
    const f = await fixture(); const resolved = await f.capability.resolve({ applicationKey: 'notepad', operation }, f.context);
    expect(f.transport).toHaveBeenCalledTimes(1); expect(resolved.target).toMatchObject({ kind: 'executable', path: f.window.path });
    const result = await resolved.execute(); expect(result).toEqual({ kind: 'desktop-control', applicationKey: 'notepad', operation, observed: true });
    expect(f.transport.mock.calls[1][0]).toMatchObject({ window: f.window, foreground: '12345' });
    expect(sanitizeAuditOutcome(result)).toEqual(result);
  });
  it.runIf(process.platform === 'win32').each(['handle', 'processId', 'started', 'path', 'minimized', 'unobserved'])('does not claim success when %s changes', async (field) => {
    const f = await fixture(); const resolved = await f.capability.resolve({ applicationKey: 'notepad', operation: 'minimize' }, f.context);
    if (field === 'unobserved') f.unavailable(); else f.setChanged({ [field]: field === 'processId' ? 42 : field === 'minimized' ? false : '99999' });
    await expect(resolved.execute()).rejects.toThrow('not observed');
  });
  it.runIf(process.platform === 'win32')('does not select unknown installations, ambiguous apps, or a changed executable', async () => {
    const f = await fixture(); f.setWindows([{ ...f.window, path: join(f.context.env.SystemRoot!, 'unapproved.exe') }]);
    await expect(f.capability.resolve({ applicationKey: 'notepad', operation: 'focus' }, f.context)).rejects.toThrow('No supported');
    f.setWindows([{ ...f.window, foreground: false }, { ...f.window, handle: '456', foreground: false }]);
    await expect(f.capability.resolve({ applicationKey: 'notepad', operation: 'focus' }, f.context)).rejects.toThrow('More than one');
    f.setWindows([f.window]); const resolved = await f.capability.resolve({ applicationKey: 'notepad', operation: 'focus' }, f.context);
    await rm(f.window.path); await expect(resolved.execute()).rejects.toThrow();
    expect(f.transport.mock.calls.every(([request]) => request.command === 'inspect')).toBe(true);
  });
  it.runIf(process.platform === 'win32')('does not enter native execution after cancellation', async () => {
    const f = await fixture(); const resolved = await f.capability.resolve({ applicationKey: 'notepad', operation: 'focus' }, f.context);
    await expect(resolved.execute(AbortSignal.abort())).rejects.toThrow(); expect(f.transport).toHaveBeenCalledTimes(1);
  });
});
