import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createMorpheusRootProvider } from '@electron/services/morpheus/roots';
import { win32VerifySiteCapability } from '@electron/services/morpheus/capabilities/win32/verify-site';
import { createMorpheusSiteRevisionService, inspectMorpheusSiteRevision, parseMorpheusSiteRevisionPatch } from '@electron/services/morpheus/sites/site-revisions';
import type { MorpheusRootProvider } from '@electron/services/morpheus/roots';

const rootsToRemove: string[] = [];
afterEach(async () => { for (const root of rootsToRemove.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture(beforeMutation?: () => Promise<void>) {
  const profile = await mkdtemp(join(tmpdir(), 'morpheus-site-revisions-'));
  rootsToRemove.push(profile);
  const roots = createMorpheusRootProvider({ userDataDir: profile });
  const site = join(roots.resolve('morpheusFiles'), 'site');
  await mkdir(site);
  const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="styles.css"></head><body><h1>Original site</h1></body></html>';
  await writeFile(join(site, 'index.html'), html);
  await writeFile(join(site, 'styles.css'), 'body { max-width: 70rem; } @media (max-width: 600px) { body { padding: 1rem; } }');
  await writeFile(join(site, 'analytics.json'), JSON.stringify({ schema: 'morpheus.analytics.v1', events: ['page.view'] }));
  const verify = async (scope: MorpheusRootProvider, path: string) => {
    const resolution = await win32VerifySiteCapability.resolve({ path }, { roots: scope, appVersion: 'test', env: {} });
    await resolution.execute();
  };
  return { profile, roots, site, html, verify, service: createMorpheusSiteRevisionService({ userDataDir: profile, verify, beforeMutation }),
    revision: (await inspectMorpheusSiteRevision(roots, 'site')).revision };
}

describe('recoverable website revisions', () => {
  it('verifies staged files before atomically revising and retains the original snapshot', async () => {
    const h = await fixture();
    const changed = h.html.replace('Original site', 'Revised site');
    const receipt = await h.service.apply(h.roots, { path: 'site', expectedRevision: h.revision, files: [{ path: 'index.html', content: changed }] });
    expect(receipt).toMatchObject({ previousRevision: h.revision, revision: (await inspectMorpheusSiteRevision(h.roots, 'site')).revision, fileCount: 3 });
    expect(await readFile(join(h.site, 'index.html'), 'utf8')).toBe(changed);
    const journal = JSON.parse(await readFile(join(h.profile, 'morpheus', 'site-revisions', receipt.revisionId, 'journal.json'), 'utf8'));
    expect(journal.status).toBe('committed');
    expect(Buffer.from(journal.files[0].before, 'base64').toString()).toBe(h.html);
  });

  it('rejects a stale project digest and preserves unrelated manual edits', async () => {
    const h = await fixture();
    await writeFile(join(h.site, 'styles.css'), '/* User edit */ @media (max-width: 500px) { body { color: green; } }');
    await expect(h.service.apply(h.roots, { path: 'site', expectedRevision: h.revision, files: [{ path: 'index.html', content: h.html.replace('Original', 'New') }] })).rejects.toThrow('changed since verification');
    expect(await readFile(join(h.site, 'index.html'), 'utf8')).toBe(h.html);
    expect(await readFile(join(h.site, 'styles.css'), 'utf8')).toContain('User edit');
  });

  it('rechecks for edits while verification is running before changing the project', async () => {
    let site = '';
    const h = await fixture(async () => { await writeFile(join(site, 'index.html'), 'User changed the entry'); });
    site = h.site;
    await expect(h.service.apply(h.roots, { path: 'site', expectedRevision: h.revision, files: [{ path: 'index.html', content: h.html.replace('Original', 'New') }] })).rejects.toThrow('Manual edits conflict');
    expect(await readFile(join(h.site, 'index.html'), 'utf8')).toBe('User changed the entry');
  });

  it('rejects active content without changing any original file', async () => {
    const h = await fixture();
    await expect(h.service.apply(h.roots, { path: 'site', expectedRevision: h.revision,
      files: [{ path: 'index.html', content: h.html.replace('</body>', '<script>fetch("http://localhost")</script></body>') }] })).rejects.toThrow('cannot include scripts');
    expect(await readFile(join(h.site, 'index.html'), 'utf8')).toBe(h.html);
    await expect(h.service.apply(h.roots, { path: 'site', expectedRevision: h.revision,
      files: [{ path: 'index.html', content: h.html.replace('Original', 'Valid') }] })).resolves.toBeDefined();
  });

  it('rolls back a committed revision and added file without overwriting later manual edits', async () => {
    const h = await fixture();
    const receipt = await h.service.apply(h.roots, { path: 'site', expectedRevision: h.revision,
      files: [{ path: 'INDEX.HTML', content: h.html.replace('Original', 'Revised') }, { path: 'notes.txt', content: 'New file' }] });
    expect((await h.service.rollback(h.roots, receipt.revisionId, receipt.revision)).revision).toBe(h.revision);
    expect(await readFile(join(h.site, 'index.html'), 'utf8')).toBe(h.html);
    expect(await readdir(h.site)).not.toContain('notes.txt');
    const second = await h.service.apply(h.roots, { path: 'site', expectedRevision: h.revision,
      files: [{ path: 'index.html', content: h.html.replace('Original', 'Second') }] });
    await writeFile(join(h.site, 'index.html'), 'A later manual edit');
    await expect(h.service.rollback(h.roots, second.revisionId, second.revision)).rejects.toThrow('Manual edits conflict');
    expect(await readFile(join(h.site, 'index.html'), 'utf8')).toBe('A later manual edit');
  });

  it('reconciles interrupted mutation once on restart rather than replaying it', async () => {
    const h = await fixture();
    const receipt = await h.service.apply(h.roots, { path: 'site', expectedRevision: h.revision,
      files: [{ path: 'index.html', content: h.html.replace('Original', 'Interrupted') }] });
    const path = join(h.profile, 'morpheus', 'site-revisions', receipt.revisionId, 'journal.json');
    const journal = JSON.parse(await readFile(path, 'utf8'));
    await writeFile(path, JSON.stringify({ ...journal, status: 'applying', applied: ['index.html'] }));
    const restarted = createMorpheusSiteRevisionService({ userDataDir: h.profile, verify: h.verify });
    await restarted.reconcile(h.roots, 'site');
    await restarted.reconcile(h.roots, 'site');
    expect(await readFile(join(h.site, 'index.html'), 'utf8')).toBe(h.html);
    expect(JSON.parse(await readFile(path, 'utf8')).status).toBe('rolled-back');
  });

  it('retains manual changes made during recovery and blocks conflicting future revisions', async () => {
    const h = await fixture();
    const receipt = await h.service.apply(h.roots, { path: 'site', expectedRevision: h.revision,
      files: [{ path: 'index.html', content: h.html.replace('Original', 'Interrupted') }] });
    const path = join(h.profile, 'morpheus', 'site-revisions', receipt.revisionId, 'journal.json');
    const journal = JSON.parse(await readFile(path, 'utf8'));
    await writeFile(path, JSON.stringify({ ...journal, status: 'applying', applied: ['index.html'] }));
    await writeFile(join(h.site, 'index.html'), 'Manual changes');
    await expect(h.service.reconcile(h.roots, 'site')).rejects.toThrow('review required');
    expect(await readFile(join(h.site, 'index.html'), 'utf8')).toBe('Manual changes');
    expect(JSON.parse(await readFile(path, 'utf8')).status).toBe('needs-review');
  });

  it('restores affected originals after a late verifier failure', async () => {
    const h = await fixture();
    let calls = 0;
    const service = createMorpheusSiteRevisionService({ userDataDir: h.profile, verify: async (roots, path) => {
      if (++calls === 2) throw new Error('verification interrupted');
      await h.verify(roots, path);
    } });
    await expect(service.apply(h.roots, { path: 'site', expectedRevision: h.revision, files: [{ path: 'index.html', content: h.html.replace('Original', 'New') }] })).rejects.toThrow('verification interrupted');
    expect(await readFile(join(h.site, 'index.html'), 'utf8')).toBe(h.html);
    const revisions = await readdir(join(h.profile, 'morpheus', 'site-revisions'));
    const journal = JSON.parse(await readFile(join(h.profile, 'morpheus', 'site-revisions', revisions[0], 'journal.json'), 'utf8'));
    expect(journal.status).toBe('rolled-back');
  });

  it('rejects path/script/config injection and duplicate Windows-equivalent files', () => {
    for (const files of [[{ path: '../settings.json', content: 'x' }], [{ path: 'vite.config.js', content: 'x' }],
      [{ path: 'INDEX.HTML', content: 'x' }, { path: 'index.html', content: 'y' }]]) {
      expect(() => parseMorpheusSiteRevisionPatch({ path: 'site', expectedRevision: 'a'.repeat(64), files })).toThrow();
    }
  });
});
