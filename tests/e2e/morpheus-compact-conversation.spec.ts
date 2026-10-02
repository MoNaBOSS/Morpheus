import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { composeMorpheusPersonaContext, MORPHEUS_PERSONA_CONTENT_META } from '../../shared/morpheus/persona-context';
import { DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES } from '../../shared/morpheus/onboarding-types';
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
      await fixture.setSessionReplay(SESSION_KEY, [{
        sessionUpdate: 'agent_message_chunk', messageId: 'compact-answer',
        content: { type: 'text', text: 'The report now includes the verified summary.' },
      }]);
      await main!.reload();
      await expect(main!.getByTestId('quick-command-conversation'))
        .toContainText('The report now includes the verified summary.');
      await expect(companion).toHaveAttribute('data-presentation', 'compact-window');
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

const HISTORY_GREETINGS = { en: "What's next?", zh: '接下来做什么？', ja: '次は何をしましょう？', ru: 'Что дальше?' };
for (const language of ['en', 'zh', 'ja', 'ru'] as const) {
  test(`restores existing ${language} history without a new admission or prompt`, async ({ launchElectronApp, userDataDir }, testInfo) => {
    await writeFile(join(userDataDir, 'settings.json'), JSON.stringify({ language }));
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const fixture = await installAttachmentHostFixture(app, {
        sessions: [{ key: SESSION_KEY, title: 'Saved conversation' }],
        language,
      });
      await fixture.setSessionReplay(SESSION_KEY, [{
        sessionUpdate: 'user_message_chunk', messageId: 'saved-user',
        content: { type: 'text', text: composeMorpheusPersonaContext(DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES).instructions,
          _meta: MORPHEUS_PERSONA_CONTENT_META },
      }, {
        sessionUpdate: 'user_message_chunk', messageId: 'saved-user',
        content: { type: 'text', text: 'How are you today?' },
      }, {
        sessionUpdate: 'agent_message_chunk', messageId: 'saved-answer',
        content: { type: 'text', text: 'Your original saved reply is still here.' },
      }]);
      const page = await getStableWindow(app);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.reload();
      await expect(page).toHaveTitle('Morpheus');
      await expect(page.getByRole('heading', { name: HISTORY_GREETINGS[language], exact: true })).toBeVisible();
      await expect(page.getByTestId('workspace-conversation')).toContainText('Your original saved reply is still here.');
      await page.getByTestId('signal-nav-presence').click();
      await expect(page.getByTestId('morpheus-quick-command').getByText(HISTORY_GREETINGS[language], { exact: true })).toBeVisible();
      await expect(page.getByTestId('quick-command-conversation')).toContainText('Your original saved reply is still here.');
      await expect(page.getByTestId('quick-command-conversation')).toContainText('How are you today?');
      await expect(page.getByTestId('quick-command-conversation')).not.toContainText('Morpheus companion presentation context');
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      expect(page.url()).not.toContain('#/chat');
      await page.screenshot({ path: testInfo.outputPath(`restored-${language}.png`), animations: 'disabled' });
      const invocations = await fixture.getHostInvocations();
      expect(invocations.filter((entry) => entry.module === 'chat' && entry.action === 'sendAcpPrompt')).toHaveLength(0);
      expect(invocations.filter((entry) => entry.module === 'morpheus' && entry.action === 'admitAssistantTurn')).toHaveLength(0);
      const loads = invocations.filter((entry) => entry.module === 'chat' && entry.action === 'loadAcpSession');
      expect(loads.length).toBeGreaterThan(0);
      for (const load of loads) expect(load.payload?.createIfMissing).not.toBe(true);
      expect(errors).toEqual([]);
    } finally { await closeElectronApp(app); }
  });
}
