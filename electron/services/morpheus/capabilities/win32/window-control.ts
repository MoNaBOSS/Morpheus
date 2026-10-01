import { join } from 'node:path';
import { isMorpheusApplicationKey, type MorpheusApplicationKey } from '@shared/morpheus/actions/registry';
import { assertRegularFileInside, isPathInside, normalizeComparablePath } from '../../../../utils/morpheus-path-guard';
import { MorpheusCapabilityError, type MorpheusCapability } from '../../capability-registry';
import { discoverApprovedWindowsApplication } from './application-discovery';
import { runDesktopHelper } from './desktop-helper-runner';

export type WindowIdentity = { handle: string; processId: number; started: string; path: string; minimized: boolean; foreground: boolean };
type WindowInspection = { ok: true; windows: WindowIdentity[]; packageRoot: string | null; foreground: string };
type WindowRequest = { command: 'inspect'; applicationKey: MorpheusApplicationKey } | { command: 'execute'; applicationKey: MorpheusApplicationKey; operation: string; window: WindowIdentity; foreground: string };
export type WindowTransport = (request: WindowRequest, env: NodeJS.ProcessEnv, signal?: AbortSignal) => Promise<unknown>;
const failure = (message: string) => new MorpheusCapabilityError('execution-failed', message);
const identity = (window: WindowIdentity) => window && /^[1-9]\d{0,18}$/.test(window.handle) && Number.isSafeInteger(window.processId) && window.processId > 0
  && /^\d{1,20}$/.test(window.started) && typeof window.path === 'string' && window.path.length < 2048 && typeof window.minimized === 'boolean' && typeof window.foreground === 'boolean';

export const runWindowHelper: WindowTransport = (request, env, signal) => runDesktopHelper('window', request, env, signal);

export function createWindowControlCapability(transport: WindowTransport = runWindowHelper): MorpheusCapability<'app.controlWindow'> {
  return { actionId: 'app.controlWindow', platform: 'win32', async resolve(params, context) {
    if (!isMorpheusApplicationKey(params.applicationKey) || !['focus', 'minimize', 'restore'].includes(params.operation)) throw new MorpheusCapabilityError('invalid-params', 'Choose focus, minimize or restore for a known app.');
    const applicationKey = params.applicationKey;
    const result = await transport({ command: 'inspect', applicationKey: params.applicationKey }, context.env) as WindowInspection;
    if (!result?.ok || !Array.isArray(result.windows) || result.windows.length > 16 || result.windows.some((item) => !identity(item)) || !/^\d{1,19}$/.test(result.foreground)) throw failure('The desktop or window inventory is unavailable.');
    const installed = await discoverApprovedWindowsApplication(params.applicationKey, context.env).catch(() => null);
    const approved: WindowIdentity[] = [];
    for (const window of result.windows) {
      if (installed && normalizeComparablePath(window.path) === normalizeComparablePath(installed.executablePath)) { approved.push(window); continue; }
      // Current-user Appx registration is queried for one compiled package family,
      // never a renderer-provided name. Only files inside protected WindowsApps.
      const packages = context.env.ProgramFiles ? join(context.env.ProgramFiles, 'WindowsApps') : null;
      if (packages && typeof result.packageRoot === 'string' && isPathInside(packages, result.packageRoot)) {
        try { assertRegularFileInside(result.packageRoot, window.path); approved.push(window); } catch { /* fail closed */ }
      }
    }
    const window = approved.find((item) => item.foreground) ?? (approved.length === 1 ? approved[0] : null);
    if (!window) throw failure(approved.length > 1 ? 'More than one matching window is open. Select the one you mean, then ask again.' : 'No supported running window was found for that app.');
    return { target: { kind: 'executable', path: window.path, applicationKey: params.applicationKey }, execute: async (signal) => {
      signal?.throwIfAborted();
      // Preserve the exact image, not merely the process name. Native helper also
      // checks PID/start-time/HWND ownership and current foreground before acting.
      assertRegularFileInside(result.packageRoot && isPathInside(result.packageRoot, window.path) ? result.packageRoot : installed!.expectedDirectory, window.path);
      const observed = await transport({ command: 'execute', applicationKey, operation: params.operation, window, foreground: result.foreground }, context.env, signal) as { ok?: boolean; window?: WindowIdentity };
      if (!observed?.ok || !observed.window || !identity(observed.window) || observed.window.handle !== window.handle || observed.window.processId !== window.processId || observed.window.started !== window.started
        || normalizeComparablePath(observed.window.path) !== normalizeComparablePath(window.path)
        || (params.operation === 'minimize' ? !observed.window.minimized : observed.window.minimized || params.operation === 'focus' && !observed.window.foreground)) throw failure('The requested window state was not observed. Windows may have protected the current focus or the target changed.');
      return { kind: 'desktop-control', applicationKey, operation: params.operation, observed: true };
    } };
  } };
}
