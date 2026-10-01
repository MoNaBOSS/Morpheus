import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MorpheusAuditEntry } from '../../shared/morpheus/action-types';
import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

for (const locale of ['en', 'zh', 'ja', 'ru']) {
test(`real Main verifies revises previews and rolls back a static site while protecting manual edits in ${locale}`, async ({ launchElectronApp, userDataDir }, testInfo) => {
  test.skip(process.platform !== 'win32', 'Windows site capabilities');
  const project = join(userDataDir, 'morpheus', 'files', 'site');
  const original = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="styles.css"></head><body><main><h1>Original studio</h1></main></body></html>';
  await mkdir(project, { recursive: true });
  await writeFile(join(project, 'index.html'), original);
  await writeFile(join(project, 'styles.css'), 'body{background:#07110f;color:#ecfff8;margin:1rem}@media(max-width:720px){body{padding:1rem}}');
  await writeFile(join(project, 'analytics.json'), JSON.stringify({ schema: 'morpheus.analytics.v1', events: ['page_view'] }));
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const page = await getStableWindow(app);
    await page.evaluate(async (language) => {
      await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'settings', action: 'set', payload: { key: 'language', value: language } });
    }, locale);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    const invoke = (action: string, payload?: unknown) => page.evaluate(async ({ action, payload }) => {
      const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action, payload });
      if (!result.ok) throw new Error(JSON.stringify(result.error));
      return result.data;
    }, { action, payload });
    await invoke('setPermissionProfile', { profile: 'autonomous' });
    const run = async (actionId: string, params: Record<string, string>, phase = 'succeeded') => {
      const { runId } = await invoke('requestAction', { actionId, params, originType: 'quick-command' }) as { runId: string };
      let event: MorpheusAuditEntry | undefined;
      await expect.poll(async () => {
        const { entries } = await invoke('auditRecent', { limit: 100 }) as { entries: MorpheusAuditEntry[] };
        event = entries.find((entry) => entry.runId === runId && ['succeeded', 'failed', 'denied'].includes(entry.phase));
        return event?.phase;
      }).toBe(phase);
      return event!;
    };
    const verified = await run('site.verify', { path: 'site' });
    const revision = (verified.outcome as { revision: string }).revision;
    expect(revision).toMatch(/^[a-f0-9]{64}$/);
    const revised = await run('site.revise', { path: 'site', expectedRevision: revision,
      patch: JSON.stringify({ files: [{ path: 'index.html', content: original.replace('Original studio', 'Revised studio') }] }) });
    const receipt = revised.outcome as { revision: string; revisionId: string };
    expect(receipt.revisionId).toMatch(/^revision-/);
    expect(await readFile(join(project, 'index.html'), 'utf8')).toContain('Revised studio');
    const artifact = page.locator('[data-testid="morpheus-artifact"][data-kind="website"]').first();
    await expect(artifact).toBeVisible();
    const preview = artifact.getByTestId('morpheus-preview-website');
    expect(await preview.getAttribute('aria-label')).not.toContain('morpheus.');
    await preview.focus();
    await preview.press('Enter');
    await expect(page.getByTestId('file-preview-header')).toContainText('index.html');
    await expect(page.getByTestId('file-preview-overlay')).toHaveCSS('animation-name', 'none');
    await expect.poll(() => page.getByTestId('file-preview-overlay').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.right <= innerWidth + 1 && rect.left >= 0 && rect.width >= innerWidth * 0.65;
    })).toBe(true);
    await expect.poll(() => app.evaluate(({ webContents }) => {
      const guest = webContents.getAllWebContents().find((wc) => wc.getType() === 'webview' && wc.getURL().includes('/site/index.html'));
      return guest?.executeJavaScript('document.querySelector("h1")?.textContent');
    })).toBe('Revised studio');
    await expect.poll(() => page.getByTestId('html-preview-webview').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return element.closest('[aria-hidden="true"]') === null
        && document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === element;
    })).toBe(true);
    for (const width of [1024, 390]) {
      const metrics = await app.evaluate(async ({ webContents }, width) => {
        const guest = webContents.getAllWebContents().find((wc) => wc.getType() === 'webview' && wc.getURL().includes('/site/index.html'))!;
        if (!guest.debugger.isAttached()) guest.debugger.attach('1.3');
        await guest.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width, height: 640, deviceScaleFactor: 1, mobile: false });
        return guest.executeJavaScript('({ width: innerWidth, scroll: document.documentElement.scrollWidth, title: document.querySelector("h1").textContent })');
      }, width);
      expect(metrics).toEqual({ width, scroll: width, title: 'Revised studio' });
    }
    await app.evaluate(async ({ webContents }) => {
      const guest = webContents.getAllWebContents().find((wc) => wc.getType() === 'webview' && wc.getURL().includes('/site/index.html'))!;
      await guest.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');
      guest.debugger.detach();
      await guest.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    });
    await page.screenshot({ path: testInfo.outputPath('revised-static-preview.png') });
    await expect(page.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await run('site.rollback', { path: 'site', expectedRevision: receipt.revision, revisionId: receipt.revisionId });
    expect(await readFile(join(project, 'index.html'), 'utf8')).toBe(original);
    await writeFile(join(project, 'index.html'), original.replace('Original studio', 'Manual studio'));
    await run('site.revise', { path: 'site', expectedRevision: revision,
      patch: JSON.stringify({ files: [{ path: 'index.html', content: original }] }) }, 'failed');
    expect(await readFile(join(project, 'index.html'), 'utf8')).toContain('Manual studio');
    expect(errors).toEqual([]);
  } finally { await closeElectronApp(app); }
});
}
