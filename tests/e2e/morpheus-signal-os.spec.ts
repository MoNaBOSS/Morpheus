import { join } from 'node:path';

import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

const visualEvidenceDir = process.env.MORPHEUS_VISUAL_EVIDENCE_DIR?.trim();

test.describe('Morpheus visual presence', () => {
  test('keeps the main workspace simple at 1280x800', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.setViewportSize({ width: 1280, height: 800 });
      await expect(page.getByTestId('command-center-page')).toBeVisible();
      await expect(page.getByTestId('morpheus-fluid-orb')).toHaveAttribute('data-signal-state', 'ready');
      await expect(page.getByTestId('signal-os-live-state')).toHaveText(/ready/i);
      await expect(page.getByTestId('morpheus-command-input')).toBeVisible();
      await expect(page.getByTestId('signal-command-layout')).toHaveCount(0);
      await expect(page.getByTestId('morpheus-runtime-provider')).toHaveCount(0);
      if (visualEvidenceDir) await page.screenshot({ path: join(visualEvidenceDir, 'morpheus-workspace-1280x800.png'), animations: 'disabled' });
    } finally {
      await closeElectronApp(app);
    }
  });

  test('opens compact presence and returns to the same full workspace', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.getByTestId('signal-nav-presence').click();
      await expect(page.getByTestId('morpheus-quick-command')).toBeVisible();
      await expect(page.getByTestId('morpheus-quick-command').getByTestId('morpheus-fluid-orb')).toBeVisible();
      await expect(page.getByText('Ask', { exact: true })).toHaveCount(0);
      await page.getByTestId('quick-command-expand').click();
      await expect(page.getByTestId('command-center-page')).toBeVisible();
      await page.getByTestId('signal-nav-chat').click();
      await expect(page.getByTestId('chat-page')).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });

  test('keeps new permission boundaries visible while the background stays quiet', async ({ launchElectronApp }) => {
    test.skip(process.platform !== 'win32', 'screen.capture is a Windows-only registered capability');
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.getByTestId('morpheus-command-input').fill('Take a screenshot');
      await page.getByTestId('morpheus-command-submit').click();
      const dialog = page.getByTestId('morpheus-plan-consent-dialog');
      await expect(dialog).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('morpheus-plan-consent-deny')).toBeFocused();
      await page.getByTestId('morpheus-plan-consent-deny').click();
      await expect(dialog).toHaveCount(0);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('stops decorative orb motion when reduced motion is requested', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const orb = page.getByTestId('morpheus-fluid-orb');
      await expect(orb).toBeVisible();
      const animation = await orb.evaluate((element) => getComputedStyle(element, '::before').animationName);
      expect(animation).toBe('none');
    } finally {
      await closeElectronApp(app);
    }
  });
});
