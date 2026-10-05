/** Reuse Chrome's existing profile only when it owns the requested Windows URL protocol. */
import { execFile, spawn } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { assertRegularFileInside, canonicalizeExistingDir, isPathInside } from '../../../../utils/morpheus-path-guard';
import { resolveSystemRoot } from './application-discovery';

type ChromeProfile = { executable: string; installation: string; userData: string; directory: string };

/** No account information, browsing data, or custom profile paths cross this boundary. */
export function existingChromeProfile(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const profile = (value as { profile?: { last_used?: unknown; info_cache?: unknown } }).profile;
  const directory = profile?.last_used;
  if (typeof directory !== 'string' || !/^(Default|Profile [1-9]\d{0,5})$/.test(directory)
    || !profile?.info_cache || typeof profile.info_cache !== 'object'
    || !Object.hasOwn(profile.info_cache, directory)) return null;
  return directory;
}

function root(value: string | undefined): string | null {
  return value && isAbsolute(value) && /^[A-Za-z]:[\\/]/.test(value) ? value : null;
}

async function chromeOwnsProtocol(env: NodeJS.ProcessEnv, protocol: 'http' | 'https'): Promise<boolean> {
  let executable: string;
  try { const system = join(resolveSystemRoot(env), 'System32'); executable = assertRegularFileInside(system, join(system, 'reg.exe')); }
  catch { return false; }
  return new Promise((resolve) => {
    execFile(executable, ['query', `HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\${protocol}\\UserChoice`, '/v', 'ProgId'],
      { shell: false, windowsHide: true, encoding: 'utf8', timeout: 1500, maxBuffer: 4096 }, (error, output) => {
        resolve(!error && /^\s*ProgId\s+REG_SZ\s+ChromeHTML(?:\.[A-Za-z0-9]+)?\s*$/m.test(output));
      });
  });
}

export async function resolveExistingChromeProfile(env: NodeJS.ProcessEnv, protocol: 'http' | 'https'): Promise<ChromeProfile | null> {
  if (!root(env.LOCALAPPDATA) || !await chromeOwnsProtocol(env, protocol)) return null;
  try {
    const userData = canonicalizeExistingDir(join(env.LOCALAPPDATA!, 'Google', 'Chrome', 'User Data'));
    const statePath = assertRegularFileInside(userData, join(userData, 'Local State'));
    if (lstatSync(statePath).size > 8 * 1024 * 1024) return null;
    const directory = existingChromeProfile(JSON.parse(readFileSync(statePath, 'utf8')));
    if (!directory) return null;
    const selected = join(userData, directory);
    if (!lstatSync(selected).isDirectory() || lstatSync(selected).isSymbolicLink()
      || !isPathInside(userData, canonicalizeExistingDir(selected))) return null;
    const installations = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA]
      .filter((value): value is string => Boolean(root(value))).map((base) => join(base, 'Google', 'Chrome', 'Application'));
    for (const installation of installations) {
      try { return { executable: assertRegularFileInside(installation, join(installation, 'chrome.exe')), installation, userData, directory }; }
      catch { /* Try the next installed Chrome; never search PATH or a payload. */ }
    }
  } catch { /* Missing or invalid Chrome metadata retains Windows default delegation. */ }
  return null;
}

export async function openInExistingChromeProfile(profile: ChromeProfile, url: string): Promise<void> {
  const executable = assertRegularFileInside(profile.installation, profile.executable);
  const selected = join(profile.userData, profile.directory);
  if (!lstatSync(selected).isDirectory() || lstatSync(selected).isSymbolicLink()
    || !isPathInside(profile.userData, canonicalizeExistingDir(selected))) throw new Error('Browser profile is no longer available');
  await new Promise<void>((resolve, reject) => {
    // No --user-data-dir, temporary automation profile, shell, or remote-debugging access.
    const child = spawn(executable, [`--profile-directory=${profile.directory}`, url], { shell: false, windowsHide: true, stdio: 'ignore' });
    const timer = setTimeout(() => reject(new Error('Browser launch timed out')), 5000);
    child.once('error', () => { clearTimeout(timer); reject(new Error('Browser launch failed')); });
    child.once('spawn', () => { clearTimeout(timer); child.unref(); resolve(); });
  });
}
