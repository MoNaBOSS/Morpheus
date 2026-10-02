import { constants, promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { MorpheusRootProvider } from '../morpheus/roots';
import { resolveWorkspacePath } from '../morpheus/capabilities/win32/workspace';
import { buildInteractiveSite, type MorpheusInteractiveBuild } from './template';

const FILENAMES = ['README.md', 'app.js', 'index.html', 'morpheus.build.json', 'morpheus.site.json', 'styles.css'];
const MAX_FILE_BYTES = 128 * 1024;
const INCOMPLETE_MARKER = '.morpheus-incomplete';

function projectPath(roots: MorpheusRootProvider, path: string, mustExist = false) {
  // Windows device names, alternate streams and ambiguous trailing characters
  // must not become files even when this code is tested on another platform.
  if (typeof path !== 'string' || path.length > 200 || path.split(/[\\/]/).some((part) => !part || part === '.' || part === '..'
    || /[<>:"|?*]/.test(part) || [...part].some((char) => char.charCodeAt(0) < 32) || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) {
    throw new Error('Choose a simple relative project folder inside the approved workspace.');
  }
  return resolveWorkspacePath(roots, path, { mustExist });
}

/** Fixed, small in-process compiler; never executes project code or package hooks.
 * Exclusive creation preserves existing projects. An interrupted write leaves an
 * explicit marker and its files; retries cannot quietly overwrite either. */
export async function createInteractiveProject(roots: MorpheusRootProvider, path: string, value: unknown, signal?: AbortSignal) {
  const build = buildInteractiveSite(value);
  const target = projectPath(roots, path);
  signal?.throwIfAborted();
  if (target.exists) throw new Error('Project folder already exists. Choose a new folder; existing files were preserved.');
  // Parent must already exist within the approved root. No broad recursive mkdir.
  await fs.mkdir(target.absolute);
  const marker = join(target.absolute, INCOMPLETE_MARKER);
  try {
    await fs.writeFile(marker, 'Creation interrupted unless the final manifest is complete. Files are preserved.\n', { flag: 'wx' });
    for (const [name, content] of Object.entries(build.files)) {
      signal?.throwIfAborted();
      const current = projectPath(roots, path, true);
      if (current.absolute !== target.absolute) throw new Error('Workspace changed during creation.');
      const file = await fs.open(join(target.absolute, name), 'wx');
      try { await file.writeFile(content, 'utf8'); await file.sync(); } finally { await file.close(); }
    }
    signal?.throwIfAborted();
    // Completion is committed only after the written bytes pass verification.
    // Cancellation or a changed file during that check leaves the marker intact.
    await verifyInteractiveProjectSnapshot(roots, path, build.revision, true);
    signal?.throwIfAborted();
    await fs.unlink(marker);
    return { path: target.absolute, relativePath: path, revision: build.revision, fileCount: FILENAMES.length, totalBytes: build.totalBytes };
  } catch (error) {
    throw new Error('Interactive project creation did not complete. Its files were preserved; choose a new folder or inspect the incomplete project.', { cause: error });
  }
}

/** Return verified immutable bytes, not file URLs. Preview never rereads the disk
 * after this check, so later edits cannot change the running approved snapshot. */
export async function verifyInteractiveProject(roots: MorpheusRootProvider, path: string, expectedRevision?: string): Promise<MorpheusInteractiveBuild> {
  return verifyInteractiveProjectSnapshot(roots, path, expectedRevision);
}

async function verifyInteractiveProjectSnapshot(roots: MorpheusRootProvider, path: string, expectedRevision?: string, completing = false): Promise<MorpheusInteractiveBuild> {
  const target = projectPath(roots, path, true);
  if (!(await fs.lstat(target.absolute)).isDirectory()) throw new Error('Interactive project must be a folder.');
  const expectedNames = completing ? [...FILENAMES, INCOMPLETE_MARKER].sort() : FILENAMES;
  const names = (await fs.readdir(target.absolute)).sort();
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) throw new Error('Interactive project is incomplete or contains unreviewed files. Existing files were preserved.');
  const files: Record<string, string> = {};
  for (const name of FILENAMES) {
    const filePath = join(target.absolute, name);
    const before = await fs.lstat(filePath);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > MAX_FILE_BYTES) throw new Error('Interactive project contains an unsupported file.');
    const file = await fs.open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const opened = await file.stat();
      if (!opened.isFile() || opened.ino !== before.ino || opened.dev !== before.dev || opened.size > MAX_FILE_BYTES) throw new Error('Interactive project changed while being verified.');
      // Bounded read even if an external writer grows the file after stat.
      const data = Buffer.alloc(MAX_FILE_BYTES + 1);
      let offset = 0;
      while (offset < data.length) {
        const { bytesRead } = await file.read(data, offset, data.length - offset, offset);
        if (!bytesRead) break;
        offset += bytesRead;
      }
      if (offset > MAX_FILE_BYTES) throw new Error('Interactive project file exceeded its size limit.');
      const bytes = data.subarray(0, offset);
      files[name] = bytes.toString('utf8');
      if (!Buffer.from(files[name], 'utf8').equals(bytes)) throw new Error('Interactive project is not valid UTF-8.');
    } finally { await file.close(); }
  }
  const build = buildInteractiveSite(JSON.parse(files['morpheus.site.json']));
  if (expectedRevision && build.revision !== expectedRevision) throw new Error('Interactive project revision changed. Inspect it again before previewing.');
  if (FILENAMES.some((name) => files[name] !== build.files[name])) throw new Error('Interactive project differs from its pinned build. Existing edits were preserved.');
  // Recheck root and inventory after reads. Bytes below are already isolated.
  projectPath(roots, path, true);
  if (JSON.stringify((await fs.readdir(target.absolute)).sort()) !== JSON.stringify(expectedNames)) throw new Error('Interactive project changed while being verified.');
  return build;
}
