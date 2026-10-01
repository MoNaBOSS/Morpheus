import type { MorpheusPublicationTarget } from '@shared/morpheus/publication-types';
import type { GitHubRequest } from './github-transport';
import { validatePublicationSnapshot, type PublicationSnapshot } from './snapshot';

type GitTree = { sha: string; entries: { path: string; type: string; mode: string; sha: string }[] };
export type PreparedPagesTarget = { target: MorpheusPublicationTarget; expectedHead: string; rootTree: string; currentFiles: Record<string, string> };
const sha = (value: unknown): string => {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) throw new Error('GitHub returned an invalid object identity.');
  return value;
};
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('GitHub returned an invalid result.');
  return value as Record<string, unknown>;
};
const positiveId = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error('GitHub returned an invalid account/repository identity.');
  return value as number;
};
const sameFiles = (left: Record<string, string>, right: Record<string, string>) => JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort());

/** Git operations are Main-only. Caller MUST persist exact human approval and
 * write-ahead receipts before invoking createCommit/advance. This adapter does
 * not invent approval, use ambient CLI credentials or perform automatic retries. */
export function createGitHubPagesAdapter(request: GitHubRequest, input: { owner: string; repository: string; slug: string }) {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(input.owner)
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(input.repository) || input.repository.includes('..')
    || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(input.slug)) throw new Error('Choose a valid GitHub repository and simple site name.');
  const base = `/repos/${input.owner}/${input.repository}`;
  const sitePath = `sites/${input.slug}`;
  const createdCommits = new Map<string, string>();
  const readTree = async (tree: string): Promise<GitTree> => {
    const result = record(await request('GET', `${base}/git/trees/${sha(tree)}`));
    if (result.sha !== tree || result.truncated || !Array.isArray(result.tree) || result.tree.length > 1000) throw new Error('GitHub directory cannot be inspected within its limit.');
    const entries = result.tree.map((value) => {
      const entry = record(value);
      if (typeof entry.path !== 'string' || entry.path.includes('/') || typeof entry.type !== 'string' || typeof entry.mode !== 'string') throw new Error('GitHub returned an invalid directory entry.');
      return { path: entry.path, type: entry.type, mode: entry.mode, sha: sha(entry.sha) };
    });
    if (new Set(entries.map((entry) => entry.path)).size !== entries.length) throw new Error('GitHub directory has duplicate entries.');
    return { sha: sha(result.sha), entries };
  };
  const head = async (): Promise<string> => {
    const ref = record(await request('GET', `${base}/git/ref/heads/gh-pages`));
    const object = record(ref.object);
    if (ref.ref !== 'refs/heads/gh-pages' || object.type !== 'commit') throw new Error('GitHub Pages branch could not be verified.');
    return sha(object.sha);
  };
  const inspect = async (): Promise<PreparedPagesTarget> => {
    const account = record(await request('GET', '/user'));
    const repo = record(await request('GET', base));
    const pages = record(await request('GET', `${base}/pages`));
    const source = record(pages.source);
    if (typeof account.login !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(account.login)
      || typeof repo.full_name !== 'string' || repo.full_name.toLowerCase() !== `${input.owner}/${input.repository}`.toLowerCase() || repo.private !== false || record(repo.permissions).push !== true
      || repo.default_branch === 'gh-pages' || source.branch !== 'gh-pages' || source.path !== '/' || pages.cname
      || (pages.build_type !== undefined && pages.build_type !== 'legacy') || pages.public !== true) {
      throw new Error('Use an existing public repository with a separate gh-pages root source, no custom domain, and write access.');
    }
    if (typeof pages.html_url !== 'string') throw new Error('GitHub Pages URL is unavailable.');
    const url = new URL(pages.html_url);
    const expectedPath = input.repository.toLowerCase() === `${input.owner.toLowerCase()}.github.io` ? '/' : `/${input.repository}/`;
    if (url.protocol !== 'https:' || url.hostname !== `${input.owner.toLowerCase()}.github.io` || url.port || url.username || url.password || url.search || url.hash
      || `${url.pathname.replace(/\/$/, '')}/` !== expectedPath) throw new Error('GitHub Pages destination differs from the approved repository.');
    const expectedHead = await head();
    const commit = record(await request('GET', `${base}/git/commits/${expectedHead}`));
    if (sha(commit.sha) !== expectedHead) throw new Error('GitHub commit identity changed.');
    const rootTree = sha(record(commit.tree).sha);
    let tree = await readTree(rootTree);
    let exists = true;
    for (const part of ['sites', input.slug]) {
      const entry = tree.entries.find((item) => item.path === part);
      if (!entry) { exists = false; break; }
      if (entry.type !== 'tree' || entry.mode !== '040000') throw new Error('Publication path is not a regular Git directory.');
      tree = await readTree(entry.sha);
    }
    const currentFiles: Record<string, string> = {};
    if (exists) for (const entry of tree.entries) {
      if (entry.type !== 'blob' || entry.mode !== '100644' || !['app.js', 'styles.css', 'index.html', 'morpheus-release.json'].includes(entry.path)) throw new Error('Publication folder contains unrelated or unsupported remote files.');
      currentFiles[entry.path] = entry.sha;
    }
    return { target: { accountId: positiveId(account.id), accountLogin: account.login, repositoryId: positiveId(repo.id), owner: input.owner,
      repository: input.repository, branch: 'gh-pages', sitePath, url: `${url.href.replace(/\/$/, '')}/${sitePath}/` }, expectedHead, rootTree, currentFiles };
  };
  const requireScope = (prepared: PreparedPagesTarget) => {
    if (prepared.target.owner !== input.owner || prepared.target.repository !== input.repository || prepared.target.branch !== 'gh-pages' || prepared.target.sitePath !== sitePath) throw new Error('Publication target changed after approval.');
    sha(prepared.expectedHead); sha(prepared.rootTree);
  };
  return {
    inspect, head,
    async createCommit(prepared: PreparedPagesTarget, snapshot: PublicationSnapshot, previous: PublicationSnapshot | null): Promise<string> {
      requireScope(prepared);
      validatePublicationSnapshot(snapshot);
      if (previous) validatePublicationSnapshot(previous);
      const allowed = previous ? Object.fromEntries(previous.files.map((file) => [file.path, file.gitBlob])) : {};
      if (!sameFiles(prepared.currentFiles, allowed)) throw new Error('Remote site is not the last recorded version. Preserve remote edits and inspect again.');
      // Refresh account, repository, Pages configuration, head and folder bytes
      // immediately before any write. The subsequent non-force update also guards
      // against a competing commit racing these reads.
      const current = await inspect();
      if (JSON.stringify(current) !== JSON.stringify(prepared)) throw new Error('Publication target or remote content changed after approval.');
      const tree = record(await request('POST', `${base}/git/trees`, { base_tree: prepared.rootTree,
        tree: snapshot.files.map((file) => ({ path: `${sitePath}/${file.path}`, mode: '100644', type: 'blob', content: file.content })) }));
      const commit = record(await request('POST', `${base}/git/commits`, { message: `Morpheus site ${input.slug}: ${snapshot.publicDigest}`,
        tree: sha(tree.sha), parents: [prepared.expectedHead] }));
      const id = sha(commit.sha);
      createdCommits.set(id, JSON.stringify(prepared));
      return id;
    },
    /** Call only after durable publishing intent contains the exact commit. A
     * thrown/aborted response means UNKNOWN, not failure and not permission to retry. */
    async advance(prepared: PreparedPagesTarget, commit: string): Promise<void> {
      requireScope(prepared); sha(commit);
      if (createdCommits.get(commit) !== JSON.stringify(prepared)) throw new Error('Publication commit was not created for this approval. Reconcile instead of replaying it.');
      if (await head() !== prepared.expectedHead) throw new Error('Remote branch changed before publication.');
      // This approval permits one attempt only. Even a lost response cannot
      // replay the write through this adapter; the next operation is read-only.
      createdCommits.delete(commit);
      const result = record(await request('PATCH', `${base}/git/refs/heads/gh-pages`, { sha: commit, force: false }));
      if (sha(record(result.object).sha) !== commit || result.ref !== 'refs/heads/gh-pages') throw new Error('GitHub publication response could not be confirmed.');
    },
    /** Read-only reconciliation. A commit on the branch is not yet HTTP acceptance. */
    async reconcile(prepared: PreparedPagesTarget, commit: string): Promise<'applied' | 'not-applied' | 'conflict'> {
      requireScope(prepared); sha(commit);
      const current = await head();
      return current === commit ? 'applied' : current === prepared.expectedHead ? 'not-applied' : 'conflict';
    },
  };
}
