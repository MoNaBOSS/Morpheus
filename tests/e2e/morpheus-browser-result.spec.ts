import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

for (const language of ['en', 'zh', 'ja', 'ru']) {
  test(`restored browser evidence stays readable without internal controls in ${language}`, async ({ launchElectronApp, userDataDir }, testInfo) => {
    const timestamp = new Date().toISOString();
    await mkdir(join(userDataDir, 'morpheus'), { recursive: true });
    await writeFile(join(userDataDir, 'morpheus', 'objective-history.json'), JSON.stringify({ v: 1, runOrder: ['browser-result'], runsById: {
      'browser-result': { v: 1, objectiveRunId: 'browser-result', objective: 'Find the second shelf', state: 'complete', createdAt: timestamp, updatedAt: timestamp,
        origin: { type: 'command-bar', commandText: 'Find the second shelf' }, planIds: [], observations: [], iteration: 2, corrections: [], summary: 'Found the second shelf.',
        artifacts: [{ kind: 'report', artifactId: 'browser-source', createdAt: timestamp, data: { title: 'Public library', url: 'https://library.example/next', excerpt: 'Second shelf: the books you requested.', browserSnapshot: '{"sessionId":"internal-session","revision":"internal-revision","controls":[]}', workerRunId: 'internal-worker' } }],
      },
    } }));
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.evaluate(async (language) => { await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'settings', action: 'set', payload: { key: 'language', value: language } }); }, language);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.reload();
      const result = page.getByTestId('browser-observation-result');
      await expect(result).toContainText('Second shelf: the books you requested.');
      await expect(result).toContainText('https://library.example/next');
      await expect(result).not.toContainText('internal-');
      await expect(page.locator('[data-testid="command-center-page"]')).not.toContainText('browserSnapshot');
      await page.screenshot({ path: testInfo.outputPath('browser-result.png') });
    } finally { await closeElectronApp(app); }
  });
}
