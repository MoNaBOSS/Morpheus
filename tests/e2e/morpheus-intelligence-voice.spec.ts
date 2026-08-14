import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

test.describe('Morpheus production companion intelligence', () => {
  test('projects a durable Goal into Today and routes its next action through Objective Core', async ({ launchElectronApp }) => {
    let app = await launchElectronApp({ skipSetup: true });
    try {
      let page = await getStableWindow(app);
      await page.getByTestId('sidebar-nav-goals').click();
      await expect(page.getByTestId('goals-page')).toBeVisible();

      await page.getByTestId('goal-create').click();
      await page.getByTestId('goal-name').fill('Ship the production companion');
      await page.getByTestId('goal-objective').fill('Keep Morpheus release work moving across real Missions.');
      await page.getByTestId('goal-success').fill('A verified packaged build is ready for personal testing.');
      await page.getByTestId('goal-next-action').fill('Show system information');
      await page.getByTestId('goal-target-date').fill('2020-01-01');
      await page.getByTestId('goal-save').click();
      await expect(page.locator('[data-testid^="goal-list-"]').first()).toContainText('Ship the production companion');

      // A full app restart proves Main-owned durability and regenerates factual attention
      // from the overdue Goal rather than relying on Renderer memory.
      await closeElectronApp(app);
      app = await launchElectronApp({ skipSetup: true });
      page = await getStableWindow(app);
      await expect(page.getByTestId('sidebar-nav-command-center')).toBeVisible();
      await page.getByTestId('sidebar-nav-command-center').click();
      await expect(page.getByTestId('command-center-goal-focus')).toContainText('Ship the production companion');
      await expect(page.getByTestId('command-center-goal-progress')).toHaveAttribute('style', /0%/);
      await expect(page.getByTestId('command-center-today')).toContainText('Show system information');

      await page.locator('[data-testid^="today-act-"]').first().click();
      await expect(page.getByTestId('command-center-objective-state')).toContainText(/complete/i, { timeout: 20_000 });
      await expect(page.getByTestId('command-center-mission').first()).toContainText('Show system information');
    } finally {
      await closeElectronApp(app);
    }
  });

  test('keeps ambient capture off when no compatible transcription provider exists', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.getByTestId('sidebar-nav-settings').click();
      const settings = page.getByTestId('morpheus-voice-settings');
      await settings.scrollIntoViewIfNeeded();
      await expect(settings).toBeVisible();
      await expect(page.getByTestId('morpheus-voice-ambient')).toHaveAttribute('data-state', 'unchecked');

      await page.getByTestId('morpheus-voice-ambient').click();
      await expect(page.getByTestId('morpheus-voice-settings-error')).toContainText(/No compatible transcription provider/i);
      await expect(page.getByTestId('morpheus-voice-ambient')).toHaveAttribute('data-state', 'unchecked');
      await expect(page.getByTestId('morpheus-ambient-voice-indicator')).toHaveCount(0);
    } finally {
      await closeElectronApp(app);
    }
  });
});
