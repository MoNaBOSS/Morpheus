/**
 * Shared workspace resolution for the filesystem capabilities.
 *
 * Eight capabilities operate inside the approved root. Each one re-implementing
 * containment would be eight chances to get it subtly wrong, and a reviewer
 * would have to verify the same argument eight times. They all go through here.
 *
 * The containment check is done on the REAL path, after symlink resolution,
 * because a symlink inside the workspace pointing outside it is precisely how a
 * path that looks contained stops being contained.
 */
import { lstatSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

import { MorpheusCapabilityError } from '../../capability-registry';
import { isPathInside, normalizeComparablePath } from '../../../../utils/morpheus-path-guard';
import type { MorpheusRootProvider } from '../../roots';

export type ResolvedWorkspacePath = {
  /** Absolute path inside the workspace. May not exist yet. */
  absolute: string;
  /** Canonical workspace root — the grant scope for every operation here. */
  workspaceRoot: string;
  /** True when something already exists at `absolute`. */
  exists: boolean;
};

/**
 * Resolves a caller-supplied relative path inside the approved workspace.
 *
 * `mustExist` distinguishes "read this" from "create this". For a path that
 * does not exist yet the check is applied to its PARENT, since that is the
 * directory the write actually lands in.
 */
export function resolveWorkspacePath(
  roots: MorpheusRootProvider,
  relativePath: string,
  options: { mustExist?: boolean } = {},
): ResolvedWorkspacePath {
  const workspaceRoot = roots.resolve('morpheusFiles');

  // Syntactic validation already happened at the transport boundary
  // (`validateParams`). This is the authoritative check, on real paths.
  if (/^[A-Za-z]:/.test(relativePath) || relativePath.startsWith('/') || relativePath.startsWith('\\')) {
    throw new MorpheusCapabilityError('invalid-params', 'Path must be relative to the workspace');
  }

  const absolute = resolve(workspaceRoot, relativePath);
  if (!isPathInside(workspaceRoot, absolute)) {
    throw new MorpheusCapabilityError('invalid-params', 'Path escapes the approved workspace');
  }

  // `lstat`, not `stat`: a symlink must be seen as a symlink, not silently
  // followed to whatever it points at.
  let link: ReturnType<typeof lstatSync> | null;
  try {
    link = lstatSync(absolute);
  } catch {
    link = null;
  }
  if (link?.isSymbolicLink()) {
    throw new MorpheusCapabilityError('invalid-params', 'Path is a symbolic link');
  }
  const exists = link !== null;

  // Re-check after canonicalisation. A directory component further up may be a
  // symlink, which `resolve` alone would not reveal.
  //
  // The path being created need not exist yet, and neither need its parent —
  // `folder.create reports/2026` legitimately creates both levels. So walk up
  // to the nearest ancestor that DOES exist and canonicalise that: it is the
  // deepest point where a symlink could already have been planted.
  let anchor = exists ? absolute : dirname(absolute);
  let canonicalAnchor: string | null = null;
  while (true) {
    try {
      canonicalAnchor = realpathSync.native(anchor);
      break;
    } catch {
      const parent = dirname(anchor);
      // Stop at the filesystem root rather than looping forever.
      if (parent === anchor) break;
      anchor = parent;
    }
  }
  if (!canonicalAnchor) {
    throw new MorpheusCapabilityError('invalid-params', 'Workspace is unavailable');
  }
  if (!isPathInside(workspaceRoot, canonicalAnchor)
    && normalizeComparablePath(canonicalAnchor) !== normalizeComparablePath(workspaceRoot)) {
    throw new MorpheusCapabilityError('invalid-params', 'Path escapes the approved workspace');
  }

  if (options.mustExist && !exists) {
    throw new MorpheusCapabilityError('invalid-params', 'No such file or folder in the workspace');
  }

  return { absolute, workspaceRoot, exists };
}

/** Byte size of an existing file, or 0. */
export function fileBytes(absolute: string): number {
  try {
    const info = statSync(absolute);
    return info.isFile() ? info.size : 0;
  } catch {
    return 0;
  }
}

/** Workspace-relative display form, for summaries and results. */
export function relativeTo(workspaceRoot: string, absolute: string): string {
  const prefix = workspaceRoot.endsWith(sep) ? workspaceRoot : workspaceRoot + sep;
  return absolute.startsWith(prefix) ? absolute.slice(prefix.length) : absolute;
}

export { join as joinWorkspace };
