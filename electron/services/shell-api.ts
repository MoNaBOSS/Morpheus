import { shell } from 'electron';
import { realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';

type ShellApiDependencies = {
  allowedPathRoots?: () => readonly string[] | Promise<readonly string[]>;
};

function expandShellPath(input: string): string {
  if (input === '~') return homedir();
  if (input.startsWith(`~${sep}`) || input.startsWith('~/') || input.startsWith('~\\')) {
    return join(homedir(), input.slice(2));
  }
  return input;
}

function requirePath(path: unknown): string {
  if (typeof path !== 'string' || !path.trim()) {
    throw new Error('path is required');
  }
  return path;
}

function requireUrl(url: unknown): string {
  if (typeof url !== 'string' || !url.trim()) {
    throw new Error('url is required');
  }
  return url;
}

export function requireSafeExternalUrl(input: unknown): string {
  const url = requireUrl(input);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid external URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`External URL protocol is not allowed: ${parsed.protocol}`);
  }
  return parsed.toString();
}

function isInside(child: string, parent: string): boolean {
  const childFromParent = relative(parent, child);
  return childFromParent === ''
    || (!isAbsolute(childFromParent)
      && childFromParent !== '..'
      && !childFromParent.startsWith(`..${sep}`));
}

async function canonicalDirectory(path: string): Promise<string | null> {
  try {
    const canonical = await realpath(path);
    return (await stat(canonical)).isDirectory() ? canonical : null;
  } catch {
    return null;
  }
}

export function createShellApi(
  dependencies: ShellApiDependencies = {},
): CompleteHostServiceRegistry['shell'] {
  const authorizePath = async (input: unknown): Promise<string> => {
    const requested = await realpath(resolve(expandShellPath(requirePath(input))));
    const configuredRoots = await dependencies.allowedPathRoots?.() ?? [];
    const rootInputs = [join(homedir(), '.openclaw'), ...configuredRoots];
    const roots = (await Promise.all(rootInputs.map((root) => canonicalDirectory(resolve(root)))))
      .filter((root): root is string => Boolean(root));
    if (!roots.some((root) => isInside(requested, root))) {
      throw new Error('Path is outside Main-approved roots');
    }
    return requested;
  };

  return {
    openExternal: async (payload) => {
      await shell.openExternal(requireSafeExternalUrl(payload.url));
    },
    showItemInFolder: async (payload) => {
      shell.showItemInFolder(await authorizePath(payload.path));
    },
    openPath: async (payload) => shell.openPath(await authorizePath(payload.path)),
  };
}
