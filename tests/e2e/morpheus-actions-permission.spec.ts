import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { Page } from '@playwright/test';

import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

/**
 * The approved root is derived in Main from `app.getPath('userData')`. The
 * fixture pins userData via CLAWX_USER_DATA_DIR, so the test can assert on the
 * real filesystem rather than trusting the interface.
 */
function morpheusFilesDir(userDataDir: string): string {
  return join(userDataDir, 'morpheus', 'files');
}

async function openDashboard(page: Page): Promise<void> {
  await expect(page.getByTestId('main-layout')).toBeVisible();
  await page.getByTestId('sidebar-nav-dashboard').click();
  await expect(page.getByTestId('dashboard-page')).toBeVisible();
}

test.describe('Morpheus native action permission gate', () => {
  test('denying a file action writes nothing to disk', async ({ launchElectronApp, userDataDir }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await openDashboard(page);

      await page.getByTestId('morpheus-file-name-input').fill('denied-run.txt');
      await page.getByTestId('morpheus-file-content-input').fill('must not be written');
      await page.getByTestId('morpheus-run-action-file.createText').click();

      // The confirmation must name the target Main resolved, not the request.
      await expect(page.getByTestId('morpheus-permission-dialog')).toBeVisible();
      const target = await page.getByTestId('morpheus-permission-target').innerText();
      expect(target).toContain('denied-run.txt');
      expect(target).toContain(join('morpheus', 'files'));

      await page.getByTestId('morpheus-permission-deny').click();

      await expect(page.getByTestId('morpheus-run-card').first()).toHaveAttribute('data-phase', 'denied');
      expect(existsSync(join(morpheusFilesDir(userDataDir), 'denied-run.txt'))).toBe(false);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('allowing a file action creates exactly that file inside the approved root', async ({
    launchElectronApp,
    userDataDir,
  }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await openDashboard(page);

      await page.getByTestId('morpheus-file-name-input').fill('allowed-run.txt');
      await page.getByTestId('morpheus-file-content-input').fill('written by morpheus');
      await page.getByTestId('morpheus-run-action-file.createText').click();

      await expect(page.getByTestId('morpheus-permission-dialog')).toBeVisible();
      await page.getByTestId('morpheus-permission-allow').click();

      await expect(page.getByTestId('morpheus-run-card').first())
        .toHaveAttribute('data-phase', 'succeeded', { timeout: 15_000 });

      const dir = morpheusFilesDir(userDataDir);
      expect(existsSync(join(dir, 'allowed-run.txt'))).toBe(true);
      // Nothing outside the requested leaf was created.
      expect(readdirSync(dir)).toEqual(['allowed-run.txt']);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('a read-only action still requires confirmation and reports real values', async ({
    launchElectronApp,
  }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await openDashboard(page);

      await page.getByTestId('morpheus-run-action-system.report').click();
      await expect(page.getByTestId('morpheus-permission-dialog')).toBeVisible();
      // No target: this action neither writes nor launches.
      await expect(page.getByTestId('morpheus-permission-target')).toBeVisible();

      await page.getByTestId('morpheus-permission-allow').click();
      await expect(page.getByTestId('morpheus-run-card').first())
        .toHaveAttribute('data-phase', 'succeeded', { timeout: 15_000 });
    } finally {
      await closeElectronApp(app);
    }
  });

  test('the timeline records the full real phase sequence', async ({ launchElectronApp }) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await openDashboard(page);
      await expect(page.getByTestId('morpheus-timeline-empty')).toBeVisible();

      await page.getByTestId('morpheus-run-action-system.report').click();
      // Awaiting confirmation is a real emitted phase, visible before any input.
      await expect(page.getByTestId('morpheus-run-card').first())
        .toHaveAttribute('data-phase', 'awaiting-permission');

      await page.getByTestId('morpheus-permission-deny').click();
      await expect(page.getByTestId('morpheus-run-card').first())
        .toHaveAttribute('data-phase', 'denied');
      await expect(page.getByTestId('morpheus-run-card')).toHaveCount(1);
    } finally {
      await closeElectronApp(app);
    }
  });

  test('launching an approved application is confirmed with the resolved executable path', async ({
    launchElectronApp,
  }) => {
    test.skip(process.platform !== 'win32', 'app.launch ships a win32 capability only');
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      await openDashboard(page);

      await page.getByTestId('morpheus-run-action-app.launch').click();
      await expect(page.getByTestId('morpheus-permission-dialog')).toBeVisible();

      const target = await page.getByTestId('morpheus-permission-target').innerText();
      expect(target.toLowerCase()).toContain('system32');
      expect(target.toLowerCase()).toContain('notepad.exe');

      // Deny: the assertion under test is that the resolved path is shown, and
      // leaving a GUI process running would leak into later specs.
      await page.getByTestId('morpheus-permission-deny').click();
      await expect(page.getByTestId('morpheus-run-card').first()).toHaveAttribute('data-phase', 'denied');
    } finally {
      await closeElectronApp(app);
    }
  });
});
