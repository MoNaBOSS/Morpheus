import { join } from 'node:path';
import { closeElectronApp, expect, getStableWindow, installAttachmentHostFixture, test } from './fixtures/electron';

test('approved arrival animates the original logo and keeps real conversation usable at narrow width', async ({ launchElectronApp }, info) => {
  const app = await launchElectronApp({ skipSetup: true });
  let saveVideo: (() => Promise<void>) | undefined;
  try {
    await installAttachmentHostFixture(app, { sessions: [{ key: 'agent:main:main', title: 'Preserved conversation' }] });
    const page = await getStableWindow(app);
    const video = page.video();
    const videoDir = process.env.MORPHEUS_VIDEO_EVIDENCE_DIR;
    if (video && videoDir) saveVideo = () => video.saveAs(join(videoDir, 'approved-arrival-and-conversation.webm'));
    await page.reload();
    await page.setViewportSize({ width: 1280, height: 800 });
    const full = page.getByTestId('command-center-page');
    await expect(full).toBeVisible();
    await expect(full.locator('canvas')).toHaveCount(0);
    // The approved full conversation uses 64 CSS px; the desktop companion
    // remains 56 DIP and is verified in the native shared-motion journey.
    expect((await full.getByTestId('morpheus-fluid-orb').boundingBox())?.width).toBe(64);
    await page.getByTestId('morpheus-open-welcome').click();
    const welcome = page.getByTestId('morpheus-welcome');
    const logo = welcome.locator('.morpheus-motion__mark');
    await expect(logo).toHaveCSS('animation-name', 'morpheus-logo-arrive');
    await expect(logo).toHaveJSProperty('complete', true);
    await expect.poll(() => logo.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
    await expect(welcome.locator('canvas')).toHaveCount(0);
    await expect(welcome).toHaveCSS('opacity', '1');
    await expect.poll(() => logo.evaluate((node) => node.getAnimations().every((animation) => animation.playState === 'finished'))).toBe(true);
    await page.screenshot({ path: info.outputPath('approved-returning-arrival-1280.png') });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(logo).toHaveCSS('animation-name', 'none');
    await page.keyboard.press('Escape');
    await expect(welcome).toHaveCount(0);
    await page.getByTestId('morpheus-command-input').fill('Keep my wording');
    await page.setViewportSize({ width: 320, height: 720 });
    await expect(page.getByTestId('morpheus-command-input')).toBeInViewport();
    expect(await full.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await expect(page.getByTestId('morpheus-command-input')).toHaveValue('Keep my wording');
    await page.screenshot({ path: info.outputPath('approved-conversation-320.png') });
  } finally { await closeElectronApp(app); await saveVideo?.(); }
});

test('compact draft survives idle and contextual settings, with the same conversation after expansion', async ({ launchElectronApp }, info) => {
  test.skip(process.platform !== 'win32', 'Native Windows compact placement');
  const app = await launchElectronApp({ skipSetup: true });
  let saveVideo: (() => Promise<void>) | undefined;
  try {
    const fixture = await installAttachmentHostFixture(app, { sessions: [{ key: 'agent:main:main', title: 'Preserved conversation' }] });
    await fixture.setPromptUpdates('Hello there', [{ sessionUpdate: 'agent_message_chunk', messageId: 'approved-design-reply', content: { type: 'text', text: 'Good to have you here. What shall we do first?' } }]);
    const page = await getStableWindow(app);
    const video = page.video();
    const videoDir = process.env.MORPHEUS_VIDEO_EVIDENCE_DIR;
    if (video && videoDir) saveVideo = () => video.saveAs(join(videoDir, 'approved-compact-continuity.webm'));
    await page.reload();
    await page.getByTestId('signal-nav-presence').click();
    const compact = page.getByTestId('morpheus-quick-command');
    await expect(compact).toBeVisible();
    await page.getByTestId('quick-command-input').fill('Hello there');
    await page.getByTestId('quick-command-submit').click();
    await expect(page.getByTestId('quick-command-conversation')).toContainText('Good to have you here.');
    await page.getByTestId('quick-command-input').fill('A follow-up I am still editing');
    const start = Date.now();
    await expect.poll(() => Date.now() - start, { timeout: 13_000 }).toBeGreaterThan(10_500);
    await expect(compact).toBeVisible();
    await expect(page.getByTestId('quick-command-input')).toHaveValue('A follow-up I am still editing');
    await expect(compact.locator('canvas')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('approved-compact-preserved-draft.png') });
    await page.getByTestId('quick-command-settings').click();
    await expect(page.getByTestId('morpheus-settings-page')).toBeVisible();
    await page.getByTestId('morpheus-voice-more-options').locator('summary').first().click();
    await page.getByTestId('morpheus-voice-caption-mode').selectOption('hidden');
    await page.getByTestId('morpheus-settings-return').click();
    await expect(compact).toBeVisible();
    await expect(page.getByTestId('quick-command-input')).toHaveValue('A follow-up I am still editing');
    await expect(compact).toHaveCSS('pointer-events', 'auto');
    await page.getByTestId('quick-command-settings').click();
    await page.getByTestId('morpheus-voice-more-options').locator('summary').first().click();
    await expect(page.getByTestId('morpheus-voice-caption-mode')).toHaveValue('hidden');
    await page.getByTestId('morpheus-voice-caption-mode').selectOption('automatic');
    await page.getByTestId('morpheus-settings-return').click();
    await expect(compact).toHaveCSS('pointer-events', 'auto');
    await page.getByTestId('quick-command-expand').click();
    await expect(page.getByTestId('morpheus-command-input')).toHaveValue('A follow-up I am still editing');
    await expect(page.getByTestId('workspace-conversation')).toContainText('Good to have you here.');
  } finally { await closeElectronApp(app); await saveVideo?.(); }
});
