import { join } from 'node:path';
import { closeElectronApp, expect, test } from './fixtures/electron';

test('a wake presents the real orb without focus theft, then opens compact and full', async ({ launchElectronApp }) => {
  test.skip(process.platform !== 'win32', 'Windows native presence');
  const app = await launchElectronApp({ skipSetup: true, additionalArgs: ['--morpheus-test-wake-orb'] });
  try {
    await expect.poll(() => app.windows().length).toBeGreaterThanOrEqual(2);
    const pages = app.windows();
    const orb = (await Promise.all(pages.map(async (page) => ({ page, title: await page.title() }))))
      .find(({ title }) => title === 'Morpheus presence')?.page;
    const main = (await Promise.all(pages.map(async (page) => ({ page, title: await page.title() }))))
      .find(({ title }) => title === 'Morpheus')?.page;
    expect(orb).toBeDefined();
    expect(main).toBeDefined();
    await expect(orb!.getByRole('link', { name: 'Open Morpheus' })).toBeVisible();
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
      const orbWindow = BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'Morpheus presence');
      return { visible: orbWindow?.isVisible(), focused: orbWindow?.isFocused() };
    })).toEqual({ visible: true, focused: false });
    const evidenceDir = process.env.MORPHEUS_VISUAL_EVIDENCE_DIR;
    if (evidenceDir) await orb!.screenshot({ path: join(evidenceDir, 'native-wake-orb.png') });

    await orb!.getByRole('link', { name: 'Open Morpheus' }).click({ noWaitAfter: true });
    await expect(main!.getByTestId('morpheus-quick-command')).toBeVisible();
    await expect(main!.getByTestId('morpheus-quick-command')).toHaveCSS('opacity', '1');
    if (evidenceDir) await main!.screenshot({ path: join(evidenceDir, 'native-compact-command.png') });
    await expect.poll(() => app.evaluate(({ BrowserWindow, screen }) => {
      const windows = BrowserWindow.getAllWindows();
      const mainWindow = windows.find((window) => window.getTitle() === 'Morpheus');
      const orbWindow = windows.find((window) => window.getTitle() === 'Morpheus presence');
      if (!mainWindow || !orbWindow) return null;
      const compact = mainWindow.getBounds();
      const orbBounds = orbWindow.getBounds();
      const area = screen.getDisplayMatching(orbBounds).workArea;
      return {
        mainVisible: mainWindow.isVisible(), orbVisible: orbWindow.isVisible(),
        offsetX: compact.x - orbBounds.x,
        // Check the requested placement; Windows can trim native frame pixels
        // from the height reported by getBounds after making Main non-resizable.
        offsetY: compact.y - Math.max(area.y + 20, orbBounds.y - Math.min(520, area.height - 40) - 12),
        insideDisplay: compact.x >= area.x && compact.y >= area.y
          && compact.x + compact.width <= area.x + area.width
          && compact.y + compact.height <= area.y + area.height,
      };
    })).toEqual({ mainVisible: true, orbVisible: false, offsetX: 0, offsetY: 0, insideDisplay: true });

    await main!.getByTestId('quick-command-expand').click();
    await expect(main!.getByTestId('morpheus-quick-command')).toBeHidden();
    await expect.poll(() => app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'Morpheus')?.getBounds().width,
    )).toBeGreaterThanOrEqual(960);
  } finally {
    await closeElectronApp(app);
  }
});
