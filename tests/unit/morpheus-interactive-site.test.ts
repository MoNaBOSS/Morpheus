import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from 'node:fs/promises';
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseInteractiveSiteSpec } from '../../shared/morpheus/interactive-site-types';
import { buildInteractiveSite } from '../../electron/services/interactive-site/template';
import { createInteractiveProject, verifyInteractiveProject } from '../../electron/services/interactive-site/project';
import { createInteractivePreviewNetwork } from '../../electron/services/interactive-site/preview';
import type { MorpheusRootProvider } from '../../electron/services/morpheus/roots';

vi.mock('electron', () => ({ BrowserWindow: vi.fn(), session: {} }));
const spec = { template: 'studio-v1', title: 'North Studio', headline: 'Make room for a better idea.', description: 'Design and development for independent teams.',
  services: [{ title: 'Identity', category: 'Design', description: 'A clear starting point.' }, { title: 'Websites', category: 'Build', description: 'A thoughtful digital home.' }],
  faqs: [{ question: 'Where do we start?', answer: 'With a small, useful brief.' }] };
const dirs: string[] = [];
const setup = async () => {
  const root = await mkdtemp(join(tmpdir(), 'morpheus-interactive-unit-'));
  dirs.push(root);
  const roots: MorpheusRootProvider = { resolve: () => root, forWorkspace: () => roots };
  return { root, roots };
};
afterEach(async () => { for (const path of dirs.splice(0)) await rm(path, { recursive: true, force: true }); });

describe('pinned interactive template', () => {
  it('builds deterministic escaped client assets without project execution', () => {
    const first = buildInteractiveSite(spec);
    expect(buildInteractiveSite(spec)).toEqual(first);
    expect(first.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(first.files)).toHaveLength(6);
    expect(first.totalBytes).toBeLessThan(64 * 1024);
    const attack = buildInteractiveSite({ ...spec, headline: '<script>fetch("http://127.0.0.1")</script>' });
    expect(attack.files['index.html']).toContain('&lt;script&gt;');
    expect(attack.files['app.js']).toBe(first.files['app.js']);
    expect(first.files['app.js']).toContain('Nothing has been sent');
    expect(first.files['app.js']).not.toMatch(/fetch\(|eval\(|import\(|localStorage/);
  });
  it.each([
    { ...spec, scripts: { build: 'steal keys' } }, { ...spec, template: '../custom' }, { ...spec, services: [] },
    { ...spec, services: Array(9).fill(spec.services[0]) }, { ...spec, headline: 'a'.repeat(161) },
    { ...spec, faqs: [{ question: 'x', answer: 'y', script: 'bad' }] }, { ...spec, title: 'bad\u0000' },
  ])('rejects non-template input %#', (input) => { expect(() => parseInteractiveSiteSpec(input)).toThrow(); });
});

describe('project files and preservation', () => {
  it('can create the largest escaped content accepted by the data schema', async () => {
    const { roots } = await setup();
    const large = { template: 'studio-v1', title: '&'.repeat(80), headline: '&'.repeat(160), description: '&'.repeat(600),
      services: Array.from({ length: 8 }, () => ({ title: '&'.repeat(100), category: '&'.repeat(40), description: '&'.repeat(600) })),
      faqs: Array.from({ length: 6 }, () => ({ question: '&'.repeat(160), answer: '&'.repeat(800) })) };
    const receipt = await createInteractiveProject(roots, 'large', large);
    expect((await verifyInteractiveProject(roots, 'large', receipt.revision)).spec).toEqual(large);
  });
  it('writes a real verified project, pins its revision and refuses overwrite', async () => {
    const { root, roots } = await setup();
    const receipt = await createInteractiveProject(roots, 'studio', spec);
    const verified = await verifyInteractiveProject(roots, 'studio', receipt.revision);
    expect(receipt.fileCount).toBe(6);
    expect(await readFile(join(root, 'studio', 'index.html'), 'utf8')).toBe(verified.files['index.html']);
    await expect(createInteractiveProject(roots, 'studio', { ...spec, title: 'Changed' })).rejects.toThrow('preserved');
    await expect(verifyInteractiveProject(roots, 'studio', 'a'.repeat(64))).rejects.toThrow('revision changed');
    expect((await verifyInteractiveProject(roots, 'studio')).spec.title).toBe('North Studio');
  });
  it.each(['app.js', 'index.html', 'morpheus.build.json', 'morpheus.site.json'])('preserves and rejects modified %s', async (name) => {
    const { root, roots } = await setup();
    await createInteractiveProject(roots, 'studio', spec);
    await writeFile(join(root, 'studio', name), 'manual changes');
    await expect(verifyInteractiveProject(roots, 'studio')).rejects.toThrow();
    expect(await readFile(join(root, 'studio', name), 'utf8')).toBe('manual changes');
  });
  it('never executes injected build scripts/configuration', async () => {
    const { root, roots } = await setup();
    await createInteractiveProject(roots, 'studio', spec);
    await writeFile(join(root, 'studio', 'package.json'), JSON.stringify({ scripts: { build: 'throw bad' } }));
    await expect(verifyInteractiveProject(roots, 'studio')).rejects.toThrow('unreviewed files');
  });
  it('rejects linked project roots and oversized files', async () => {
    const { root, roots } = await setup();
    await createInteractiveProject(roots, 'studio', spec);
    await symlink(join(root, 'studio'), join(root, 'linked'), 'junction');
    await expect(verifyInteractiveProject(roots, 'linked')).rejects.toThrow('symbolic link');
    await writeFile(join(root, 'studio', 'app.js'), 'x'.repeat(131073));
    await expect(verifyInteractiveProject(roots, 'studio')).rejects.toThrow('unsupported file');
  });
  it.each(['../escape', '.', 'CON', 'studio:ads', 'studio.', 'nested/../studio', 'C:\\outside'])('rejects ambiguous or escaping path %s', async (path) => {
    const { roots } = await setup();
    await expect(createInteractiveProject(roots, path, spec)).rejects.toThrow();
  });
  it('leaves incomplete projects intact and cancellation does not start writes', async () => {
    const { root, roots } = await setup();
    await mkdir(join(root, 'incomplete'));
    await writeFile(join(root, 'incomplete', '.morpheus-incomplete'), 'interrupted');
    await expect(verifyInteractiveProject(roots, 'incomplete')).rejects.toThrow('incomplete');
    await expect(createInteractiveProject(roots, 'incomplete', spec)).rejects.toThrow('preserved');
    const controller = new AbortController(); controller.abort();
    await expect(createInteractiveProject(roots, 'cancelled', spec, controller.signal)).rejects.toThrow();
    await expect(readFile(join(root, 'cancelled', 'index.html'))).rejects.toThrow();
  });
  it('keeps the incomplete marker when cancelled during final on-disk verification', async () => {
    const { root } = await setup();
    const controller = new AbortController();
    const files = Object.keys(buildInteractiveSite(spec).files);
    const roots: MorpheusRootProvider = {
      resolve: () => {
        if (files.every((name) => existsSync(join(root, 'studio', name)))) controller.abort();
        return root;
      },
      forWorkspace: () => roots,
    };
    await expect(createInteractiveProject(roots, 'studio', spec, controller.signal)).rejects.toThrow('did not complete');
    expect(files.every((name) => existsSync(join(root, 'studio', name)))).toBe(true);
    expect(await readFile(join(root, 'studio', '.morpheus-incomplete'), 'utf8')).toContain('Files are preserved');
    await expect(verifyInteractiveProject(roots, 'studio')).rejects.toThrow('incomplete');
    await expect(createInteractiveProject(roots, 'studio', spec)).rejects.toThrow('preserved');
  });
  it('retains both the marker and an external edit when final written-byte verification fails', async () => {
    const { root } = await setup();
    const files = Object.keys(buildInteractiveSite(spec).files);
    let edited = false;
    const roots: MorpheusRootProvider = {
      resolve: () => {
        if (!edited && files.every((name) => existsSync(join(root, 'studio', name)))) {
          edited = true;
          writeFileSync(join(root, 'studio', 'app.js'), 'External edit preserved');
        }
        return root;
      },
      forWorkspace: () => roots,
    };
    await expect(createInteractiveProject(roots, 'studio', spec)).rejects.toThrow('did not complete');
    expect(await readFile(join(root, 'studio', 'app.js'), 'utf8')).toBe('External edit preserved');
    expect(existsSync(join(root, 'studio', '.morpheus-incomplete'))).toBe(true);
    await expect(verifyInteractiveProject(roots, 'studio')).rejects.toThrow('incomplete');
  });
});

describe('preview memory transport', () => {
  it('only serves pinned GET assets and exposes no workspace or network path', async () => {
    const build = buildInteractiveSite(spec);
    const network = createInteractivePreviewNetwork(build);
    build.files['app.js'] = 'bad replacement';
    const response = await network.handle(new Request('https://morpheus-preview.invalid/app.js'));
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain('bad replacement');
    expect(response.headers.get('content-security-policy')).toContain("connect-src 'none'");
    for (const url of ['https://morpheus-preview.invalid/morpheus.site.json', 'https://morpheus-preview.invalid/app.js?secret=x', 'https://elsewhere.example/app.js', 'https://127.0.0.1/', 'file:///C:/Users/secret']) {
      expect((await network.handle(new Request(url))).status).toBe(403);
    }
    expect((await network.handle(new Request('https://morpheus-preview.invalid/', { method: 'POST', body: 'brief' }))).status).toBe(403);
    expect(network.stats().blocked).toBe(6);
  });
});
