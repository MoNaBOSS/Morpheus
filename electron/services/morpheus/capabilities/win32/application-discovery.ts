/** Main-owned discovery for the existing compiled application allowlist. */
import { execFile } from 'node:child_process';
import { basename, isAbsolute, join } from 'node:path';
import { getMorpheusApplicationEntry, isMorpheusApplicationKey, type MorpheusApplicationKey } from '@shared/morpheus/actions/registry';
import { assertRegularFileInside, isPathInside } from '../../../../utils/morpheus-path-guard';
import { MorpheusCapabilityError } from '../../capability-registry';

const APP_PATHS_KEY = 'Software\\Microsoft\\Windows\\CurrentVersion\\App Paths';
const APPROVED_EXECUTABLE_NAMES = new Set(['notepad.exe', 'calc.exe', 'mspaint.exe', 'spotify.exe']);
const REGISTRY_TIMEOUT_MS = 1_500;
const REGISTRY_MAX_BYTES = 8_192;

export function resolveSystemRoot(env: NodeJS.ProcessEnv): string {
  const candidate = env.SystemRoot || env.systemroot || env.SYSTEMROOT || 'C:\\Windows';
  if (typeof candidate !== 'string' || !candidate.trim()) throw new MorpheusCapabilityError('resolution-failed', 'SystemRoot is not set');
  if (!isAbsolute(candidate) || !/^[A-Za-z]:[\\/]/.test(candidate)) throw new MorpheusCapabilityError('resolution-failed', 'SystemRoot is not an absolute drive-rooted path');
  return candidate;
}

export function resolveAppData(env: NodeJS.ProcessEnv): string {
  const candidate = env.APPDATA;
  if (!candidate || !isAbsolute(candidate) || !/^[A-Za-z]:[\\/]/.test(candidate)) throw new MorpheusCapabilityError('resolution-failed', 'APPDATA is not an absolute drive-rooted path');
  return candidate;
}

function optionalRoot(value: string | undefined): string | null {
  return value && isAbsolute(value) && /^[A-Za-z]:[\\/]/.test(value) ? value : null;
}

/** Only the default REG_SZ path is used, never Path/env/command templates. */
export function parseWindowsAppPath(output: string, executableName: string): string | null {
  if (!APPROVED_EXECUTABLE_NAMES.has(executableName.toLowerCase()) || output.length > REGISTRY_MAX_BYTES) return null;
  const rows = output.split(/\r?\n/).map((row) => /^\s*.+?\s+REG_SZ\s+(.+?)\s*$/.exec(row)?.[1]).filter((value): value is string => Boolean(value));
  if (rows.length !== 1) return null;
  let path = rows[0].trim();
  if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1);
  if (path.includes('"') || path.includes('%') || [...path].some((char) => char.charCodeAt(0) < 32) || path.length > 2_048 || !isAbsolute(path)
    || !/^[A-Za-z]:[\\/]/.test(path) || basename(path).toLowerCase() !== executableName.toLowerCase()) return null;
  return path;
}

export type MorpheusAppPathReader = (executableName: string, env: NodeJS.ProcessEnv) => Promise<readonly string[]>;

/** Trusted reg.exe, fixed read-only subkeys, bounded output/time, shell disabled. */
export const readWindowsAppPaths: MorpheusAppPathReader = async (executableName, env) => {
  if (!APPROVED_EXECUTABLE_NAMES.has(executableName.toLowerCase())) return [];
  let regPath: string;
  try {
    const directory = join(resolveSystemRoot(env), 'System32');
    regPath = assertRegularFileInside(directory, join(directory, 'reg.exe'));
  } catch { return []; }
  const lookups = ['HKCU', 'HKLM'].flatMap((hive) => ['64', '32'].map((view) => new Promise<string | null>((resolve) => {
    execFile(regPath, ['query', `${hive}\\${APP_PATHS_KEY}\\${executableName}`, '/ve', `/reg:${view}`], {
      encoding: 'utf8', shell: false, windowsHide: true, timeout: REGISTRY_TIMEOUT_MS, maxBuffer: REGISTRY_MAX_BYTES,
    }, (error, stdout) => resolve(error ? null : parseWindowsAppPath(stdout, executableName)));
  })));
  return [...new Set((await Promise.all(lookups)).filter((value): value is string => value !== null))];
};

export type MorpheusDiscoveredApplication = {
  applicationKey: MorpheusApplicationKey;
  executablePath: string;
  expectedDirectory: string;
  args: readonly string[];
  source: 'common-install' | 'app-paths';
};

function installationDirectories(key: MorpheusApplicationKey, env: NodeJS.ProcessEnv): string[] {
  if (key !== 'spotify') {
    const systemRoot = resolveSystemRoot(env);
    return [join(systemRoot, 'System32'), ...(key === 'notepad' ? [systemRoot] : [])];
  }
  return [
    optionalRoot(env.APPDATA) ? join(env.APPDATA!, 'Spotify') : null,
    optionalRoot(env.LOCALAPPDATA) ? join(env.LOCALAPPDATA!, 'Spotify') : null,
    optionalRoot(env.LOCALAPPDATA) ? join(env.LOCALAPPDATA!, 'Programs', 'Spotify') : null,
    optionalRoot(env.ProgramFiles) ? join(env.ProgramFiles!, 'Spotify') : null,
    optionalRoot(env['ProgramFiles(x86)']) ? join(env['ProgramFiles(x86)']!, 'Spotify') : null,
  ].filter((value): value is string => value !== null);
}

export async function discoverApprovedWindowsApplication(
  key: MorpheusApplicationKey, env: NodeJS.ProcessEnv, readRegistration: MorpheusAppPathReader = readWindowsAppPaths,
): Promise<MorpheusDiscoveredApplication> {
  if (!isMorpheusApplicationKey(key)) throw new MorpheusCapabilityError('invalid-params', 'Unknown application key');
  const entry = getMorpheusApplicationEntry(key);
  const directories = installationDirectories(key, env);
  const verify = (candidate: string, source: MorpheusDiscoveredApplication['source']): MorpheusDiscoveredApplication | null => {
    if (basename(candidate).toLowerCase() !== entry.fileName.toLowerCase()) return null;
    for (const directory of directories) {
      if (!isPathInside(directory, candidate)) continue;
      try { return { applicationKey: key, executablePath: assertRegularFileInside(directory, candidate), expectedDirectory: directory, args: entry.args, source }; }
      catch { /* Never execute an unverified candidate; try the next installed target. */ }
    }
    return null;
  };
  for (const directory of directories) {
    const result = verify(join(directory, entry.fileName), 'common-install');
    if (result) return result;
  }
  // No PATH search, executable filename guessing, arbitrary installer scan,
  // shell command or protocol fallback. Registration can narrow known roots.
  const registered = await readRegistration(entry.fileName, env).catch(() => []);
  for (const candidate of registered.slice(0, 4)) {
    const result = verify(candidate, 'app-paths');
    if (result) return result;
  }
  throw new MorpheusCapabilityError('resolution-failed', 'Application could not be verified in a supported installed location');
}

/** Approval never permits a later path substitution or vanished install. */
export function revalidateDiscoveredWindowsApplication(application: MorpheusDiscoveredApplication): string {
  const current = assertRegularFileInside(application.expectedDirectory, application.executablePath);
  if (current !== application.executablePath) throw new MorpheusCapabilityError('resolution-failed', 'Application installation changed after preparation');
  return current;
}
