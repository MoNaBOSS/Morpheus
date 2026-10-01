import { describe, expect, it, vi } from 'vitest';
import { createGitHubPagesAdapter } from '../../electron/services/site-publication/github-pages';
import { createGitHubRequest, type GitHubRequest } from '../../electron/services/site-publication/github-transport';
import { publicationSnapshotFromSpec, validatePublicationSnapshot } from '../../electron/services/site-publication/snapshot';
import { verifyPublishedSnapshot } from '../../electron/services/site-publication/verify-http';

const spec = { template: 'studio-v1', title: 'North Studio', headline: 'Make room for a better idea.', description: 'Design for independent teams.', services: [{ title: 'Identity', category: 'Design', description: 'A clear start.' }], faqs: [] };
const snapshot = publicationSnapshotFromSpec(spec);
const HEAD = '1'.repeat(40), ROOT = '2'.repeat(40), TREE = '3'.repeat(40), COMMIT = '4'.repeat(40);
const config = { owner: 'Larry', repository: 'studio', slug: 'north' };

function fixture() {
  let head = HEAD;
  let files: Record<string, string> = {};
  let loseResponse = false;
  const repo = { id: 52, full_name: 'Larry/studio', private: false, permissions: { push: true }, default_branch: 'main' };
  const pages = { source: { branch: 'gh-pages', path: '/' }, html_url: 'https://larry.github.io/studio/', public: true, cname: null, build_type: 'legacy' };
  const account = { id: 7, login: 'Larry' };
  const request = vi.fn<GitHubRequest>(async (method, path, body) => {
    if (method === 'GET') {
      if (path === '/user') return account;
      if (path.endsWith('/pages')) return pages;
      if (path === '/repos/Larry/studio') return repo;
      if (path.endsWith('/git/ref/heads/gh-pages')) return { ref: 'refs/heads/gh-pages', object: { type: 'commit', sha: head } };
      if (path.includes('/git/commits/')) return { sha: head, tree: { sha: ROOT } };
      if (path.endsWith(`/git/trees/${ROOT}`)) return { sha: ROOT, tree: [{ path: 'README.md', type: 'blob', mode: '100644', sha: 'b'.repeat(40) },
        ...(Object.keys(files).length ? [{ path: 'sites', type: 'tree', mode: '040000', sha: '5'.repeat(40) }] : [])] };
      if (path.endsWith(`/git/trees/${'5'.repeat(40)}`)) return { sha: '5'.repeat(40), tree: [{ path: 'north', type: 'tree', mode: '040000', sha: '6'.repeat(40) }] };
      if (path.endsWith(`/git/trees/${'6'.repeat(40)}`)) return { sha: '6'.repeat(40), tree: Object.entries(files).map(([path, sha]) => ({ path, sha, mode: '100644', type: 'blob' })) };
    }
    if (method === 'POST' && path.endsWith('/git/trees')) return { sha: TREE };
    if (method === 'POST' && path.endsWith('/git/commits')) return { sha: COMMIT };
    if (method === 'PATCH' && path.endsWith('/git/refs/heads/gh-pages')) {
      head = (body as { sha: string }).sha;
      if (loseResponse) throw new Error('Lost response after applying');
      return { ref: 'refs/heads/gh-pages', object: { sha: head } };
    }
    throw new Error(`Unexpected fixture request: ${method} ${path}`);
  });
  return { request, repo, pages, account, adapter: createGitHubPagesAdapter(request, config),
    setHead: (value: string) => { head = value; }, setFiles: (value: Record<string, string>) => { files = value; }, loseResponse: () => { loseResponse = true; } };
}

describe('exact GitHub Pages boundary', () => {
  it('prepares read-only and writes only the exact site files using a non-force branch update', async () => {
    const f = fixture();
    const prepared = await f.adapter.inspect();
    expect(f.request.mock.calls.every(([method]) => method === 'GET')).toBe(true);
    expect(prepared.target).toMatchObject({ accountId: 7, repositoryId: 52, branch: 'gh-pages', sitePath: 'sites/north', url: 'https://larry.github.io/studio/sites/north/' });
    const commit = await f.adapter.createCommit(prepared, snapshot, null);
    expect(f.request.mock.calls.find(([method, path]) => method === 'POST' && path.endsWith('/git/trees'))?.[2]).toMatchObject({ base_tree: ROOT,
      tree: snapshot.files.map((file) => ({ path: `sites/north/${file.path}`, mode: '100644', type: 'blob', content: file.content })) });
    expect(f.request.mock.calls.find(([method, path]) => method === 'POST' && path.endsWith('/git/commits'))?.[2]).toMatchObject({ tree: TREE, parents: [HEAD] });
    await f.adapter.advance(prepared, commit);
    expect(f.request.mock.calls.find(([method]) => method === 'PATCH')?.[2]).toEqual({ sha: COMMIT, force: false });
    await expect(f.adapter.reconcile(prepared, commit)).resolves.toBe('applied');
    await expect(f.adapter.advance(prepared, commit)).rejects.toThrow('not created for this approval');
  });
  it('reconciles a lost response without retrying the write', async () => {
    const f = fixture(); const prepared = await f.adapter.inspect();
    const commit = await f.adapter.createCommit(prepared, snapshot, null);
    f.loseResponse();
    await expect(f.adapter.advance(prepared, commit)).rejects.toThrow('Lost response');
    await expect(f.adapter.advance(prepared, commit)).rejects.toThrow('not created for this approval');
    await expect(f.adapter.reconcile(prepared, commit)).resolves.toBe('applied');
    expect(f.request.mock.calls.filter(([method]) => method === 'PATCH')).toHaveLength(1);
    f.setHead(HEAD); await expect(f.adapter.reconcile(prepared, commit)).resolves.toBe('not-applied');
    f.setHead('9'.repeat(40)); await expect(f.adapter.reconcile(prepared, commit)).resolves.toBe('conflict');
  });
  it('rejects concurrent head movement and any commit not created for the exact approval', async () => {
    const f = fixture(); const prepared = await f.adapter.inspect();
    await expect(f.adapter.advance(prepared, COMMIT)).rejects.toThrow('not created');
    const commit = await f.adapter.createCommit(prepared, snapshot, null);
    f.setHead('9'.repeat(40));
    await expect(f.adapter.advance(prepared, commit)).rejects.toThrow('branch changed');
    expect(f.request.mock.calls.filter(([method]) => method === 'PATCH')).toHaveLength(0);
  });
  it('preserves changed remote files and never treats a folder as owned without a previous snapshot', async () => {
    const f = fixture(); f.setFiles(Object.fromEntries(snapshot.files.map((file) => [file.path, file.gitBlob])));
    const prepared = await f.adapter.inspect();
    await expect(f.adapter.createCommit(prepared, snapshot, null)).rejects.toThrow('not the last recorded');
    await expect(f.adapter.createCommit(prepared, snapshot, snapshot)).resolves.toBe(COMMIT);
    f.setFiles({ ...prepared.currentFiles, 'index.html': '8'.repeat(40) });
    await expect(f.adapter.createCommit(prepared, snapshot, snapshot)).rejects.toThrow('changed after approval');
  });
  it('can prepare rollback bytes as a new child commit without resetting the branch', async () => {
    const f = fixture(); const newer = publicationSnapshotFromSpec({ ...spec, headline: 'Second version.' });
    f.setFiles(Object.fromEntries(newer.files.map((file) => [file.path, file.gitBlob])));
    const prepared = await f.adapter.inspect();
    await f.adapter.createCommit(prepared, snapshot, newer);
    const tree = f.request.mock.calls.find(([method, path]) => method === 'POST' && path.endsWith('/git/trees'))?.[2] as { tree: { path: string; content: string }[] };
    expect(tree.tree.find((file) => file.path.endsWith('/index.html'))?.content).toContain(spec.headline);
    expect(tree.tree.find((file) => file.path.endsWith('/index.html'))?.content).not.toContain('Second version.');
  });
  it.each(['private', 'no-push', 'default-branch', 'custom-domain', 'wrong-url', 'workflow', 'wrong-source', 'renamed-repo', 'foreign-file'] as const)('refuses unsupported or changed scope: %s', async (kind) => {
    const f = fixture();
    if (kind === 'private') f.repo.private = true;
    if (kind === 'no-push') f.repo.permissions.push = false;
    if (kind === 'default-branch') f.repo.default_branch = 'gh-pages';
    if (kind === 'custom-domain') Object.assign(f.pages, { cname: 'elsewhere.example' });
    if (kind === 'wrong-url') f.pages.html_url = 'https://elsewhere.example/';
    if (kind === 'workflow') f.pages.build_type = 'workflow';
    if (kind === 'wrong-source') f.pages.source.branch = 'main';
    if (kind === 'renamed-repo') f.repo.full_name = 'Larry/different';
    if (kind === 'foreign-file') f.setFiles({ 'manual.txt': 'a'.repeat(40) });
    await expect(f.adapter.inspect()).rejects.toThrow();
    expect(f.request.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
});

describe('public bytes and observed HTTP receipt', () => {
  it.each(['ghp_' + 'a'.repeat(36), 'sk-proj-' + 'b'.repeat(30), '-----BEGIN PRIVATE KEY-----'])('rejects obvious credential content before any publication: %s', (secret) => {
    expect(() => publicationSnapshotFromSpec({ ...spec, description: secret })).toThrow('credential');
  });
  it('omits private project data and detects changed snapshots', () => {
    expect(snapshot.files.map((file) => file.path).sort()).toEqual(['app.js', 'index.html', 'morpheus-release.json', 'styles.css']);
    expect(() => validatePublicationSnapshot(snapshot)).not.toThrow();
    const modified = structuredClone(snapshot); modified.files[0].content += 'bad';
    expect(() => validatePublicationSnapshot(modified)).toThrow('bytes changed');
    const other = structuredClone(snapshot); other.spec.title = 'unapproved change';
    expect(() => validatePublicationSnapshot(other)).toThrow('not the reviewed');
  });
  it('requires every exact file over public pinned HTTP and never follows a redirect', async () => {
    const { target } = await fixture().adapter.inspect();
    const observed: string[] = [];
    const transport = vi.fn(async (url: URL) => {
      observed.push(url.href);
      const file = snapshot.files.find((item) => url.pathname.endsWith(`/${item.path}`))!;
      const type = file.path.endsWith('.html') ? 'text/html' : file.path.endsWith('.css') ? 'text/css' : file.path.endsWith('.js') ? 'text/javascript' : 'application/json';
      return { status: 200, headers: { 'content-type': type }, body: Buffer.from(file.content) };
    });
    const deps = { resolveAddresses: async () => [{ address: '93.184.216.34', family: 4 }], transport };
    await expect(verifyPublishedSnapshot(target, snapshot, new AbortController().signal, deps)).resolves.toBe(true);
    expect(observed).toHaveLength(4);
    transport.mockImplementation(async () => ({ status: 302, headers: { location: 'https://elsewhere.example' }, body: Buffer.alloc(0) }));
    await expect(verifyPublishedSnapshot(target, snapshot, new AbortController().signal, deps)).resolves.toBe(false);
    transport.mockImplementation(async () => ({ status: 200, headers: {}, body: Buffer.from('old deployment') }));
    await expect(verifyPublishedSnapshot(target, snapshot, new AbortController().signal, deps)).resolves.toBe(false);
    await expect(verifyPublishedSnapshot(target, snapshot, new AbortController().signal, { ...deps, resolveAddresses: async () => [{ address: '127.0.0.1', family: 4 }] })).rejects.toThrow('public addresses');
    await expect(verifyPublishedSnapshot({ ...target, url: 'https://127.0.0.1/' }, snapshot, new AbortController().signal, deps)).rejects.toThrow('target changed');
  });
});

describe('GitHub credential transport', () => {
  it('uses the fixed API origin and rejects redirects, arbitrary paths and excess requests', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"id":7}', { status: 200 }));
    const request = createGitHubRequest('fixture-token', new AbortController().signal, fetchImpl as typeof fetch);
    await expect(request('GET', '/user')).resolves.toEqual({ id: 7 });
    expect(fetchImpl.mock.calls[0]).toMatchObject(['https://api.github.com/user', { redirect: 'error', headers: { Authorization: 'Bearer fixture-token' } }]);
    await expect(request('GET', '//evil.example/user')).rejects.toThrow('fixed scope');
    await expect(request('GET', '/repos/Larry/studio/../private')).rejects.toThrow('fixed scope');
    for (let index = 0; index < 37; index++) await request('GET', '/user');
    await expect(request('GET', '/user')).rejects.toThrow('fixed scope');
  });
  it('does not include remote bodies or original secret-bearing exceptions in diagnostics', async () => {
    const request = createGitHubRequest('fixture-token', new AbortController().signal, vi.fn(async () => { throw new Error('secret fixture-token'); }) as typeof fetch);
    let error: unknown; try { await request('GET', '/user'); } catch (caught) { error = caught; }
    expect(String(error)).not.toContain('fixture-token');
    expect((error as Error).cause).toBeUndefined();
    const failed = createGitHubRequest('fixture-token', new AbortController().signal, vi.fn(async () => new Response('secret-body', { status: 403 })) as typeof fetch);
    await expect(failed('GET', '/user')).rejects.toThrow('GitHub request failed (403).');
  });
});
