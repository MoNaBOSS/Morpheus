import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Page } from '@playwright/test';

import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

/**
 * Real permission behaviour for the device capabilities, driven through the
 * running application rather than asserted against the policy engine in
 * isolation. The filesystem is checked directly, so a capture is only
 * considered to have happened if a real PNG exists on disk.
 */
function capturesDir(userDataDir: string): string {
  return join(userDataDir, 'morpheus', 'files', 'captures');
}

async function openCommandCenter(page: Page): Promise<void> {
  await expect(page.getByTestId('main-layout')).toBeVisible();
  await expect(page.getByTestId('command-center-page')).toBeVisible();
}

async function useProfile(page: Page, profile: 'balanced' | 'strict' = 'balanced'): Promise<void> {
  await page.getByTestId('sidebar-nav-settings').click();
  await expect(page.getByTestId('settings-permissions-section')).toBeVisible();
  await page.getByTestId(`morpheus-profile-${profile}`).click();
  await expect(page.getByTestId(`morpheus-profile-${profile}`)).toHaveAttribute('data-active', 'true');
  await page.getByTestId('sidebar-nav-command-center').click();
  await expect(page.getByTestId('command-center-page')).toBeVisible();
}

async function runCommand(page: Page, objective: string): Promise<void> {
  await page.getByTestId('morpheus-command-input').fill(objective);
  await page.getByTestId('morpheus-command-submit').click();
  await expect(page.getByTestId('workspace-selected-task')).toContainText(objective);
}

const consentDialog = (page: Page) => page.getByTestId('morpheus-plan-consent-dialog');
const taskState = (page: Page) => page.getByTestId('command-center-objective-state');

test.describe('Morpheus device capability permissions', () => {
  test('a notification runs with no prompt at all under Balanced', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await openCommandCenter(page);
      await useProfile(page);

      await runCommand(page, 'Notify me "Morpheus is ready"');

      await expect(taskState(page)).toHaveText('Complete', { timeout: 20_000 });
      // Low risk: no dialog was ever shown.
      await expect(consentDialog(page)).toHaveCount(0);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('clipboard write asks once, and does NOT grant clipboard read', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    const savedClipboard = await app.evaluate(({ clipboard }) => clipboard.readText());
    try {
      const page = await getStableWindow(app);
      await openCommandCenter(page);
      await useProfile(page);

      await runCommand(page, 'Copy "Morpheus" to the clipboard');
      await expect(consentDialog(page)).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('morpheus-plan-consent-allow-always').click();
      await expect(taskState(page)).toHaveText('Complete', { timeout: 20_000 });

      // A second WRITE is covered by the grant just made.
      await runCommand(page, 'Copy "Second" to the clipboard');
      await expect(taskState(page)).toHaveText('Complete', { timeout: 20_000 });
      await expect(consentDialog(page)).toHaveCount(0);

      // A READ is a different trust scope and must ask again. The clipboard
      // routinely holds passwords copied for an unrelated purpose.
      await runCommand(page, 'Show the clipboard contents');
      await expect(consentDialog(page)).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('morpheus-plan-consent-deny').click();
    } finally {
      await app.evaluate(({ clipboard }, previous) => clipboard.writeText(previous), savedClipboard);
      await closeElectronApp(app);
    }
  });

  test('screen capture asks, writes into the workspace, and shows an indicator', async ({
    launchElectronApp,
    userDataDir,
  }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await openCommandCenter(page);

      await runCommand(page, 'Take a screenshot');
      await expect(consentDialog(page)).toBeVisible({ timeout: 20_000 });

      // The prompt names the real file the image will be written to.
      await expect(page.getByTestId('morpheus-plan-consent-target')).toContainText('captures');

      await page.getByTestId('morpheus-plan-consent-allow-session').click();
      await expect(taskState(page)).toHaveText('Complete', { timeout: 30_000 });

      // Capture is announced where the user is already looking.
      const indicator = page.getByTestId('morpheus-capture-indicator');
      await expect(indicator).toBeVisible();
      await expect(indicator).toHaveAttribute('data-capture-phase', 'captured');

      // A real PNG exists inside the approved workspace, nowhere else.
      const files = readdirSync(capturesDir(userDataDir));
      expect(files.length).toBeGreaterThan(0);
      expect(files.every((name) => name.endsWith('.png'))).toBe(true);
      expect(files.every((name) => name.startsWith('capture-'))).toBe(true);

      // Session grant honoured: the second capture does not prompt.
      await runCommand(page, 'Take a screenshot');
      await expect(taskState(page)).toHaveText('Complete', { timeout: 30_000 });
      await expect(consentDialog(page)).toHaveCount(0);
      expect(readdirSync(capturesDir(userDataDir)).length).toBe(files.length + 1);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('denying a capture writes nothing to disk', async ({ launchElectronApp, userDataDir }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await openCommandCenter(page);

      await runCommand(page, 'Take a screenshot');
      await expect(consentDialog(page)).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('morpheus-plan-consent-deny').click();

      await expect(taskState(page)).toHaveText('Needs clarification', { timeout: 20_000 });
      expect(existsSync(capturesDir(userDataDir))).toBe(false);
      // Nothing ran, so nothing is announced.
      await expect(page.getByTestId('morpheus-capture-indicator')).toHaveCount(0);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('Strict can still require confirmation for each exact application without launching it', async ({
    launchElectronApp,
  }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await openCommandCenter(page);
      // Balanced intentionally auto-runs explicit routine launches. Strict is
      // the deliberate opt-in boundary; denying keeps user applications closed.
      await useProfile(page, 'strict');

      await runCommand(page, 'Open Notepad');
      await expect(consentDialog(page)).toBeVisible({ timeout: 20_000 });
      // Deny: launching a GUI process would leak into later specs. The
      // next command must present its own target, not the previous application's.
      await page.getByTestId('morpheus-plan-consent-deny').click();

      await runCommand(page, 'Open Calculator');
      await expect(consentDialog(page)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('morpheus-plan-consent-target')).toContainText('calc.exe');
      await page.getByTestId('morpheus-plan-consent-deny').click();
    } finally {
      await closeElectronApp(app);
    }
  });
});
