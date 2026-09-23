import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

test('approved workspace presents real work without operator modes', async ({ launchElectronApp }) => {
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const page = await getStableWindow(app);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 800 });

    await expect(page.getByTestId('command-center-page')).toBeVisible();
    await expect(page.getByTestId('morpheus-fluid-orb')).toBeVisible();
    await expect(page.getByTestId('morpheus-command-input')).toBeVisible();
    await expect(page.getByText('Ask', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Auto', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Act', { exact: true })).toHaveCount(0);

    const desktopShot = join(tmpdir(), `morpheus-workspace-desktop-${process.pid}.png`);
    await page.screenshot({ path: desktopShot });
    console.log(`Workspace desktop screenshot: ${desktopShot}`);

    await page.getByTestId('morpheus-command-input').fill('Show system information');
    await page.getByTestId('morpheus-command-submit').click();
    await expect(page.getByTestId('command-center-objective-state')).toContainText(/complete/i, { timeout: 20_000 });
    await expect(page.getByTestId('workspace-result')).toBeVisible();
    await expect(page.getByTestId('morpheus-artifact').first()).toBeVisible();
    const resultShot = join(tmpdir(), `morpheus-workspace-result-${process.pid}.png`);
    await page.screenshot({ path: resultShot });
    console.log(`Workspace result screenshot: ${resultShot}`);

    await page.setViewportSize({ width: 960, height: 750 });
    const referenceShot = join(tmpdir(), `morpheus-workspace-960-${process.pid}.png`);
    await page.screenshot({ path: referenceShot });
    console.log(`Workspace 960 screenshot: ${referenceShot}`);

    await page.setViewportSize({ width: 760, height: 700 });
    await expect(page.getByTestId('morpheus-command-input')).toBeVisible();
    const overflow = await page.getByTestId('command-center-page').evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const compactShot = join(tmpdir(), `morpheus-workspace-narrow-${process.pid}.png`);
    await page.screenshot({ path: compactShot });
    console.log(`Workspace narrow screenshot: ${compactShot}`);
    await page.getByTestId('morpheus-artifact').first().scrollIntoViewIfNeeded();
    await expect(page.getByTestId('morpheus-artifact').first()).toBeInViewport();
    // E2E has no tray: the same guard as the welcome screen must keep Main visible.
    await page.getByTestId('workspace-tray').click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(true);
    expect(pageErrors).toEqual([]);
  } finally {
    await closeElectronApp(app);
  }
});
