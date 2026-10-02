import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { closeElectronApp, expect, getStableWindow, installAttachmentHostFixture, test } from './fixtures/electron';

// ACP replies are bounded fixtures; the intervening read-only system task uses
// the real Objective Core. This qualifies native display order, not model quality.
const greetings = { en: "What's next?", zh: '接下来做什么？', ja: '次は何をしましょう？', ru: 'Что дальше?' };
for (const language of ['en', 'zh', 'ja', 'ru'] as const) {
  test(`keeps mixed conversation and task order through compact/full in ${language}`, async ({ launchElectronApp, userDataDir }, info) => {
    await writeFile(join(userDataDir, 'settings.json'), JSON.stringify({ language }));
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const fixture = await installAttachmentHostFixture(app, {
        sessions: [{ key: 'agent:main:main', title: 'Conversation order test' }],
        language,
      });
      await fixture.setPromptUpdates('What changed in the report?', [{
        sessionUpdate: 'agent_message_chunk', messageId: 'earlier-reply',
        content: { type: 'text', text: 'Earlier fixture reply.' },
      }]);
      await fixture.setPromptUpdates('What should I review next?', [{
        sessionUpdate: 'agent_message_chunk', messageId: 'later-reply',
        content: { type: 'text', text: 'Later fixture reply.' },
      }]);
      const page = await getStableWindow(app);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.reload();
      await expect(page.getByRole('heading', { name: greetings[language], exact: true })).toBeVisible();
      await page.getByTestId('morpheus-command-input').fill('What changed in the report?');
      await page.getByTestId('morpheus-command-submit').click();
      await expect(page.getByTestId('workspace-conversation')).toContainText('Earlier fixture reply.');
      await page.getByTestId('morpheus-command-input').fill('Show system information');
      await page.getByTestId('morpheus-command-submit').click();
      await expect(page.getByTestId('workspace-selected-task')).toContainText('Show system information');
      await expect(page.getByTestId('command-center-objective-state')).toContainText(/complete|完成|完了|заверш/i);
      await page.getByTestId('morpheus-command-input').fill('What should I review next?');
      await page.getByTestId('morpheus-command-submit').click();
      await expect(page.getByTestId('workspace-conversation')).toContainText('Later fixture reply.');
      await expect(page.getByTestId('workspace-conversation').getByText('Later fixture reply.', { exact: true })).toBeInViewport({ ratio: 1 });
      const assertOrder = async (testId: string) => {
        const entries = await page.getByTestId(testId).locator('[data-morpheus-entry]').evaluateAll((elements) => elements.map((element) => element.textContent ?? ''));
        expect(entries).toHaveLength(5);
        expect(entries[0]).toContain('What changed in the report?');
        expect(entries[1]).toContain('Earlier fixture reply.');
        expect(entries[2]).toContain('Show system information');
        expect(entries[3]).toContain('What should I review next?');
        expect(entries[4]).toContain('Later fixture reply.');
      };
      await assertOrder('workspace-conversation');
      await page.getByTestId('signal-nav-presence').click();
      await expect(page.getByTestId('morpheus-quick-command')).toHaveAttribute('data-presentation', process.platform === 'win32' ? 'compact-window' : 'overlay');
      await assertOrder('quick-command-conversation');
      await expect(page.getByTestId('quick-command-conversation').getByText('Later fixture reply.', { exact: true })).toBeInViewport({ ratio: 1 });
      const compactLog = page.getByTestId('morpheus-quick-command').getByRole('log');
      await compactLog.evaluate((element) => { element.scrollTop = 0; });
      await expect(page.getByTestId('quick-command-conversation').getByText('Earlier fixture reply.', { exact: true })).toBeInViewport({ ratio: 1 });
      await fixture.emitAcpSessionUpdates({ sessionKey: 'agent:main:main', updates: [{
        sessionUpdate: 'agent_message_chunk', messageId: 'later-reply',
        content: { type: 'text', text: ' Extra fixture detail.' },
      }] });
      await expect(page.getByTestId('quick-command-conversation')).toContainText('Extra fixture detail.');
      await expect.poll(() => compactLog.evaluate((element) => element.scrollTop)).toBe(0);
      await compactLog.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      await expect(page.getByTestId('quick-command-conversation').getByText(/Later fixture reply\. Extra fixture detail\./)).toBeInViewport({ ratio: 1 });
      await page.screenshot({ path: info.outputPath(`ordered-compact-${language}.png`), animations: 'disabled' });
      await page.getByTestId('quick-command-expand').click();
      await assertOrder('workspace-conversation');
      await expect(page.getByTestId('workspace-conversation').getByText(/Later fixture reply\. Extra fixture detail\./)).toBeInViewport({ ratio: 1 });
      await expect(page.getByTestId('workspace-selected-task')).toContainText('Show system information');
      await page.screenshot({ path: info.outputPath(`ordered-full-${language}.png`), animations: 'disabled' });
      const calls = (await fixture.getHostInvocations()).filter((entry) => entry.module === 'chat' && entry.action === 'sendAcpPrompt');
      expect(calls).toHaveLength(2);
    } finally { await closeElectronApp(app); }
  });
}
