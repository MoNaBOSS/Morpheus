import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

async function command(page: import('@playwright/test').Page, text: string): Promise<void> {
  await page.getByTestId('morpheus-command-input').fill(text);
  await page.getByTestId('morpheus-command-submit').click();
}

test.describe('Morpheus task 25 bounded capabilities', () => {
  test('storage inspection is automatic and completes as a real run', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('command-center-page')).toBeVisible();
      await command(page, 'Show disk space');
      const run = page.getByTestId('morpheus-run-card').first();
      await expect(run).toHaveAttribute('data-phase', 'succeeded', { timeout: 20_000 });
      await expect(page.getByTestId('morpheus-plan-consent-dialog')).toHaveCount(0);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('process inspection prompts for its separate disclosure scope, then succeeds', async ({ launchElectronApp }) => {
    test.skip(process.platform !== 'win32', 'process inventory ships a win32 capability only');
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('command-center-page')).toBeVisible();
      await command(page, 'Show running processes');
      await expect(page.getByTestId('morpheus-plan-consent-dialog')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('morpheus-plan-consent-allow-session').click();
      await expect(page.getByTestId('morpheus-run-card').first()).toHaveAttribute('data-phase', 'succeeded', { timeout: 20_000 });
    } finally {
      await closeElectronApp(app);
    }
  });
});
