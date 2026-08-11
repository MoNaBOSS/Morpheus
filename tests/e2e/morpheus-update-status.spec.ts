import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

test.describe('Morpheus product and update truthfulness', () => {
  test('shows Morpheus as an execution platform and disables unavailable updates', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });

    try {
      const page = await getStableWindow(app);
      await page.getByTestId('sidebar-nav-settings').click();
      await expect(page.getByTestId('settings-page')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Updates', exact: true })).toBeVisible();
      await expect(page.getByText('Loading...', { exact: true })).toBeHidden({ timeout: 20_000 });

      await expect(page.getByTestId('update-status-text')).toContainText('Updates are not configured');
      await expect(page.getByTestId('update-not-configured-action')).toBeDisabled();
      await expect(page.getByTestId('update-auto-check-toggle')).toBeDisabled();
      await expect(page.getByTestId('update-auto-check-toggle')).not.toBeChecked();

      const settingsPage = page.getByTestId('settings-page');
      await expect(settingsPage).toContainText('AI Execution Platform');
      await expect(settingsPage).toContainText('Morpheus owns planning, permissions, capabilities, and auditability');
      await expect(settingsPage).not.toContainText('Graphical AI Assistant');
    } finally {
      await closeElectronApp(app);
    }
  });
});
