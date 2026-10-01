import { build } from 'esbuild';
import { join, resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import type { MorpheusAuditEntry } from '../../shared/morpheus/action-types';
import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

type TestGlobal = typeof globalThis & { interactivePreview: Awaited<ReturnType<typeof import('../../electron/services/interactive-site/preview').openInteractivePreview>> };

test('pinned interactive site works in an isolated real Chromium preview at desktop and compact sizes', async ({ launchElectronApp, userDataDir }, testInfo) => {
  const bundle = join(userDataDir, 'interactive-production.cjs');
  await build({ stdin: { contents: `export { buildInteractiveSite } from './electron/services/interactive-site/template'; export { openInteractivePreview } from './electron/services/interactive-site/preview';`, resolveDir: process.cwd(), loader: 'ts' }, outfile: bundle, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], tsconfig: resolve('tsconfig.node.json') });
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const main = await getStableWindow(app);
    await app.evaluate(async (_electron, bundle) => {
      const factories = process.mainModule!.require(bundle);
      const content = factories.buildInteractiveSite({ template: 'studio-v1', title: 'North Studio', headline: 'Make room for a better idea.', description: 'Design and development for independent teams.',
        services: [{ title: 'Identity', category: 'Design', description: 'A clear starting point.' }, { title: 'Websites', category: 'Build', description: 'A thoughtful digital home.' }],
        faqs: [{ question: 'Where do we start?', answer: 'With a small, useful brief.' }] });
      (globalThis as TestGlobal).interactivePreview = await factories.openInteractivePreview(content);
    }, bundle);
    const preview = app.windows().find((page) => page.url().startsWith('https://morpheus-preview.invalid'))!;
    await expect(preview.getByRole('heading', { level: 1 })).toHaveText('Make room for a better idea.');
    await expect(preview.locator('.services article:visible')).toHaveCount(2);
    await preview.getByRole('button', { name: 'Design', exact: true }).click();
    await expect(preview.locator('.services article:visible')).toHaveCount(1);
    await expect(preview.locator('.services article:visible')).toContainText('Identity');
    await preview.getByRole('button', { name: 'All services' }).click();
    await expect(preview.locator('.services article:visible')).toHaveCount(2);
    await preview.getByText('Where do we start?', { exact: true }).click();
    await expect(preview.getByText('With a small, useful brief.')).toBeVisible();
    await preview.getByRole('button', { name: 'Prepare my brief' }).click();
    await expect(preview.getByRole('status')).toBeHidden();
    await preview.getByLabel('Your name').fill('   ');
    await preview.getByLabel('What would you like to create?').fill('   ');
    await preview.getByRole('button', { name: 'Prepare my brief' }).click();
    await expect(preview.getByRole('status')).toBeHidden();
    await preview.getByLabel('Your name').fill('Larry');
    await preview.getByLabel('What would you like to create?').fill('A clear website for my studio.');
    await preview.getByRole('button', { name: 'Prepare my brief' }).click();
    await expect(preview.getByRole('status')).toContainText('Larry, your brief is ready locally');
    await expect(preview.getByRole('status')).toContainText('Nothing has been sent');
    await preview.evaluate(() => window.scrollTo(0, 0));
    await preview.screenshot({ path: testInfo.outputPath('interactive-desktop.png'), fullPage: true });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.fromId((globalThis as TestGlobal).interactivePreview.id)!.setContentSize(430, 800));
    await preview.emulateMedia({ reducedMotion: 'reduce' });
    await expect(preview.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await preview.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await preview.screenshot({ path: testInfo.outputPath('interactive-compact.png'), fullPage: true });
    const isolation = await app.evaluate(async ({ BrowserWindow }) => {
      const wc = BrowserWindow.fromId((globalThis as TestGlobal).interactivePreview.id)!.webContents;
      return { cookies: await wc.session.cookies.get({}), proxy: await wc.session.resolveProxy('http://127.0.0.1/private'), udp: wc.getWebRTCIPHandlingPolicy(),
        privileges: await wc.executeJavaScript('({node:typeof process,require:typeof require,bridge:typeof window.clawx})') };
    });
    expect(isolation.cookies).toEqual([]);
    expect(isolation.proxy).toMatch(/^PROXY 127\.0\.0\.1:\d+$/);
    expect(isolation.udp).toBe('disable_non_proxied_udp');
    expect(isolation.privileges).toEqual({ node: 'undefined', require: 'undefined', bridge: 'undefined' });
    const blocked = await preview.evaluate(async () => {
      const targets = ['http://127.0.0.1/private', 'https://public.example/', 'https://morpheus-preview.invalid/morpheus.site.json'];
      return Promise.all(targets.map(async (url) => { try { return (await fetch(url)).ok; } catch { return false; } }));
    });
    expect(blocked).toEqual([false, false, false]);
    await preview.evaluate(() => { window.open('https://public.example/'); });
    expect(app.windows().filter((page) => page.url().startsWith('https://morpheus-preview.invalid'))).toHaveLength(1);
    await app.evaluate(() => (globalThis as TestGlobal).interactivePreview.close());
    await expect(main.getByTestId('command-center-page')).toBeVisible();
    expect(app.windows().some((page) => page.url().startsWith('https://morpheus-preview.invalid'))).toBe(false);
  } finally { await closeElectronApp(app); }
});

for (const locale of ['en', 'zh', 'ja', 'ru']) {
test(`real task result opens and restores its pinned interactive preview in ${locale}`, async ({ launchElectronApp, userDataDir }, testInfo) => {
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const page = await getStableWindow(app);
    await page.evaluate(async (language) => { await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'settings', action: 'set', payload: { key: 'language', value: language } }); }, locale);
    await page.reload();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const invoke = (action: string, payload?: unknown) => page.evaluate(async ({ action, payload }) => {
      const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action, payload });
      if (!result.ok) throw new Error(JSON.stringify(result.error));
      return result.data;
    }, { action, payload });
    await invoke('setPermissionProfile', { profile: 'autonomous' });
    const spec = { template: 'studio-v1', title: 'North Studio', headline: 'Make room for a better idea.', description: 'Design and development for independent teams.', services: [{ title: 'Identity', category: 'Design', description: 'A clear starting point.' }], faqs: [] };
    const { runId } = await invoke('requestAction', { actionId: 'site.createInteractive', params: { path: 'studio', specification: JSON.stringify(spec) }, originType: 'quick-command' }) as { runId: string };
    await expect.poll(async () => {
      const { entries } = await invoke('auditRecent', { limit: 100 }) as { entries: MorpheusAuditEntry[] };
      return entries.find((entry) => entry.runId === runId && ['succeeded', 'failed', 'denied'].includes(entry.phase))?.phase;
    }).toBe('succeeded');
    const artifact = page.locator('[data-testid="morpheus-artifact"][data-kind="website"]').first();
    await expect(artifact).toBeVisible();
    expect(await artifact.innerText()).not.toContain('morpheus.artifacts.');
    const previewButton = artifact.getByTestId('morpheus-preview-website');
    await previewButton.focus();
    await previewButton.press('Enter');
    await expect.poll(() => app.windows().filter((p) => p.url().startsWith('https://morpheus-preview.invalid')).length).toBe(1);
    let preview = app.windows().find((p) => p.url().startsWith('https://morpheus-preview.invalid'))!;
    await expect(preview.getByRole('heading', { level: 1 })).toHaveText(spec.headline);
    await expect(page.getByTestId('file-preview-overlay')).toHaveCount(0); // never the old local HTML viewer
    await preview.close();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.screenshot({ path: testInfo.outputPath('interactive-result.png') });
    await page.reload(); // Real persisted audit restores the interactive marker and revision.
    await expect(artifact).toBeVisible();
    await previewButton.click();
    await expect.poll(() => app.windows().filter((p) => p.url().startsWith('https://morpheus-preview.invalid')).length).toBe(1);
    preview = app.windows().find((p) => p.url().startsWith('https://morpheus-preview.invalid'))!;
    await expect(preview.getByRole('heading', { level: 1 })).toHaveText(spec.headline);
    await preview.close();
    const script = join(userDataDir, 'morpheus', 'files', 'studio', 'app.js');
    await writeFile(script, 'manual edit preserved');
    await previewButton.click();
    await expect(page.getByRole('alert').filter({ hasText: /Preview unavailable|预览不可用|プレビューできません|Просмотр недоступен/ })).toBeVisible();
    expect(await readFile(script, 'utf8')).toBe('manual edit preserved');
    expect(app.windows().some((p) => p.url().startsWith('https://morpheus-preview.invalid'))).toBe(false);
    expect(errors).toEqual([]);
  } finally { await closeElectronApp(app); }
});
}
