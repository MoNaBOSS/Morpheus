import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { validateParam } from '@shared/morpheus/capabilities/params';
import type { MorpheusSiteRevisionPatch, MorpheusSiteRevisionReceipt } from '@shared/morpheus/site-types';
import type { MorpheusRootProvider } from '../roots';
import { resolveWorkspacePath } from '../capabilities/win32/workspace';
import { writeJsonAtomically } from '../storage/atomic-json';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 128;
type SiteFile = { path: string; digest: string; bytes: Buffer };
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
type RevisionJournal = {
  v: 1; revisionId: string; path: string; workspaceRoot: string;
  previousRevision: string; revision: string;
  status: 'prepared' | 'applying' | 'committed' | 'rolled-back' | 'needs-review';
  files: { path: string; after: string; before: string | null }[];
  applied?: string[];
};
const validId = (value: string) => /^revision-[a-f0-9-]{36}$/.test(value);

async function currentBytes(roots: MorpheusRootProvider, path: string): Promise<Buffer | null> {
  const target = resolveWorkspacePath(roots, path);
  try {
    const info = await lstat(target.absolute);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) throw new Error('Website file changed type or size');
    return await readFile(target.absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function replaceBytes(roots: MorpheusRootProvider, path: string, bytes: Buffer | null) {
  const target = resolveWorkspacePath(roots, path);
  if (bytes === null) { await rm(target.absolute, { force: true }); return; }
  await mkdir(dirname(target.absolute), { recursive: true });
  const temporary = `${target.absolute}.revision-${randomUUID()}.tmp`;
  await writeFile(temporary, bytes, { flag: 'wx' });
  try { await rename(temporary, target.absolute); }
  finally { await rm(temporary, { force: true }); }
}

export async function inspectMorpheusSiteRevision(roots: MorpheusRootProvider, path: string) {
  if (!validateParam('relativePath', path).ok) throw new Error('Invalid website path');
  const project = resolveWorkspacePath(roots, path, { mustExist: true });
  const files: SiteFile[] = [];
  let total = 0;
  const visit = async (directory: string, depth: number): Promise<void> => {
    if (depth > 8) throw new Error('Website revision is nested too deeply');
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const candidate = join(directory, entry.name);
      const workspacePath = relative(project.workspaceRoot, candidate).split(sep).join('/');
      const target = resolveWorkspacePath(roots, workspacePath, { mustExist: true });
      const info = await lstat(target.absolute);
      if (info.isSymbolicLink()) throw new Error('Website revision contains a symbolic link');
      if (info.isDirectory()) { await visit(target.absolute, depth + 1); continue; }
      if (!info.isFile() || info.size > MAX_BYTES || total + info.size > MAX_BYTES || files.length >= MAX_FILES) throw new Error('Website exceeds revision limits');
      const bytes = await readFile(target.absolute);
      if (bytes.length !== info.size) throw new Error('Website changed during inspection');
      total += bytes.length;
      files.push({ path: relative(project.absolute, target.absolute).split(sep).join('/'), digest: digest(bytes), bytes });
    }
  };
  await visit(project.absolute, 0);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { ...project, files, revision: digest(JSON.stringify(files.map((file) => [file.path, file.digest]))), totalBytes: total };
}

export function parseMorpheusSiteRevisionPatch(value: unknown): MorpheusSiteRevisionPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid website patch');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => !['path', 'expectedRevision', 'files'].includes(key))
    || typeof data.path !== 'string' || !validateParam('relativePath', data.path).ok
    || typeof data.expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(data.expectedRevision)
    || !Array.isArray(data.files) || data.files.length < 1 || data.files.length > 16) throw new Error('Invalid website revision precondition');
  const files = data.files.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid website patch file');
    const file = value as Record<string, unknown>;
    if (Object.keys(file).some((key) => !['path', 'content'].includes(key))
      || typeof file.path !== 'string' || !validateParam('writableRelativePath', file.path).ok
      || !/\.(?:html|css|json|txt|md)$/i.test(file.path)
      || typeof file.content !== 'string' || !validateParam('textContent', file.content).ok) throw new Error('Invalid website patch content');
    return { path: file.path.replace(/\\/g, '/'), content: file.content };
  });
  if (new Set(files.map((file) => file.path.toLowerCase())).size !== files.length) throw new Error('Duplicate website patch path');
  return { path: data.path, expectedRevision: data.expectedRevision, files };
}

/** Main-owned service; caller supplies an already-granted workspace and verifier.
 * Generated content is copied/inspected only, never loaded as build configuration. */
export function createMorpheusSiteRevisionService(options: {
  userDataDir: string;
  verify: (roots: MorpheusRootProvider, path: string) => Promise<void>;
  beforeMutation?: () => Promise<void>;
}) {
  const journalRoot = resolve(options.userDataDir, 'morpheus', 'site-revisions');
  async function loadJournal(id: string): Promise<RevisionJournal> {
    if (!validId(id)) throw new Error('Invalid website revision identifier');
    const owned = join(journalRoot, id);
    if (!(await lstat(owned)).isDirectory() || (await lstat(owned)).isSymbolicLink()) throw new Error('Invalid revision storage');
    const path = join(owned, 'journal.json');
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 4 * MAX_BYTES) throw new Error('Invalid revision journal');
    const journal = JSON.parse(await readFile(path, 'utf8')) as RevisionJournal;
    if (journal.v !== 1 || journal.revisionId !== id || !validateParam('relativePath', journal.path).ok
      || typeof journal.workspaceRoot !== 'string' || !/^[a-f0-9]{64}$/.test(journal.previousRevision)
      || !/^[a-f0-9]{64}$/.test(journal.revision)
      || !['prepared', 'applying', 'committed', 'rolled-back', 'needs-review'].includes(journal.status)
      || !Array.isArray(journal.files) || journal.files.length < 1 || journal.files.length > 16
      || journal.files.some((file) => !file || !validateParam('writableRelativePath', file.path).ok
        || !/^[a-f0-9]{64}$/.test(file.after) || (file.before !== null
          && (typeof file.before !== 'string' || Buffer.from(file.before, 'base64').toString('base64') !== file.before)))
      || new Set(journal.files.map((file) => file.path.toLowerCase())).size !== journal.files.length
      || (journal.applied !== undefined && (!Array.isArray(journal.applied)
        || journal.applied.some((path) => !journal.files.some((file) => file.path === path))))) throw new Error('Invalid revision journal');
    return journal;
  }
  const save = (journal: RevisionJournal) => writeJsonAtomically(join(journalRoot, journal.revisionId, 'journal.json'), journal);
  async function restore(roots: MorpheusRootProvider, journal: RevisionJournal, onlyApplied: boolean) {
    const target = resolveWorkspacePath(roots, journal.path, { mustExist: true });
    if (target.workspaceRoot !== journal.workspaceRoot) throw new Error('Revision belongs to another workspace');
    let conflict = false;
    const files = onlyApplied ? journal.files.filter((file) => journal.applied?.includes(file.path)) : journal.files;
    for (const file of [...files].reverse()) {
      try {
        const path = `${journal.path}/${file.path}`;
        const bytes = await currentBytes(roots, path);
        const previous = file.before === null ? null : Buffer.from(file.before, 'base64');
        // A crash can precede the atomic rename. An unchanged file needs no replay.
        if (bytes === null ? previous === null : previous !== null && digest(bytes) === digest(previous)) continue;
        if (bytes === null || digest(bytes) !== file.after) { conflict = true; continue; }
        await replaceBytes(roots, path, previous);
      } catch { conflict = true; }
    }
    journal.status = conflict ? 'needs-review' : 'rolled-back';
    save(journal);
    return !conflict;
  }
  async function reconcile(roots: MorpheusRootProvider, path: string) {
    const target = resolveWorkspacePath(roots, path, { mustExist: true });
    await mkdir(journalRoot, { recursive: true });
    const entries = await readdir(journalRoot);
    if (entries.length > 100) throw new Error('Website revision history exceeds limits');
    for (const id of entries) {
      if (!validId(id)) continue;
      let journal: RevisionJournal;
      try { journal = await loadJournal(id); } catch { throw new Error('Website revision journal requires review'); }
      if (journal.workspaceRoot !== target.workspaceRoot || journal.path !== path) continue;
      if (journal.status === 'prepared') { journal.status = 'rolled-back'; save(journal); }
      if (journal.status === 'applying') await restore(roots, journal, true);
      if (journal.status === 'needs-review') throw new Error('Interrupted website revision conflicts with manual edits; review required');
    }
  }
  return {
    reconcile,
    async rollback(roots: MorpheusRootProvider, revisionId: string, expectedRevision: string, expectedPath?: string): Promise<MorpheusSiteRevisionReceipt> {
      const journal = await loadJournal(revisionId);
      if (expectedPath !== undefined && journal.path !== expectedPath) throw new Error('Revision belongs to another website');
      if (journal.status !== 'committed') throw new Error('Only a committed website revision can be rolled back');
      const current = await inspectMorpheusSiteRevision(roots, journal.path);
      if (current.workspaceRoot !== journal.workspaceRoot || current.revision !== expectedRevision || current.revision !== journal.revision) throw new Error('Manual edits conflict with website rollback');
      // Mark intent before mutation so restart applies the same digest guards.
      journal.status = 'applying'; journal.applied = journal.files.map((file) => file.path); save(journal);
      if (!await restore(roots, journal, false)) throw new Error('Website rollback requires manual review');
      await options.verify(roots, journal.path);
      const observed = await inspectMorpheusSiteRevision(roots, journal.path);
      if (observed.revision !== journal.previousRevision) throw new Error('Website rollback differs from its original snapshot');
      return { revisionId, previousRevision: journal.revision, revision: observed.revision, fileCount: observed.files.length };
    },
    async apply(roots: MorpheusRootProvider, rawPatch: unknown, signal?: AbortSignal): Promise<MorpheusSiteRevisionReceipt> {
      const patch = parseMorpheusSiteRevisionPatch(rawPatch);
      signal?.throwIfAborted();
      await reconcile(roots, patch.path);
      const before = await inspectMorpheusSiteRevision(roots, patch.path);
      if (before.revision !== patch.expectedRevision) throw new Error('Website changed since verification; inspect the current files before revising');
      await mkdir(journalRoot, { recursive: true });
      if ((await readdir(journalRoot)).length >= 100) throw new Error('Website revision history is full; archive revisions before continuing');
      const revisionId = `revision-${randomUUID()}`;
      const owned = join(journalRoot, revisionId);
      const stage = join(owned, 'stage');
      const stagedProject = join(stage, 'site');
      await mkdir(stagedProject, { recursive: true });
      // Windows paths are case-insensitive; retain the existing canonical spelling.
      patch.files = patch.files.map((file) => ({ ...file, path: before.files.find((old) => old.path.toLowerCase() === file.path.toLowerCase())?.path ?? file.path }));
      const stagedRoots: MorpheusRootProvider = { resolve: () => stage, forWorkspace: () => stagedRoots };
      let after: Awaited<ReturnType<typeof inspectMorpheusSiteRevision>>;
      try {
        const merged = new Map(before.files.map((file) => [file.path, file.bytes]));
        for (const file of patch.files) merged.set(file.path, Buffer.from(file.content));
        if (merged.size > MAX_FILES || [...merged.values()].reduce((sum, bytes) => sum + bytes.length, 0) > MAX_BYTES) throw new Error('Revised website exceeds limits');
        for (const [path, bytes] of merged) {
          const candidate = join(stagedProject, path);
          await mkdir(dirname(candidate), { recursive: true });
          await writeFile(candidate, bytes, { flag: 'wx' });
        }
        await options.verify(stagedRoots, 'site');
        signal?.throwIfAborted();
        after = await inspectMorpheusSiteRevision(stagedRoots, 'site');
      } catch (error) {
        // No mutation intent exists yet. Remove only this generated private folder.
        if (!relative(journalRoot, owned).startsWith('..') && owned !== journalRoot) await rm(owned, { recursive: true, force: true });
        throw error;
      }
      const journal: RevisionJournal = { v: 1, revisionId, path: patch.path, workspaceRoot: before.workspaceRoot,
        previousRevision: before.revision, revision: after.revision, status: 'prepared',
        files: patch.files.map((file) => ({ path: file.path, after: digest(file.content),
          before: before.files.find((old) => old.path === file.path)?.bytes.toString('base64') ?? null })) };
      const journalPath = join(owned, 'journal.json');
      writeJsonAtomically(journalPath, journal);
      await options.beforeMutation?.();
      const current = await inspectMorpheusSiteRevision(roots, patch.path);
      if (current.revision !== before.revision) throw new Error('Manual edits conflict with this website revision');
      signal?.throwIfAborted();
      const applied: typeof journal.files = [];
      try {
        for (const file of patch.files) {
          signal?.throwIfAborted();
          const target = resolveWorkspacePath(roots, `${patch.path}/${file.path}`);
          const saved = journal.files.find((entry) => entry.path === file.path)!;
          const bytes = await currentBytes(roots, `${patch.path}/${file.path}`);
          const original = saved.before === null ? null : Buffer.from(saved.before, 'base64');
          if (bytes === null ? original !== null : original === null || digest(bytes) !== digest(original)) throw new Error('Manual edits conflict with this website revision');
          await mkdir(dirname(target.absolute), { recursive: true });
          const temporary = `${target.absolute}.${revisionId}.tmp`;
          await writeFile(temporary, file.content, { flag: 'wx' });
          // Record intent before replacement; restart must reconcile the digest.
          applied.push(saved);
          writeJsonAtomically(journalPath, { ...journal, status: 'applying', applied: applied.map((entry) => entry.path) });
          await rename(temporary, target.absolute);
        }
        await options.verify(roots, patch.path);
        const observed = await inspectMorpheusSiteRevision(roots, patch.path);
        if (observed.revision !== after.revision) throw new Error('Website changed during revision');
        writeJsonAtomically(journalPath, { ...journal, status: 'committed' });
        // Only discard this service's validated private staging directory.
        if (relative(journalRoot, stage).startsWith('..') || stage === journalRoot) throw new Error('Invalid staging cleanup target');
        // A private cleanup failure cannot turn an observed committed edit into rollback.
        await rm(stage, { recursive: true, force: true }).catch(() => undefined);
        return { revisionId, previousRevision: before.revision, revision: observed.revision, fileCount: observed.files.length };
      } catch (error) {
        journal.applied = applied.map((file) => file.path);
        await restore(roots, journal, true);
        throw error;
      }
    },
  };
}
