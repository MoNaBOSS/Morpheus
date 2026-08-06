import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Page } from '@playwright/test';

import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

/**
 * The approved root is derived in Main from `app.getPath('userData')`. The
 * fixture pins userData, so these tests assert against the real filesystem
 * rather than trusting the interface.
 */
function morpheusFilesDir(userDataDir: string): string {
  return join(userDataDir, 'morpheus', 'files');
}

async function openCommandCenter(page: Page): Promise<void> {
  await expect(page.getByTestId('main-layout')).toBeVisible();
  await expect(page.getByTestId('command-center-page')).toBeVisible();
}

async function runCommand(page: Page, objective: string): Promise<void> {
  await page.getByTestId('morpheus-command-input').fill(objective);
  await page.getByTestId('morpheus-command-submit').click();
}

const firstCard = (page: Page) => page.getByTestId('morpheus-run-card').first();

test.describe('Morpheus permission engine', () => {
  test('a privacy-safe read runs automatically under Balanced', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await openCommandCenter(page);

      await runCommand(page, 'Show system information');

      // Balanced auto-allows privacy-safe reads: no dialog should ever appear.
      await expect(firstCard(page)).toHaveAttribute('data-phase', 'succeeded', { timeout: 20_000 });
      await expect(page.getByTestId('morpheus-permission-dialog')).toHaveCount(0);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('a write asks the first time and writes nothing when denied', async ({
    launchElectronApp,
    userDataDir,
  }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await openCommandCenter(page);

      await runCommand(page, 'Create a text file named denied-run.txt');

      await expect(page.getByTestId('morpheus-permission-dialog')).toBeVisible({ timeout: 20_000 });
      const target = await page.getByTestId('morpheus-permission-target').innerText();
      expect(target).toContain('denied-run.txt');
      expect(target).toContain(join('morpheus', 'files'));

      await page.getByTestId('morpheus-permission-deny').click();

      await expect(firstCard(page)).toHaveAttribute('data-phase', 'denied');
      expect(existsSync(join(morpheusFilesDir(userDataDir), 'denied-run.txt'))).toBe(false);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('allow once creates the file but is not remembered', async ({
    launchElectronApp,
    userDataDir,
  }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await openCommandCenter(page);

      await runCommand(page, 'Create a text file named once-a.txt');
      await expect(page.getByTestId('morpheus-permission-dialog')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('morpheus-permission-allow-once').click();
      await expect(firstCard(page)).toHaveAttribute('data-phase', 'succeeded', { timeout: 20_000 });

      const dir = morpheusFilesDir(userDataDir);
      expect(existsSync(join(dir, 'once-a.txt'))).toBe(true);
      expect(readdirSync(dir)).toEqual(['once-a.txt']);

      // Same scope, second run: allow-once stored nothing, so it asks again.
      await runCommand(page, 'Create a text file named once-b.txt');
      await expect(page.getByTestId('morpheus-permission-dialog')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('morpheus-permission-deny').click();
    } finally {
      await closeElectronApp(app);
    }
  });

  test('allow for this session suppresses the next prompt for the same scope', async ({
    launchElectronApp,
  }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await openCommandCenter(page);

      await runCommand(page, 'Create a text file named session-a.txt');
      await expect(page.getByTestId('morpheus-permission-dialog')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('morpheus-permission-allow-session').click();
      await expect(firstCard(page)).toHaveAttribute('data-phase', 'succeeded', { timeout: 20_000 });

      // A different file inside the SAME approved root is the same scope.
      await runCommand(page, 'Create a text file named session-b.txt');
      await expect(firstCard(page)).toHaveAttribute('data-phase', 'succeeded', { timeout: 20_000 });
      await expect(page.getByTestId('morpheus-permission-dialog')).toHaveCount(0);

      await expect(page.getByTestId('morpheus-session-grant-count')).toBeVisible();
    } finally {
      await closeElectronApp(app);
    }
  });

  test('revoking the session grant makes the next run ask again', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await openCommandCenter(page);

      await runCommand(page, 'Create a text file named revoke-a.txt');
      await expect(page.getByTestId('morpheus-permission-dialog')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('morpheus-permission-allow-session').click();
      await expect(firstCard(page)).toHaveAttribute('data-phase', 'succeeded', { timeout: 20_000 });

      // Revoke from the Permission Center in Settings.
      await page.getByTestId('sidebar-nav-settings').click();
      await expect(page.getByTestId('settings-permissions-section')).toBeVisible();
      await page.getByTestId('morpheus-revoke-all-session').click();

      await page.getByTestId('sidebar-nav-command-center').click();
      await runCommand(page, 'Create a text file named revoke-b.txt');

      // Revocation takes effect on the next execution, without a restart.
      await expect(page.getByTestId('morpheus-permission-dialog')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('morpheus-permission-deny').click();
    } finally {
      await closeElectronApp(app);
    }
  });

  test('a persistent grant survives a restart', async ({ launchElectronApp }) => {
    const first = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(first);
      await openCommandCenter(page);

      await runCommand(page, 'Create a text file named persist-a.txt');
      await expect(page.getByTestId('morpheus-permission-dialog')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('morpheus-permission-allow-always').click();
      await expect(firstCard(page)).toHaveAttribute('data-phase', 'succeeded', { timeout: 20_000 });
    } finally {
      await closeElectronApp(first);
    }

    // Same isolated profile, new process.
    const second = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(second);
      await openCommandCenter(page);

      await runCommand(page, 'Create a text file named persist-b.txt');
      await expect(firstCard(page)).toHaveAttribute('data-phase', 'succeeded', { timeout: 20_000 });
      await expect(page.getByTestId('morpheus-permission-dialog')).toHaveCount(0);
    } finally {
      await closeElectronApp(second);
    }
  });

  test('launching an approved application confirms the resolved executable', async ({
    launchElectronApp,
  }) => {
    test.skip(process.platform !== 'win32', 'app.launch ships a win32 capability only');
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await openCommandCenter(page);

      await runCommand(page, 'Open Notepad');
      await expect(page.getByTestId('morpheus-permission-dialog')).toBeVisible({ timeout: 20_000 });

      const target = await page.getByTestId('morpheus-permission-target').innerText();
      expect(target.toLowerCase()).toContain('system32');
      expect(target.toLowerCase()).toContain('notepad.exe');

      // Deny: the assertion is that the resolved path is shown, and leaving a
      // GUI process running would leak into later specs.
      await page.getByTestId('morpheus-permission-deny').click();
      await expect(firstCard(page)).toHaveAttribute('data-phase', 'denied');
    } finally {
      await closeElectronApp(app);
    }
  });

  test('an unsupported command is refused truthfully', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await openCommandCenter(page);

      await runCommand(page, 'delete every file on this computer');

      const refusal = page.getByTestId('morpheus-command-unsupported');
      await expect(refusal).toBeVisible();
      // Nothing ran, and no capability was invented.
      await expect(page.getByTestId('morpheus-run-card')).toHaveCount(0);
      await expect(page.getByTestId('morpheus-permission-dialog')).toHaveCount(0);
    } finally {
      await closeElectronApp(app);
    }
  });
});
