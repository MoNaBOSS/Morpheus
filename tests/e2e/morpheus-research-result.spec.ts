import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { closeElectronApp, expect, getStableWindow, test, installIpcMocks, getRecordedHostInvocations } from './fixtures/electron';

for (const language of ['en', 'zh', 'ja', 'ru']) {
  test(`retrieved research sources are readable and open externally in ${language}`, async ({ launchElectronApp, userDataDir }, testInfo) => {
    const timestamp = new Date().toISOString();
    const reportPath = join(userDataDir, 'morpheus', 'files', 'research-voice.md');
    const reportText = '# Voice research report\n\nUse your current microphone. [s1](<https://guide.example/voice>)\n\n## Retrieved sources\n\n[s1: Voice setup](<https://guide.example/voice>)';
    await mkdir(join(userDataDir, 'morpheus', 'files'), { recursive: true });
    await writeFile(reportPath, reportText);
    await writeFile(join(userDataDir, 'morpheus', 'objective-history.json'), JSON.stringify({ v: 1, runOrder: ['research-result'], runsById: {
      'research-result': { v: 1, objectiveRunId: 'research-result', objective: 'Research a natural voice setup', state: 'complete', createdAt: timestamp, updatedAt: timestamp,
        origin: { type: 'command-bar', commandText: 'Research a natural voice setup' }, planIds: [], observations: [], iteration: 2, corrections: [], summary: 'Start with your current microphone. Compare real voice samples before choosing.',
        artifacts: [{ kind: 'report', artifactId: 'source', createdAt: timestamp, data: { sourceType: 'public-https', title: 'A simpler voice setup', finalUrl: 'https://guide.example/voice', excerpt: 'Try your current microphone in a quiet room. Test interruption, background noise and a complete conversation before buying hardware.', retrievedAt: timestamp, contentSha256: 'a'.repeat(64), workerRunId: 'internal-worker-id', truncated: 1 } },
          { kind: 'file', artifactId: 'report-file', createdAt: timestamp, path: reportPath, bytes: Buffer.byteLength(reportText), contentSha256: 'a'.repeat(64) }],
      },
    } }));
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.evaluate(async (language) => { await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'settings', action: 'set', payload: { key: 'language', value: language } }); }, language);
      await installIpcMocks(app, { recordHostInvocations: true, hostApi: { [JSON.stringify(['shell', 'openExternal', { url: 'https://guide.example/voice' }])]: null } });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.reload();
      expect(page.url()).toContain('index.html');
      expect(await page.title()).toBeTruthy();
      const result = page.getByTestId('research-source-result');
      await expect(result).toContainText('A simpler voice setup');
      await expect(result).not.toContainText('internal-worker');
      await expect(result).not.toContainText('contentSha256');
      await page.getByTestId('research-source-open').click();
      expect(await getRecordedHostInvocations(app)).toContainEqual({ module: 'shell', action: 'openExternal', payload: { url: 'https://guide.example/voice' } });
      await expect(page.locator('webview')).toHaveCount(0);
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      expect(errors).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath('research-result.png') });
      const preview = page.getByTestId('morpheus-preview-file');
      expect(await preview.getAttribute('aria-label')).not.toContain('morpheus.');
      await preview.focus();
      await preview.press('Enter');
      await expect(page.getByTestId('file-preview-overlay')).toContainText('Voice research report');
      await expect(page.getByTestId('file-preview-overlay').getByRole('heading', { name: 'Retrieved sources' })).toBeVisible();
      await page.getByTestId('report-citation-open').first().click();
      expect((await getRecordedHostInvocations(app)).filter((entry) => entry.module === 'shell' && entry.action === 'openExternal')).toHaveLength(2);
      await expect(page.locator('webview')).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath('saved-report-preview.png') });
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 430, height: 800 });
      await expect(result).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('research-narrow.png') });
      expect(errors).toEqual([]);
    } finally { await closeElectronApp(app); }
  });
}
