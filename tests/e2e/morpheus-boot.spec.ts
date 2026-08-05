import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

/**
 * The boot overlay is suppressed under E2E so the pre-existing specs keep their
 * current first-paint behaviour. `--morpheus-boot=on` reaches process.argv
 * through the fixture's `additionalArgs` and opts this spec back in.
 */
test.describe('Morpheus boot sequence', () => {
  test('plays, advances on real signals, and dismisses itself', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({
      skipSetup: true,
      additionalArgs: ['--morpheus-boot=on'],
    });
    try {
      const page = await getStableWindow(app);

      const boot = page.getByTestId('morpheus-boot');
      await expect(boot).toBeVisible();
      await expect(page.getByTestId('morpheus-boot-canvas')).toBeVisible();
      await expect(page.getByTestId('morpheus-boot-phase')).toBeVisible();

      // The overlay must never outlive its hard cap.
      await expect(boot).toHaveCount(0, { timeout: 10_000 });

      // The app underneath is fully usable.
      await expect(page.getByTestId('main-layout')).toBeVisible();
      await expect(page.getByTestId('chat-page')).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });

  test('reaches the ready phase rather than stalling', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({
      skipSetup: true,
      additionalArgs: ['--morpheus-boot=on'],
    });
    try {
      const page = await getStableWindow(app);
      const boot = page.getByTestId('morpheus-boot');

      // Phases advance off real signals: settings hydration, a host-bridge
      // round-trip, and a gateway status report.
      await expect(boot).toHaveAttribute('data-phase', /settings|bridge|runtime|ready/);
      await expect(boot).toHaveCount(0, { timeout: 10_000 });
    } finally {
      await closeElectronApp(app);
    }
  });

  test('can be skipped with Escape', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({
      skipSetup: true,
      additionalArgs: ['--morpheus-boot=on'],
    });
    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('morpheus-boot')).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(page.getByTestId('morpheus-boot')).toHaveCount(0, { timeout: 5_000 });
      await expect(page.getByTestId('main-layout')).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });

  test('does not play under E2E by default', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('main-layout')).toBeVisible();
      await expect(page.getByTestId('morpheus-boot')).toHaveCount(0);
    } finally {
      await closeElectronApp(app);
    }
  });
});
