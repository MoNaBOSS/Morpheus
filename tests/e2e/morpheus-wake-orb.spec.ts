import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { closeElectronApp, expect, test } from './fixtures/electron';

type NativeOrbSnapshot = {
  conversationId: string;
  draft: { conversationId: string; revision: number; text: string };
  turns: Array<{ conversationId: string; turnId: string; clientRequestId: string; source: string }>;
};

async function orbSnapshot(orb: Page): Promise<NativeOrbSnapshot> {
  return orb.evaluate(async () => {
    const bridge = (window as unknown as {
      morpheusOrb?: { snapshot: () => Promise<NativeOrbSnapshot> };
    }).morpheusOrb;
    if (!bridge) throw new Error('Native orb bridge unavailable');
    return bridge.snapshot();
  });
}

test('the native orb edits a preserved draft and admits one turn before compact and full', async ({ launchElectronApp }) => {
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
    await expect(orb!.locator('.orb')).toBeVisible();
    await expect(orb!.locator('#orb-input')).toBeEnabled();
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
      const orbWindow = BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'Morpheus presence');
      return { visible: orbWindow?.isVisible(), focused: orbWindow?.isFocused() };
    })).toEqual({ visible: true, focused: false });
    const evidenceDir = process.env.MORPHEUS_VISUAL_EVIDENCE_DIR;
    if (evidenceDir) await orb!.screenshot({ path: join(evidenceDir, 'native-wake-orb.png') });

    // Ambient-off is honestly quiet, but visible presentation must still move.
    const aurora = orb!.locator('.morpheus-motion__aurora');
    await expect(aurora).toHaveCSS('animation-name', 'morpheus-motion-orbit');
    await expect(orb!.locator('html')).toHaveAttribute('data-window-visible', 'true');
    await expect(orb!.locator('.orb')).toHaveAttribute('data-motion-paused', 'false');
    const initialOrbit = await aurora.evaluate((node) => getComputedStyle(node).transform);
    await expect.poll(() => aurora.evaluate((node) => getComputedStyle(node).transform)).not.toBe(initialOrbit);
    await orb!.emulateMedia({ reducedMotion: 'reduce' });
    await expect(aurora).toHaveCSS('animation-name', 'none');
    await orb!.emulateMedia({ reducedMotion: 'no-preference' });

    await orb!.locator('.orb').hover();
    await expect(orb!.locator('.hover-composer')).toHaveCSS('opacity', '1');
    await expect(orb!.locator('#orb-input')).toBeEnabled();
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((item) => item.getTitle() === 'Morpheus presence');
      return { width: window?.getBounds().width, focused: window?.isFocused() };
    })).toEqual({ width: 360, focused: false });
    if (evidenceDir) await orb!.screenshot({ path: join(evidenceDir, 'native-orb-hover-composer.png') });
    await orb!.mouse.move(-10, -10);
    await expect.poll(() => app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().find((item) => item.getTitle() === 'Morpheus presence')?.getBounds().width,
    )).toBe(56);
    await orb!.locator('.orb').hover();
    await expect(orb!.locator('.hover-composer')).toHaveCSS('opacity', '1');

    await orb!.locator('.orb').click();
    await expect(orb!.locator('#orb-input')).toBeFocused();
    const draft = 'Hello from the native companion';
    await orb!.locator('#orb-input').fill(draft);
    await orb!.locator('#orb-input').press('Escape');
    await expect.poll(() => app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().find((item) => item.getTitle() === 'Morpheus presence')?.getBounds().width,
    )).toBe(56);
    await expect.poll(async () => (await orbSnapshot(orb!)).draft.text).toBe(draft);

    await orb!.locator('.orb').click();
    await expect(orb!.locator('#orb-input')).toBeFocused();
    await expect(orb!.locator('#orb-input')).toHaveValue(draft);
    const beforeSubmit = await orbSnapshot(orb!);
    expect(beforeSubmit.draft.conversationId).toBe(beforeSubmit.conversationId);
    expect(beforeSubmit.turns.filter((turn) => turn.source === 'orb')).toHaveLength(0);
    if (evidenceDir) await orb!.screenshot({ path: join(evidenceDir, 'native-orb-editable-draft.png') });

    await orb!.locator('#orb-input').press('Enter');
    await expect(main!.getByTestId('morpheus-quick-command')).toBeVisible();
    await expect(main!.getByTestId('morpheus-quick-command')).toHaveCSS('opacity', '1');
    await expect(main!.getByTestId('quick-command-input')).toBeFocused();
    await expect.poll(async () => {
      const snapshot = await orbSnapshot(orb!);
      return {
        draft: snapshot.draft.text,
        turns: snapshot.turns.filter((turn) => turn.source === 'orb')
          .map((turn) => ({ conversationId: turn.conversationId, requestId: turn.clientRequestId })),
      };
    }).toMatchObject({ draft: '', turns: [{ conversationId: beforeSubmit.conversationId }] });
    const afterSubmit = await orbSnapshot(orb!);
    expect(afterSubmit.turns.filter((turn) => turn.source === 'orb').map((turn) => turn.turnId)).toHaveLength(1);
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
        offsetX: compact.x - (area.x + area.width - Math.min(440, area.width - 32) - 16),
        orbRightGap: area.x + area.width - orbBounds.x - orbBounds.width,
        orbBottomGap: area.y + area.height - orbBounds.y - orbBounds.height,
        // Check the requested placement; Windows can trim native frame pixels
        // from the height reported by getBounds after making Main non-resizable.
        offsetY: compact.y - Math.max(area.y + 16, orbBounds.y - Math.min(400, area.height - 32) - 12),
        insideDisplay: compact.x >= area.x && compact.y >= area.y
          && compact.x + compact.width <= area.x + area.width
          && compact.y + compact.height <= area.y + area.height,
      };
    })).toEqual({ mainVisible: true, orbVisible: false, offsetX: 0, offsetY: 0, orbRightGap: 16, orbBottomGap: 16, insideDisplay: true });

    await main!.getByTestId('quick-command-expand').click();
    await expect(main!.getByTestId('morpheus-quick-command')).toBeHidden();
    await expect.poll(() => app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'Morpheus')?.getBounds().width,
    )).toBeGreaterThanOrEqual(960);

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.getTitle() === 'Morpheus')?.hide());
    await expect(orb!.locator('html')).toHaveAttribute('data-visible', 'true');
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.getTitle() === 'Morpheus presence')?.isVisible()), { timeout: 15_000 }).toBe(false);
    await expect(orb!.locator('.orb')).toHaveAttribute('data-motion-paused', 'true');
    await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows().find(w => w.getTitle() === 'Morpheus'); window?.show(); window?.hide(); });
    await expect(orb!.locator('html')).toHaveAttribute('data-visible', 'true');
    await expect(orb!.locator('body')).toHaveCSS('opacity', '1');
    await expect(orb!.locator('.orb')).toHaveAttribute('data-motion-paused', 'false');
  } finally {
    await closeElectronApp(app);
  }
});
