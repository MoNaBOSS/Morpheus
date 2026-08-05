/**
 * Path containment and file-name validation for Morpheus native actions.
 *
 * Mirrors the comparison semantics used by `electron/utils/safe-fs.ts`, which
 * keeps its own helpers module-private. Kept separate deliberately: `safe-fs.ts`
 * backs plugin deletion, and widening its exported surface for an unrelated
 * feature is a needless change to a security-sensitive module.
 *
 * See `harness/specs/rules/morpheus-native-action-safety.md`.
 */
import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { MORPHEUS_TEXT_FILE_NAME_PATTERN } from '@shared/morpheus/actions/registry';

/**
 * Windows reserved device names. `CON`, `NUL`, `COM1` and friends resolve to
 * devices rather than files no matter which directory they appear in, with or
 * without an extension.
 */
const WINDOWS_RESERVED_DEVICE_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

export function normalizeComparablePath(input: string): string {
  if (process.platform === 'win32') {
    return input.replace(/\\/g, '/').toLowerCase();
  }
  return input;
}

export function isPathInside(root: string, candidate: string): boolean {
  const normalizedRoot = normalizeComparablePath(root);
  const normalizedCandidate = normalizeComparablePath(candidate);
  const rootWithSep = normalizedRoot.endsWith('/') ? normalizedRoot : `${normalizedRoot}/`;
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(rootWithSep);
}

export class MorpheusPathError extends Error {
  constructor(public readonly reason: string) {
    super(`morpheus path rejected: ${reason}`);
    this.name = 'MorpheusPathError';
  }
}

/**
 * Validates a text file name. The registry grammar already rejects parent
 * traversal, path separators and alternate-data-stream separators by
 * construction; this adds the Windows-specific rejections the grammar cannot
 * express.
 */
export function assertSafeTextFileName(fileName: unknown): string {
  if (typeof fileName !== 'string') throw new MorpheusPathError('not-a-string');
  if (!MORPHEUS_TEXT_FILE_NAME_PATTERN.test(fileName)) throw new MorpheusPathError('grammar');

  // Trailing dot or space: Windows silently strips these, so `a.txt.` and
  // `a.txt` would target the same file while presenting differently.
  if (/[. ]$/.test(fileName)) throw new MorpheusPathError('trailing-dot-or-space');

  const stem = fileName.slice(0, fileName.lastIndexOf('.'));
  if (WINDOWS_RESERVED_DEVICE_NAMES.has(stem.toLowerCase())) {
    throw new MorpheusPathError('reserved-device-name');
  }
  if (WINDOWS_RESERVED_DEVICE_NAMES.has(fileName.toLowerCase())) {
    throw new MorpheusPathError('reserved-device-name');
  }

  return fileName;
}

/**
 * Resolves a validated leaf name inside an already-canonical root and asserts
 * containment. The caller is responsible for having canonicalized `root`.
 */
export function resolveWithinRoot(root: string, leafName: string): string {
  if (!isAbsolute(root)) throw new MorpheusPathError('root-not-absolute');
  const resolved = resolve(join(root, leafName));
  if (!isPathInside(root, resolved)) throw new MorpheusPathError('escapes-root');
  return resolved;
}

/**
 * Canonicalizes a directory that is expected to already exist.
 * `realpathSync.native` is used for the reason documented in `safe-fs.ts`: the
 * JavaScript implementation mis-parses Windows namespaced paths.
 */
export function canonicalizeExistingDir(input: string): string {
  return realpathSync.native(input);
}

/**
 * Confirms a candidate executable is a real regular file inside `expectedDir`.
 *
 * Order matters. `lstat` first, so a symbolic link is rejected as a link rather
 * than silently followed; then `realpath`, so a target reached through some
 * other reparse mechanism still has to land inside the expected directory.
 */
export function assertRegularFileInside(expectedDir: string, candidate: string): string {
  if (!isAbsolute(candidate)) throw new MorpheusPathError('candidate-not-absolute');

  let stats;
  try {
    stats = lstatSync(candidate);
  } catch {
    throw new MorpheusPathError('not-found');
  }
  if (stats.isSymbolicLink()) throw new MorpheusPathError('symlink');
  if (!stats.isFile()) throw new MorpheusPathError('not-a-regular-file');

  let realCandidate: string;
  let realExpectedDir: string;
  try {
    realCandidate = realpathSync.native(candidate);
    realExpectedDir = realpathSync.native(expectedDir);
  } catch {
    throw new MorpheusPathError('realpath-failed');
  }
  if (!isPathInside(realExpectedDir, realCandidate)) throw new MorpheusPathError('escapes-expected-dir');

  return realCandidate;
}
