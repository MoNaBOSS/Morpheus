import { join } from 'node:path';
import {
  closeElectronApp,
  expect,
  getStableWindow,
  installAttachmentHostFixture,
  test,
} from './fixtures/electron';

const SESSION_KEY = 'agent:main:main';

test.describe('Morpheus compact conversation continuity', () => {
  test('native bottom-right compact receives an ordinary reply without expanding', async ({ launchElectronApp }, testInfo) => {
    test.skip(process.platform !== 'win32', 'Windows native presence');
    const app = await launchElectronApp({ skipSetup: true, additionalArgs: ['--morpheus-test-wake-orb'] });
    try {
      await expect.poll(() => app.windows().length).toBeGreaterThanOrEqual(2);
      const windows = await Promise.all(app.windows().map(async (page) => ({ page, title: await page.title() })));
      const orb = windows.find(({ title }) => title === 'Morpheus presence')?.page;
      const main = windows.find(({ title }) => title === 'Morpheus')?.page;
      expect(orb).toBeDefined();
      expect(main).toBeDefined();
      const fixture = await installAttachmentHostFixture(app, {
        sessions: [{ key: SESSION_KEY, title: 'Main conversation' }],
      });
      await fixture.setPromptUpdates('What changed in the report?', [{
        sessionUpdate: 'agent_message_chunk', messageId: 'compact-answer',
        content: { type: 'text', text: 'The report now includes the verified summary.' },
      }]);
      await main!.reload();
      await expect(main!.getByTestId('command-center-page')).toBeVisible();
      await orb!.locator('.orb').hover();
      await expect(orb!.locator('.hover-composer')).toHaveCSS('opacity', '1');
      await orb!.locator('.hover-composer-expand').click();
      const companion = main!.getByTestId('morpheus-quick-command');
      await expect(companion).toHaveAttribute('data-presentation', 'compact-window');
      await main!.getByTestId('quick-command-input').fill('What changed in the report?');
      await main!.getByTestId('quick-command-submit').click();
      await expect(main!.getByTestId('quick-command-conversation'))
        .toContainText('The report now includes the verified summary.');
      await expect(companion).toHaveAttribute('data-presentation', 'compact-window');
      expect(main!.url()).not.toContain('#/chat');
      await main!.screenshot({ path: testInfo.outputPath('native-compact-reply.png'), animations: 'disabled' });
      if (process.env.MORPHEUS_VISUAL_EVIDENCE_DIR) {
        await main!.screenshot({
          path: join(process.env.MORPHEUS_VISUAL_EVIDENCE_DIR, 'native-compact-reply.png'),
          animations: 'disabled',
        });
      }
      const promptCalls = (await fixture.getHostInvocations()).filter((entry) => (
        entry.module === 'chat' && entry.action === 'sendAcpPrompt'
      ));
      expect(promptCalls).toHaveLength(1);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('answers an ordinary question in compact and preserves the draft through full and back', async ({ launchElectronApp }, testInfo) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const fixture = await installAttachmentHostFixture(app, {
        sessions: [{ key: SESSION_KEY, title: 'Main conversation' }],
      });
      await fixture.setPromptUpdates('What changed in the report?', [{
        sessionUpdate: 'agent_message_chunk',
        messageId: 'compact-answer',
        content: { type: 'text', text: 'The report now includes the verified summary.' },
      }]);
      const page = await getStableWindow(app);
      await page.reload();
      await expect(page.getByTestId('command-center-page')).toBeVisible();

      await page.getByTestId('signal-nav-presence').click();
      await page.getByTestId('quick-command-input').fill('What changed in the report?');
      await page.getByTestId('quick-command-submit').click();
      await expect(page.getByTestId('quick-command-conversation')).toContainText('The report now includes the verified summary.');
      await expect(page.getByTestId('morpheus-quick-command')).toBeVisible();
      expect(page.url()).not.toContain('#/chat');

      await page.getByTestId('quick-command-input').fill('Remember this draft');
      await page.getByTestId('quick-command-expand').click();
      await expect(page.getByTestId('workspace-conversation')).toContainText('The report now includes the verified summary.');
      await expect(page.getByTestId('morpheus-command-input')).toHaveValue('Remember this draft');
      await page.getByTestId('signal-nav-presence').click();
      await expect(page.getByTestId('quick-command-input')).toHaveValue('Remember this draft');
      await page.getByTestId('quick-command-close').click();
      await page.getByTestId('signal-nav-presence').click();
      await expect(page.getByTestId('quick-command-input')).toHaveValue('Remember this draft');

      await page.screenshot({ path: testInfo.outputPath('compact-conversation-reply.png'), animations: 'disabled' });
      const promptCalls = (await fixture.getHostInvocations()).filter((entry) => (
        entry.module === 'chat' && entry.action === 'sendAcpPrompt'
      ));
      expect(promptCalls).toHaveLength(1);
      expect(promptCalls[0]?.payload).toMatchObject({
        sessionKey: SESSION_KEY,
        message: 'What changed in the report?',
      });
    } finally {
      await closeElectronApp(app);
    }
  });
});
