import { closeElectronApp, expect, getStableWindow, installAttachmentHostFixture, test } from './fixtures/electron';

test('simple navigation preserves a draft and retains the full workspace under Advanced', async ({ launchElectronApp }, info) => {
  const app = await launchElectronApp({ skipSetup: true });
  try {
    await installAttachmentHostFixture(app, { sessions: [{ key: 'agent:main:main', title: 'Saved conversation' }] });
    const page = await getStableWindow(app); await page.reload();
    await expect(page.getByTestId('command-center-page')).toBeVisible();
    await page.getByTestId('morpheus-command-input').fill('Keep my draft across settings');
    await page.getByTestId('signal-nav-chat').click();
    await expect(page.getByTestId('morpheus-conversation-history')).toBeVisible();
    await expect(page.getByTestId('chat-composer-input')).toHaveCount(0);
    await page.getByTestId('signal-nav-chat').click();
    await page.getByTestId('sidebar-nav-settings').click();
    await expect(page.getByTestId('morpheus-settings-page')).toBeVisible();
    await expect(page.getByTestId('morpheus-settings-connections')).toBeVisible();
    await page.getByTestId('morpheus-settings-voice').click();
    await expect(page.getByTestId('morpheus-microphone-device')).toBeVisible();
    await expect(page.getByTestId('morpheus-voice-preview')).toBeVisible();
    await page.screenshot({ path: info.outputPath('voice-setup.png') });
    await page.getByTestId('morpheus-settings-return').click();
    await expect(page.getByTestId('morpheus-command-input')).toHaveValue('Keep my draft across settings');
    await expect(page.getByTestId('command-center-page').locator('..')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: info.outputPath('simple-conversation.png') });
    await page.getByTestId('sidebar-nav-settings').click();
    await page.getByTestId('morpheus-settings-advanced').click();
    await page.getByTestId('morpheus-advanced-chat').click();
    await expect(page.getByTestId('chat-composer-input')).toBeVisible();
    await expect(page.getByTestId('sidebar-nav-skills')).toBeVisible();
  } finally { await closeElectronApp(app); }
});
