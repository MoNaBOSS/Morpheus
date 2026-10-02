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
    await page.locator('a[href$="/settings/advanced?section=voice"]').click();
    await expect(page.getByTestId('morpheus-voice-engine')).toHaveValue('local');
    await expect(page.getByTestId('morpheus-voice-provider')).toHaveCount(0);
    await page.getByTestId('morpheus-voice-engine').selectOption('provider');
    await expect(page.getByTestId('morpheus-voice-provider')).toBeVisible();
    await page.getByTestId('morpheus-voice-engine').selectOption('local');
    await expect(page.getByTestId('morpheus-voice-provider')).toHaveCount(0);
    await page.getByTestId('sidebar-nav-settings').click();
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

test('a typed clarification holds compact open while the microphone is muted', async ({ launchElectronApp }) => {
  test.skip(process.platform !== 'win32', 'Windows native compact presence');
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const page = await getStableWindow(app);
    await page.evaluate(async () => {
      const response = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'updateVoiceSettings', payload: { enabled: false, ambientEnabled: false } });
      if (!response.ok) throw new Error('Could not mute test microphone');
    });
    await page.getByTestId('signal-nav-presence').click();
    await expect(page.getByTestId('morpheus-quick-command')).toHaveAttribute('data-presentation', 'compact-window');
    await page.getByTestId('quick-command-input').fill('the website thing');
    await page.getByTestId('quick-command-submit').click();
    const started = Date.now();
    await expect.poll(async () => Date.now() - started >= 11_000 && await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.getTitle() === 'Morpheus')?.isVisible()), { timeout: 15_000 }).toBe(true);
    await expect(page.getByTestId('morpheus-quick-command')).toBeVisible();
  } finally { await closeElectronApp(app); }
});
