import { closeElectronApp, completeSetup, expect, getStableWindow, test } from './fixtures/electron';

test.describe('Morpheus command center', () => {
  test('opens from the sidebar and shows real system information', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('main-layout')).toBeVisible();

      // The root route must still be Chat.
      await expect(page.getByTestId('chat-page')).toBeVisible();

      await page.getByTestId('sidebar-nav-dashboard').click();
      await expect(page.getByTestId('dashboard-page')).toBeVisible();
      await expect(page.getByTestId('dashboard-page-title')).toBeVisible();

      // System info comes from a real host round-trip, so the values must be
      // populated rather than placeholders.
      await expect(page.getByTestId('morpheus-system-panel')).toBeVisible();
      await expect(page.getByTestId('morpheus-system-platform')).not.toBeEmpty();
      await expect(page.getByTestId('morpheus-system-arch')).not.toBeEmpty();
      const cpuCount = await page.getByTestId('morpheus-system-cpu').innerText();
      expect(Number(cpuCount)).toBeGreaterThan(0);

      // All four command-center sections are present.
      await expect(page.getByTestId('morpheus-launcher-section')).toBeVisible();
      await expect(page.getByTestId('morpheus-timeline-section')).toBeVisible();
      await expect(page.getByTestId('morpheus-audit-section')).toBeVisible();

      // Nothing has run yet.
      await expect(page.getByTestId('morpheus-timeline-empty')).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });

  test('leaves the existing chat route untouched', async ({ launchElectronApp }) => {
    const app = await launchElectronApp();
    try {
      const page = await getStableWindow(app);
      await completeSetup(page);
      await expect(page.getByTestId('chat-page')).toBeVisible();
      await expect(page.getByTestId('sidebar-nav-dashboard')).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });
});
