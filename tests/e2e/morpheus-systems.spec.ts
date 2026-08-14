import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

test.describe('Morpheus reusable Systems', () => {
  test('requires a real successful test before activation and preserves sequential Objective execution', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.getByTestId('sidebar-nav-systems').click();
      await expect(page.getByTestId('systems-page')).toBeVisible();

      await page.getByTestId('system-new').click();
      await page.getByTestId('system-name').fill('Verified system brief');
      await page.getByTestId('system-description').fill('Runs the real two-step system brief workflow.');
      await page.getByTestId('system-workflow').selectOption('system-brief');
      await page.getByTestId('system-save').click();

      await expect(page.getByTestId('system-plan')).toContainText('system.report');
      await expect(page.getByTestId('system-plan')).toContainText('system.storage');
      await expect(page.getByTestId('system-activate')).toBeDisabled();
      await expect(page.getByTestId('morpheus-permission-dialog')).toHaveCount(0);

      await page.getByTestId('system-test').click();
      await expect(page.getByText('Tested', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('system-boundary')).toContainText('Completed');
      await expect(page.getByTestId('morpheus-permission-dialog')).toHaveCount(0);

      await page.getByTestId('system-activate').click();
      await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();
      await page.getByTestId('system-run').click();
      await expect(page.getByText('Manual run', { exact: false }).first()).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('system-pause').click();
      await expect(page.getByText('Paused', { exact: true }).first()).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });

  test('converts a completed workflow Mission without retaining renderer-authored authority', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.getByTestId('sidebar-nav-workflows').click();
      await page.getByTestId('workflow-run-system-brief').click();

      await page.getByTestId('sidebar-nav-missions').click();
      await expect(page.getByTestId('mission-detail-status')).toContainText(/completed/i, { timeout: 20_000 });
      await page.getByTestId('mission-create-system').click();
      await expect(page.getByTestId('systems-page')).toBeVisible();
      await expect(page.getByTestId('system-plan')).toContainText('system.report');
      await expect(page.getByTestId('system-boundary')).toContainText('system.storage');
      await expect(page.getByText('Draft', { exact: true }).first()).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });
});
