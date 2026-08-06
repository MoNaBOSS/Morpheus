import { closeElectronApp, completeSetup, expect, getStableWindow, test } from './fixtures/electron';

/**
 * Command Center is the product home; Chat is one interface into it. These are
 * the assertions that stop a future change quietly reverting that.
 */
test.describe('Morpheus routing', () => {
  test('root opens the Command Center, not chat', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('main-layout')).toBeVisible();
      await expect(page.getByTestId('command-center-page')).toBeVisible();
      await expect(page.getByTestId('command-center-title')).toBeVisible();
      await expect(page.getByTestId('chat-page')).toHaveCount(0);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('/chat opens chat and keeps it fully reachable', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.getByTestId('sidebar-nav-chat').click();
      await expect(page.getByTestId('chat-page')).toBeVisible();
      await expect(page.getByTestId('command-center-page')).toHaveCount(0);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('New Chat routes to /chat', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('command-center-page')).toBeVisible();

      await page.getByTestId('sidebar-new-chat').click();
      await expect(page.getByTestId('chat-page')).toBeVisible();
      expect(page.url()).toContain('#/chat');
    } finally {
      await closeElectronApp(app);
    }
  });

  test('the 0.1 /dashboard link still resolves to the Command Center', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('main-layout')).toBeVisible();

      await page.evaluate(() => { window.location.hash = '#/dashboard'; });
      await expect(page.getByTestId('command-center-page')).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });

  test('every existing product page remains reachable', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);

      for (const [testId, pageTestId] of [
        ['sidebar-nav-models', 'models-page'],
        ['sidebar-nav-agents', 'agents-page'],
        ['sidebar-nav-channels', 'channels-page'],
        ['sidebar-nav-skills', 'skills-page'],
        ['sidebar-nav-cron', 'cron-page'],
      ] as const) {
        await page.getByTestId(testId).click();
        await expect(page.getByTestId(pageTestId)).toBeVisible({ timeout: 20_000 });
      }
    } finally {
      await closeElectronApp(app);
    }
  });

  test('setup still gates a fresh profile and lands on the Command Center', async ({ launchElectronApp }) => {
    const app = await launchElectronApp();
    try {
      const page = await getStableWindow(app);
      await completeSetup(page);
      await expect(page.getByTestId('command-center-page')).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });
});
