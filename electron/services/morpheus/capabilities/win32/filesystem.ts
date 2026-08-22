/**
 * Filesystem capabilities for the approved workspace.
 *
 * Every operation here is confined to the canonical Morpheus files root by
 * `resolveWorkspacePath`, and every one reports the workspace as its target's
 * `workspaceRoot` — which is what makes trust workspace-shaped rather than
 * file-by-file. Approving the workspace once covers work anywhere inside it.
 *
 * `file.delete` is the deliberate exception: irreversible, `critical`, and
 * absent from every capability group, so no workspace grant can ever cover it.
 */
import { constants as fsConstants } from 'node:fs';
import {
  appendFile, copyFile, mkdir, open, readFile, readdir, rename, rm, stat, unlink,
} from 'node:fs/promises';
import { dirname, relative, sep } from 'node:path';

import type { MorpheusActionResult } from '@shared/morpheus/action-types';
import type { MorpheusParamsFor } from '@shared/morpheus/actions/registry';
import { PARAM_LIMITS, validateParam } from '@shared/morpheus/capabilities/params';

import {
  MorpheusCapabilityError,
  type MorpheusCapability,
  type MorpheusCapabilityContext,
  type MorpheusResolution,
} from '../../capability-registry';
import { morpheusContentDigest } from '../../audit';
import { fileBytes, relativeTo, resolveWorkspacePath } from './workspace';

/** Directory entries a single listing or search may return. */
const MAX_ENTRIES = 500;

/** Depth a recursive search will descend. Bounded so a deep tree cannot hang. */
const MAX_SEARCH_DEPTH = 8;

export const win32ReadTextCapability: MorpheusCapability<'file.readText'> = {
  actionId: 'file.readText',
  platform: 'win32',

  async resolve(
    params: MorpheusParamsFor<'file.readText'>,
    context: MorpheusCapabilityContext,
  ): Promise<MorpheusResolution> {
    const { absolute, workspaceRoot } = resolveWorkspacePath(context.roots, params.path, { mustExist: true });

    return {
      target: { kind: 'file', path: absolute, bytes: fileBytes(absolute), workspaceRoot },
      execute: async (): Promise<MorpheusActionResult> => {
        const info = await stat(absolute);
        if (!info.isFile()) throw new MorpheusCapabilityError('invalid-params', 'Not a file');
        // Bounded before reading: a large file would otherwise be pulled into
        // memory in full just to be rejected afterwards.
        if (info.size > PARAM_LIMITS.textContentBytes) {
          throw new MorpheusCapabilityError('invalid-params', 'File is too large to read');
        }
        const content = await readFile(absolute, 'utf8');
        return {
          kind: 'text',
          path: absolute,
          bytes: info.size,
          contentSha256: morpheusContentDigest(content),
          text: content,
        };
      },
    };
  },
};

export const win32ListCapability: MorpheusCapability<'file.list'> = {
  actionId: 'file.list',
  platform: 'win32',

  async resolve(
    params: MorpheusParamsFor<'file.list'>,
    context: MorpheusCapabilityContext,
  ): Promise<MorpheusResolution> {
    // No path means the workspace root itself.
    const resolved = params.path
      ? resolveWorkspacePath(context.roots, params.path, { mustExist: true })
      : { absolute: context.roots.resolve('morpheusFiles'), workspaceRoot: context.roots.resolve('morpheusFiles'), exists: true };

    return {
      target: { kind: 'folder', path: resolved.absolute, workspaceRoot: resolved.workspaceRoot },
      execute: async (): Promise<MorpheusActionResult> => {
        const info = await stat(resolved.absolute);
        if (!info.isDirectory()) throw new MorpheusCapabilityError('invalid-params', 'Not a folder');

        const dirEntries = await readdir(resolved.absolute, { withFileTypes: true });
        const entries = dirEntries.slice(0, MAX_ENTRIES).map((entry) => ({
          name: entry.name,
          kind: entry.isDirectory() ? ('folder' as const) : ('file' as const),
        }));
        return {
          kind: 'listing',
          path: resolved.absolute,
          entries,
          truncated: dirEntries.length > MAX_ENTRIES,
        };
      },
    };
  },
};

export const win32SearchCapability: MorpheusCapability<'file.search'> = {
  actionId: 'file.search',
  platform: 'win32',

  async resolve(
    params: MorpheusParamsFor<'file.search'>,
    context: MorpheusCapabilityContext,
  ): Promise<MorpheusResolution> {
    const workspaceRoot = context.roots.resolve('morpheusFiles');
    const needle = params.query.toLowerCase();
    const limit = Math.min(params.limit ?? 50, MAX_ENTRIES);

    return {
      target: { kind: 'folder', path: workspaceRoot, workspaceRoot },
      execute: async (): Promise<MorpheusActionResult> => {
        const matches: Array<{ name: string; kind: 'file' | 'folder' }> = [];

        // Matches on NAME only. Searching file contents is a materially wider
        // disclosure than listing a directory and belongs to its own capability
        // with its own consent, not smuggled in behind a name search.
        const walk = async (directory: string, depth: number): Promise<void> => {
          if (depth > MAX_SEARCH_DEPTH || matches.length >= limit) return;
          let entries;
          try {
            entries = await readdir(directory, { withFileTypes: true });
          } catch {
            return;
          }
          for (const entry of entries) {
            if (matches.length >= limit) return;
            // Symlinks are not followed: a link could otherwise walk the search
            // straight out of the workspace.
            if (entry.isSymbolicLink()) continue;
            const full = `${directory}${sep}${entry.name}`;
            if (entry.name.toLowerCase().includes(needle)) {
              matches.push({
                name: relative(workspaceRoot, full),
                kind: entry.isDirectory() ? 'folder' : 'file',
              });
            }
            if (entry.isDirectory()) await walk(full, depth + 1);
          }
        };

        await walk(workspaceRoot, 0);
        return {
          kind: 'listing',
          path: workspaceRoot,
          entries: matches,
          truncated: matches.length >= limit,
        };
      },
    };
  },
};

export const win32AppendTextCapability: MorpheusCapability<'file.appendText'> = {
  actionId: 'file.appendText',
  platform: 'win32',

  async resolve(
    params: MorpheusParamsFor<'file.appendText'>,
    context: MorpheusCapabilityContext,
  ): Promise<MorpheusResolution> {
    const { absolute, workspaceRoot } = resolveWorkspacePath(context.roots, params.path, { mustExist: true });
    const content = params.content;

    return {
      target: { kind: 'file', path: absolute, bytes: fileBytes(absolute), workspaceRoot },
      execute: async (): Promise<MorpheusActionResult> => {
        const info = await stat(absolute);
        if (!info.isFile()) throw new MorpheusCapabilityError('invalid-params', 'Not a file');
        // Appending is additive, so it stays `medium`. Overwriting existing
        // content would be destructive and is a different, `critical` question.
        await appendFile(absolute, content, 'utf8');
        const after = await stat(absolute);
        return {
          kind: 'file',
          path: absolute,
          bytes: after.size,
          contentSha256: morpheusContentDigest(content),
        };
      },
    };
  },
};

/**
 * Creates one new bounded text artifact at a workspace-relative path.
 *
 * This is the reusable project-building counterpart to the legacy
 * `file.createText` leaf-name action. The provider may choose only a relative
 * logical path with a non-executable extension; Main chooses and revalidates
 * the canonical workspace root. Existing files are never overwritten.
 */
export const win32CreateFileCapability: MorpheusCapability<'file.create'> = {
  actionId: 'file.create',
  platform: 'win32',

  async resolve(
    params: MorpheusParamsFor<'file.create'>,
    context: MorpheusCapabilityContext,
  ): Promise<MorpheusResolution> {
    const pathValidation = validateParam('writableRelativePath', params.path);
    const contentValidation = validateParam('textContent', params.content);
    if (!pathValidation.ok) {
      throw new MorpheusCapabilityError('invalid-params', `Path rejected: ${pathValidation.reason}`);
    }
    if (!contentValidation.ok) {
      throw new MorpheusCapabilityError('invalid-params', `Content rejected: ${contentValidation.reason}`);
    }

    const initial = resolveWorkspacePath(context.roots, params.path);
    if (initial.exists) throw new MorpheusCapabilityError('invalid-params', 'Destination already exists');
    const content = params.content;
    const bytes = Buffer.byteLength(content, 'utf8');

    return {
      target: { kind: 'file', path: initial.absolute, bytes, workspaceRoot: initial.workspaceRoot },
      execute: async (): Promise<MorpheusActionResult> => {
        await mkdir(dirname(initial.absolute), { recursive: true });

        // The parent tree may have changed while a plan was awaiting consent.
        // Re-resolve after creating it and before opening the leaf, so a newly
        // introduced symlink never inherits an earlier safe resolution.
        const current = resolveWorkspacePath(context.roots, params.path);
        if (current.absolute !== initial.absolute || current.workspaceRoot !== initial.workspaceRoot) {
          throw new MorpheusCapabilityError('execution-failed', 'Workspace target changed before creation');
        }
        if (current.exists) throw new MorpheusCapabilityError('execution-failed', 'Destination already exists');

        let handle: Awaited<ReturnType<typeof open>> | undefined;
        try {
          handle = await open(current.absolute, 'wx');
          await handle.writeFile(content, 'utf8');
          await handle.sync();
        } catch (error) {
          const code = (error as NodeJS.ErrnoException)?.code;
          await handle?.close().catch(() => undefined);
          if (handle) await unlink(current.absolute).catch(() => undefined);
          if (code === 'EEXIST') {
            throw new MorpheusCapabilityError('execution-failed', 'Destination already exists');
          }
          throw new MorpheusCapabilityError('execution-failed', 'The workspace file could not be created');
        }
        // Durability was established by fsync. A close failure after that must
        // not turn a successfully-created artifact into a false failed run.
        await handle.close().catch(() => undefined);

        return {
          kind: 'file',
          path: current.absolute,
          bytes,
          contentSha256: morpheusContentDigest(content),
        };
      },
    };
  },
};

export const win32MoveCapability: MorpheusCapability<'file.move'> = {
  actionId: 'file.move',
  platform: 'win32',

  async resolve(
    params: MorpheusParamsFor<'file.move'>,
    context: MorpheusCapabilityContext,
  ): Promise<MorpheusResolution> {
    const source = resolveWorkspacePath(context.roots, params.path, { mustExist: true });
    const destination = resolveWorkspacePath(context.roots, params.destination);

    // A move onto an existing path would destroy it. That is a destructive
    // operation, and this capability is not the one that may perform it.
    if (destination.exists) {
      throw new MorpheusCapabilityError('invalid-params', 'Destination already exists');
    }

    return {
      target: { kind: 'file', path: destination.absolute, bytes: fileBytes(source.absolute), workspaceRoot: source.workspaceRoot },
      execute: async (): Promise<MorpheusActionResult> => {
        await mkdir(dirname(destination.absolute), { recursive: true });
        await rename(source.absolute, destination.absolute);
        return {
          kind: 'file',
          path: destination.absolute,
          bytes: fileBytes(destination.absolute),
          contentSha256: '',
        };
      },
    };
  },
};

export const win32CopyCapability: MorpheusCapability<'file.copy'> = {
  actionId: 'file.copy',
  platform: 'win32',

  async resolve(
    params: MorpheusParamsFor<'file.copy'>,
    context: MorpheusCapabilityContext,
  ): Promise<MorpheusResolution> {
    const source = resolveWorkspacePath(context.roots, params.path, { mustExist: true });
    const destination = resolveWorkspacePath(context.roots, params.destination);

    if (destination.exists) {
      throw new MorpheusCapabilityError('invalid-params', 'Destination already exists');
    }

    return {
      target: { kind: 'file', path: destination.absolute, bytes: fileBytes(source.absolute), workspaceRoot: source.workspaceRoot },
      execute: async (): Promise<MorpheusActionResult> => {
        await mkdir(dirname(destination.absolute), { recursive: true });
        // COPYFILE_EXCL makes the no-overwrite guarantee atomic. Re-checking
        // existence above and then copying would leave a window in which the
        // destination could appear between the two.
        await copyFile(source.absolute, destination.absolute, fsConstants.COPYFILE_EXCL);
        return {
          kind: 'file',
          path: destination.absolute,
          bytes: fileBytes(destination.absolute),
          contentSha256: '',
        };
      },
    };
  },
};

export const win32CreateFolderCapability: MorpheusCapability<'folder.create'> = {
  actionId: 'folder.create',
  platform: 'win32',

  async resolve(
    params: MorpheusParamsFor<'folder.create'>,
    context: MorpheusCapabilityContext,
  ): Promise<MorpheusResolution> {
    const { absolute, workspaceRoot, exists } = resolveWorkspacePath(context.roots, params.path);
    if (exists) throw new MorpheusCapabilityError('invalid-params', 'Folder already exists');

    return {
      target: { kind: 'folder', path: absolute, workspaceRoot },
      execute: async (): Promise<MorpheusActionResult> => {
        await mkdir(absolute, { recursive: true });
        return { kind: 'listing', path: absolute, entries: [], truncated: false };
      },
    };
  },
};

/**
 * Deleting is irreversible, so it is `critical` and belongs to NO capability
 * group. No workspace grant covers it and no profile waives it — it confirms
 * every time, by design.
 */
export const win32DeleteCapability: MorpheusCapability<'file.delete'> = {
  actionId: 'file.delete',
  platform: 'win32',

  async resolve(
    params: MorpheusParamsFor<'file.delete'>,
    context: MorpheusCapabilityContext,
  ): Promise<MorpheusResolution> {
    const { absolute, workspaceRoot } = resolveWorkspacePath(context.roots, params.path, { mustExist: true });

    // Deleting the workspace itself is not a file operation; it would remove
    // the very root every grant is scoped to.
    if (absolute === workspaceRoot) {
      throw new MorpheusCapabilityError('invalid-params', 'The workspace root cannot be deleted');
    }

    const info = await stat(absolute);
    const isDirectory = info.isDirectory();

    return {
      target: isDirectory
        ? { kind: 'folder', path: absolute, workspaceRoot }
        : { kind: 'file', path: absolute, bytes: info.size, workspaceRoot },
      execute: async (): Promise<MorpheusActionResult> => {
        // Recursive only for directories the user was shown as a directory.
        await rm(absolute, { recursive: isDirectory, force: false });
        return {
          kind: 'deletion',
          path: absolute,
          wasFolder: isDirectory,
          relativePath: relativeTo(workspaceRoot, absolute),
        };
      },
    };
  },
};

export const win32FilesystemCapabilities = [
  win32ReadTextCapability,
  win32ListCapability,
  win32SearchCapability,
  win32CreateFileCapability,
  win32AppendTextCapability,
  win32MoveCapability,
  win32CopyCapability,
  win32CreateFolderCapability,
  win32DeleteCapability,
] as const;
