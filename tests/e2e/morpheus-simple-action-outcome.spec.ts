import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { closeElectronApp, expect, getStableWindow, installAttachmentHostFixture, test } from './fixtures/electron';

// Real Objective Core/permission/history and rendered Electron transitions;
// the OS browser delegation is held and recorded, never opens the owner's browser.
// No model reply, microphone, physical audio or current-profile reuse acceptance.
const copy = {
  en: { greeting: "What's next?", outcome: 'Opened YouTube.', details: 'Show details', hide: 'Hide details' },
  zh: { greeting: '接下来做什么？', outcome: '已打开 YouTube。', details: '查看详情', hide: '收起详情' },
  ja: { greeting: '次は何をしましょう？', outcome: 'YouTubeを開きました。', details: '詳細を表示', hide: '詳細を閉じる' },
  ru: { greeting: 'Что дальше?', outcome: 'Открыт YouTube.', details: 'Показать подробности', hide: 'Скрыть подробности' },
};
for (const language of ['en', 'zh', 'ja', 'ru'] as const) {
  test(`simple action stays concise and keeps full results available in ${language}`, async ({ launchElectronApp, userDataDir }, info) => {
    test.skip(process.platform !== 'win32', 'The registered URL capability is Windows-only');
    await writeFile(join(userDataDir, 'settings.json'), JSON.stringify({ language }));
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const fixture = await installAttachmentHostFixture(app, { sessions: [{ key: 'agent:main:main', title: 'Simple action review' }], language });
      await app.evaluate(({ shell }) => {
        const original = shell.openExternal.bind(shell);
        const evidence = { target: null as string | null, release: null as (() => void) | null };
        (globalThis as unknown as { simpleActionGate: typeof evidence }).simpleActionGate = evidence;
        shell.openExternal = async (url: string) => {
          evidence.target = url;
          await new Promise<void>((resolve) => { evidence.release = resolve; });
          await original(url);
        };
      });
      const page = await getStableWindow(app);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.reload();
      await expect(page.getByRole('heading', { name: copy[language].greeting, exact: true })).toBeVisible();
      await page.getByTestId('morpheus-command-input').fill('Open YouTube');
      await page.getByTestId('morpheus-command-submit').click();
      await expect.poll(() => app.evaluate(() => (globalThis as unknown as { simpleActionGate: { target: string | null } }).simpleActionGate.target)).toBe('https://www.youtube.com/');
      await expect(page.getByTestId('workspace-selected-task')).toContainText('Open YouTube');
      await expect(page.getByTestId('plan-cancel-objective')).toBeVisible();
      await expect(page.getByTestId('morpheus-plan-consent-dialog')).toHaveCount(0);
      await expect(page.getByTestId('command-center-objective-summary')).toHaveCount(0);
      await expect(page.getByTestId('workspace-result')).toHaveCount(0);
      await page.screenshot({ path: info.outputPath(`simple-action-working-${language}.png`), animations: 'disabled' });
      await app.evaluate(() => (globalThis as unknown as { simpleActionGate: { release: (() => void) | null } }).simpleActionGate.release!());
      await expect(page.getByTestId('command-center-objective-summary')).toHaveText(copy[language].outcome);
      await expect(page.getByTestId('workspace-result')).toHaveCount(0);
      await expect(page.getByTestId('workspace-action-details')).toHaveText(copy[language].details);
      await page.getByTestId('workspace-action-details').click();
      await expect(page.getByTestId('workspace-action-details')).toHaveText(copy[language].hide);
      await expect(page.getByTestId('workspace-result')).toContainText('https://www.youtube.com');
      await page.getByTestId('workspace-action-details').click();
      await page.getByTestId('morpheus-command-input').fill('A draft kept through expansion');
      await page.getByTestId('signal-nav-presence').click();
      await expect(page.getByTestId('quick-command-conversation')).toContainText(copy[language].outcome);
      await expect(page.getByTestId('quick-command-input')).toHaveValue('A draft kept through expansion');
      await page.getByTestId('quick-command-expand').click();
      await expect(page.getByTestId('morpheus-command-input')).toHaveValue('A draft kept through expansion');
      await page.reload();
      await expect(page.getByTestId('command-center-objective-summary')).toHaveText(copy[language].outcome);
      await expect(page.getByTestId('workspace-result')).toHaveCount(0);
      // A rich read-only task still opens its results, including actual Core data.
      await page.getByTestId('morpheus-command-input').fill('Show system information');
      await page.getByTestId('morpheus-command-submit').click();
      await expect(page.getByTestId('workspace-result')).toBeVisible();
      await expect(page.getByTestId('workspace-result')).toContainText('win32');
      await expect(page.getByTestId('workspace-conversation')).toContainText(copy[language].outcome);
      await page.screenshot({ path: info.outputPath(`simple-action-history-and-rich-result-${language}.png`), animations: 'disabled' });
      expect((await fixture.getShellInvocations()).filter((entry) => entry.action === 'openExternal')).toEqual([{ module: 'shell', action: 'openExternal', payload: { url: 'https://www.youtube.com/' } }]);
      expect((await fixture.getHostInvocations()).filter((entry) => entry.module === 'chat' && entry.action === 'sendAcpPrompt')).toHaveLength(0);
      expect(errors).toEqual([]);
      await writeFile(info.outputPath('qualification-scope.json'), JSON.stringify({ language, scope: 'Real Core single URL task and system report, localized inline outcome/details, compact/full draft and reload. Shell delegation mocked; no model, physical speech or browser-profile acceptance.', errors }, null, 2));
    } finally { await closeElectronApp(app); }
  });
}
