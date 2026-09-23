import type { Page } from '@playwright/test';

import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

async function isAboveFold(page: Page, testId: string): Promise<boolean> {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) return false;
  const viewport = await page.evaluate(() => window.innerHeight);
  return box.y >= 0 && box.y + box.height <= viewport;
}

test.describe('Morpheus workspace', () => {
  test('shows the approved orb, voice and text input above the fold', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.setViewportSize({ width: 1280, height: 800 });
      for (const testId of [
        'command-center-title', 'morpheus-fluid-orb', 'morpheus-command-input',
        'morpheus-command-submit', 'morpheus-voice-button-command-center',
        'signal-nav-presence',
      ]) {
        await expect(page.getByTestId(testId), testId).toBeVisible();
        await expect.poll(() => isAboveFold(page, testId)).toBe(true);
      }
      await expect(page.getByTestId('morpheus-product-nav')).toHaveCount(0);
      await expect(page.getByText('Ask', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Auto', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Act', { exact: true })).toHaveCount(0);
      const overflow = await page.getByTestId('command-center-page').evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('projects a real direct task and artifact into conversation and result', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.getByTestId('morpheus-command-input').fill('Show system information');
      await page.getByTestId('morpheus-command-submit').click();
      await expect(page.getByTestId('command-center-objective-state')).toContainText(/complete/i, { timeout: 20_000 });
      await expect(page.getByTestId('workspace-result')).toBeVisible();
      await expect(page.getByTestId('morpheus-artifact').first()).toBeVisible();
      await expect(page.getByTestId('morpheus-command-input')).toBeEnabled();
      await expect(page.getByTestId('morpheus-plan-consent-dialog')).toHaveCount(0);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('keeps a new screenshot permission request observable and deniable', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.getByTestId('morpheus-command-input').fill('Take a screenshot');
      await page.getByTestId('morpheus-command-submit').click();
      await expect(page.getByTestId('morpheus-plan-consent-dialog')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('morpheus-plan-consent-boundary-screen.capture')).toBeVisible();
      await page.getByTestId('morpheus-plan-consent-deny').click();
      await expect(page.getByTestId('morpheus-plan-consent-dialog')).toHaveCount(0);
      await expect(page.getByTestId('morpheus-command-input')).toBeEnabled();
    } finally {
      await closeElectronApp(app);
    }
  });
});
