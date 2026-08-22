import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';
import { getWebBrowserMainSnapshot } from './fixtures/web-browser';

const HTML = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="styles.css"></head><body><main><h1>Northstar Studio</h1></main></body></html>';
const CSS = 'body{background:#07110f;color:#ecfff8}@media(max-width:720px){body{padding:1rem}}';
const ANALYTICS = JSON.stringify({ schema: 'morpheus.analytics.v1', events: ['page_view'] });

async function seedVerifiedWebsite(userDataDir: string): Promise<string> {
  const workspaceRoot = join(userDataDir, 'morpheus', 'files');
  const projectRoot = join(workspaceRoot, 'projects', 'northstar');
  const entryPath = join(projectRoot, 'index.html');
  const timestamp = new Date().toISOString();
  await mkdir(projectRoot, { recursive: true });
  await Promise.all([
    writeFile(entryPath, HTML, 'utf8'),
    writeFile(join(projectRoot, 'styles.css'), CSS, 'utf8'),
    writeFile(join(projectRoot, 'analytics.json'), ANALYTICS, 'utf8'),
  ]);

  const auditDir = join(userDataDir, 'morpheus', 'audit');
  await mkdir(auditDir, { recursive: true });
  await writeFile(join(auditDir, `audit-${timestamp.slice(0, 10)}.jsonl`), `${JSON.stringify({
    v: 1,
    seq: 1,
    ts: timestamp,
    runId: 'e2e-verified-site',
    actionId: 'site.verify',
    phase: 'succeeded',
    decision: 'granted',
    target: { kind: 'folder', path: projectRoot, workspaceRoot },
    outcome: {
      kind: 'website',
      projectPath: projectRoot,
      workspaceRoot,
      entryPath,
      relativeEntryPath: 'projects/northstar/index.html',
      fileCount: 3,
      totalBytes: Buffer.byteLength(HTML) + Buffer.byteLength(CSS) + Buffer.byteLength(ANALYTICS),
      verified: true,
    },
    durationMs: 12,
    appVersion: '1.0.0',
  })}\n`, 'utf8');
  return entryPath;
}

test.describe('Morpheus hero website artifact', () => {
  test('restores a verified website and opens its real file in the Main-owned preview', async ({
    launchElectronApp,
    userDataDir,
  }) => {
    const entryPath = await seedVerifiedWebsite(userDataDir);
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.setViewportSize({ width: 1280, height: 800 });
      await expect(page.getByTestId('command-center-page')).toBeVisible();

      const website = page.locator('[data-testid="morpheus-artifact"][data-kind="website"]').first();
      await expect(website).toBeVisible();
      await expect(website).toContainText('index.html');
      await website.getByTestId('morpheus-preview-website').click();

      await expect(page.getByTestId('file-preview-header')).toContainText('index.html');
      await expect(page.getByTestId('html-preview-host')).toHaveAttribute('aria-hidden', 'false');
      await expect(page.getByTestId('html-preview-webview')).toBeVisible();
      await expect.poll(async () => (await getWebBrowserMainSnapshot(app)).url).toBe(pathToFileURL(entryPath).href);

      await page.keyboard.press('Escape');
      await expect(page.getByTestId('file-preview-header')).toHaveCount(0);
      await expect(page.getByTestId('html-preview-host')).toHaveCount(0);
    } finally {
      await closeElectronApp(app);
    }
  });
});
