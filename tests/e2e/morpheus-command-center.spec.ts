import type { Page } from '@playwright/test';

import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

/** True when the element's box sits entirely inside the viewport height. */
async function isAboveFold(page: Page, testId: string): Promise<boolean> {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) return false;
  const viewport = await page.evaluate(() => window.innerHeight);
  return box.y >= 0 && box.y + box.height <= viewport;
}

test.describe('Morpheus Command Center', () => {
  test('shows identity, command input, runtime, profile and navigation above the fold at 1280x800', async ({
    launchElectronApp,
  }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.setViewportSize({ width: 1280, height: 800 });
      await expect(page.getByTestId('command-center-page')).toBeVisible();

      // Everything a first-time viewer must see without scrolling.
      for (const testId of [
        'command-center-title',
        'morpheus-command-input',
        'morpheus-command-submit',
        'morpheus-voice-button-command-center',
        'morpheus-command-example-website',
        'morpheus-runtime-gateway',
        'morpheus-runtime-provider',
        'morpheus-runtime-profile',
        'signal-os-live-state',
        'signal-mission-phases',
        'command-center-today',
        'command-center-context-rail',
        'signal-nav-chat',
        'signal-nav-missions',
        'signal-nav-systems',
      ]) {
        await expect(page.getByTestId(testId), testId).toBeVisible();
        expect(await isAboveFold(page, testId), `${testId} must be above the fold`).toBe(true);
      }

      // The page itself must not scroll horizontally.
      const overflow = await page.evaluate(() => {
        const element = document.querySelector('[data-testid="command-center-page"]');
        return element ? element.scrollWidth - element.clientWidth : 0;
      });
      expect(overflow).toBeLessThanOrEqual(1);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('makes voice and the provider-backed hero objective immediately discoverable', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('morpheus-voice-button-command-center')).toContainText(/speak to Morpheus/i);

      await page.getByTestId('morpheus-command-example-website').click();
      await expect(page.getByTestId('morpheus-command-input'))
        .toHaveValue('Build a responsive business website and a 30-day launch plan');
    } finally {
      await closeElectronApp(app);
    }
  });

  test('reports runtime and provider truthfully rather than guessing', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('command-center-page')).toBeVisible();

      // Gateway autostart is suppressed under E2E, so the honest state is
      // "stopped" — never a fabricated "ready".
      await expect(page.getByTestId('morpheus-runtime-gateway')).toHaveAttribute('data-ready', 'false');

      // No provider is configured in an isolated profile, and the interface
      // says so instead of inventing a model name.
      await expect(page.getByTestId('morpheus-runtime-provider')).toContainText(/not configured/i);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('shows the active permission profile and runs privacy-safe work without interruption', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('command-center-page')).toBeVisible();

      // Fresh private-alpha profiles begin in operator-first Autonomous mode.
      await expect(page.getByTestId('morpheus-runtime-profile')).toHaveAttribute('data-profile', 'autonomous');

      await page.getByTestId('morpheus-command-input').fill('Show system information');
      await page.getByTestId('morpheus-command-submit').click();
      await expect(page.getByTestId('command-center-objective-state')).toContainText(/complete/i);
      await expect(page.getByTestId('plan-timeline').locator('li').first())
        .toHaveAttribute('data-status', 'succeeded', { timeout: 20_000 });
      await expect(page.getByTestId('signal-mission-timing')).toContainText(/execute/i);
      await expect(page.getByTestId('morpheus-plan-consent-dialog')).toHaveCount(0);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('records real artifacts produced by a trusted command', async ({
    launchElectronApp,
  }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await expect(page.getByTestId('command-center-page')).toBeVisible();

      // The approved location is shown, and no artifacts exist until one is made.
      await expect(page.getByTestId('morpheus-files-root')).toContainText('morpheus');
      await expect(page.getByTestId('morpheus-artifacts-empty')).toBeVisible();

      await page.getByTestId('morpheus-command-input').fill('Create a text file named artifact.txt');
      await page.getByTestId('morpheus-command-submit').click();

      // Autonomous handles first-use routine reversible work in the exact
      // approved workspace without forcing a ceremonial confirmation.
      await expect(page.getByTestId('morpheus-plan-consent-dialog')).toHaveCount(0);

      // The plan panel reports the step outcome, not just the raw event stream.
      await expect(page.getByTestId('plan-timeline').locator('li').first())
        .toHaveAttribute('data-status', 'succeeded', { timeout: 20_000 });

      const artifact = page.getByTestId('morpheus-artifact').first();
      await expect(artifact).toBeVisible();
      await expect(artifact).toHaveAttribute('data-kind', 'file');
      await expect(artifact).toContainText('artifact.txt');
    } finally {
      await closeElectronApp(app);
    }
  });

  test('keeps a pending objective observable and deniable at the visible trust boundary', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.getByTestId('morpheus-command-input').fill('Take a screenshot');
      await page.getByTestId('morpheus-command-submit').click();
      await expect(page.getByTestId('morpheus-plan-consent-dialog')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('morpheus-plan-consent-boundary-screen.capture')).toBeVisible();

      await expect(page.getByTestId('morpheus-command-input')).toBeDisabled();
      await expect(page.getByTestId('morpheus-command-stop')).toBeVisible();
      await page.getByTestId('morpheus-plan-consent-deny').click();

      await expect(page.getByTestId('morpheus-plan-consent-dialog')).toHaveCount(0);
      await expect(page.getByTestId('command-center-objective-state')).toContainText(/needs clarification/i);
    } finally {
      await closeElectronApp(app);
    }
  });
});
