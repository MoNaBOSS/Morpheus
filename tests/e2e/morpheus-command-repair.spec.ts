import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

// Real rendered shell and deterministic Core failure, with no model service,
// microphone or OS action. This is the observed misheard-command repair surface.
test('an unrecognized action asks for a useful correction without showing capability internals', async ({ launchElectronApp }, info) => {
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const page = await getStableWindow(app);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.getByTestId('morpheus-command-input').fill('Open YouTube and SARS for');
    await page.getByTestId('morpheus-command-submit').click();
    await expect(page.getByTestId('command-center-objective-summary')).toHaveText('I didn’t catch the action. Tell me which app or website to use and what you want me to do.');
    await expect(page.getByTestId('command-center-page')).not.toContainText('Currently supported capabilities:');
    await page.getByTestId('signal-nav-presence').click();
    const compact = page.getByTestId('morpheus-quick-command');
    await expect(compact).toContainText('Tell me which app or website to use');
    await expect(compact).not.toContainText('Currently supported capabilities:');
    await expect(page.getByTestId('quick-command-input')).toBeInViewport();
    await expect(page.getByTestId('quick-command-settings')).toBeInViewport();
    await page.screenshot({ path: info.outputPath('actionable-command-repair.png') });
    expect(errors).toEqual([]);
  } finally { await closeElectronApp(app); }
});
