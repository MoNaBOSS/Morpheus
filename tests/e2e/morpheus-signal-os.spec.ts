import { join } from 'node:path';

import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

const visualEvidenceDir = process.env.MORPHEUS_VISUAL_EVIDENCE_DIR?.trim();

async function capture(page: Awaited<ReturnType<typeof getStableWindow>>, name: string): Promise<void> {
  if (!visualEvidenceDir) return;
  await page.screenshot({ path: join(visualEvidenceDir, name), animations: 'disabled' });
}

async function useBalancedProfile(page: Awaited<ReturnType<typeof getStableWindow>>): Promise<void> {
  await page.getByTestId('sidebar-nav-settings').click();
  await expect(page.getByTestId('settings-permissions-section')).toBeVisible();
  await page.getByTestId('morpheus-profile-balanced').click();
  await expect(page.getByTestId('morpheus-profile-balanced')).toHaveAttribute('data-active', 'true');
  await page.getByTestId('sidebar-nav-command-center').click();
  await expect(page.getByTestId('command-center-page')).toBeVisible();
}

test.describe('Morpheus Signal OS', () => {
  test('presents a compact outcome-first operating surface at 1280x800', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.setViewportSize({ width: 1280, height: 800 });

      await expect(page.getByTestId('morpheus-product-nav')).toBeVisible();
      await expect(page.getByTestId('command-center-page')).toBeVisible();
      await expect(page.getByTestId('signal-command-layout')).toBeVisible();
      await expect(page.getByTestId('signal-mission-phases')).toBeVisible();
      await expect(page.getByTestId('command-center-today')).toBeVisible();
      await expect(page.getByTestId('command-center-context-rail')).toBeVisible();
      await expect(page.getByTestId('signal-os-live-state')).toHaveText(/ready/i);
      await expect(page.getByText(/Give Morpheus an outcome/i)).toBeVisible();
      await expect(page.getByText(/^\s*ClawX\s*$/i)).toHaveCount(0);

      const overflow = await page.getByTestId('command-center-page').evaluate((element) => ({
        horizontal: element.scrollWidth - element.clientWidth,
        vertical: element.scrollHeight - element.clientHeight,
      }));
      expect(overflow.horizontal).toBeLessThanOrEqual(1);
      expect(overflow.vertical).toBeLessThanOrEqual(1);
      await capture(page, 'signal-command-center-1280x800.png');
    } finally {
      await closeElectronApp(app);
    }
  });

  test('keeps Presence, Command Center, and OpenClaw Chat as distinct projections', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.getByTestId('signal-nav-presence').click();
      await expect(page.getByTestId('morpheus-quick-command')).toBeVisible();
      await expect(page.getByTestId('quick-command-status')).toBeVisible();
      await expect(page.getByTestId('morpheus-quick-command').getByTestId('morpheus-signal')).toHaveAttribute('data-signal-state', 'ready');
      await capture(page, 'signal-presence.png');
      await page.getByTestId('quick-command-close').click();

      await page.getByTestId('signal-nav-chat').click();
      await expect(page.getByTestId('chat-page')).toBeVisible();
      await expect(page.getByTestId('sidebar')).toBeVisible();
      await page.getByTestId('sidebar-nav-command-center').click();
      await expect(page.getByTestId('command-center-page')).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });

  test('renders a new plan trust boundary once and keeps denial as keyboard default', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await useBalancedProfile(page);
      await page.getByTestId('morpheus-command-input').fill('Create a text file named signal-trust.txt');
      await page.getByTestId('morpheus-command-submit').click();

      const dialog = page.getByTestId('morpheus-plan-consent-dialog');
      await expect(dialog).toBeVisible({ timeout: 20_000 });
      await expect(dialog.getByTestId('morpheus-signal')).toHaveAttribute('data-signal-state', 'trust');
      await expect(page.getByTestId('morpheus-plan-consent-deny')).toBeFocused();
      await capture(page, 'signal-trust-boundary.png');
      await page.getByTestId('morpheus-plan-consent-deny').click();
      await expect(dialog).toHaveCount(0);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('honours reduced motion without hiding state', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const signal = page.getByTestId('command-center-plan').getByTestId('morpheus-signal');
      await expect(signal).toBeVisible();
      const animations = await signal.locator('*').evaluateAll((elements) => (
        elements.map((element) => getComputedStyle(element).animationName)
      ));
      expect(animations.every((name) => name === 'none')).toBe(true);
    } finally {
      await closeElectronApp(app);
    }
  });
});
