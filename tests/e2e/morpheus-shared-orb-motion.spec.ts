import { join } from 'node:path';
import { closeElectronApp, expect, test } from './fixtures/electron';

test('native and React orb share motion, pause while hidden, and retain a visible attention cue', async ({ launchElectronApp }) => {
  test.skip(process.platform !== 'win32', 'Windows native presence');
  const app = await launchElectronApp({ skipSetup: true, additionalArgs: ['--morpheus-test-wake-orb'] });
  try {
    await expect.poll(() => app.windows().length).toBeGreaterThanOrEqual(2);
    const windows = await Promise.all(app.windows().map(async (page) => ({ page, title: await page.title() })));
    const native = windows.find(({ title }) => title === 'Morpheus presence')?.page;
    const main = windows.find(({ title }) => title === 'Morpheus')?.page;
    expect(native).toBeDefined();
    expect(main).toBeDefined();

    const orb = native!.locator('.orb');
    await expect(orb).toBeVisible();
    await expect(orb).toHaveClass(/morpheus-motion/);
    await expect(orb).toHaveAttribute('data-motion-state', 'idle');
    await expect(orb.locator('.morpheus-motion__halo')).toHaveCSS('animation-name', 'morpheus-motion-breathe');
    expect(await orb.locator('.morpheus-motion__artwork').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((item) => item.getTitle() === 'Morpheus presence');
      return { visible: window?.isVisible(), focused: window?.isFocused(), width: window?.getBounds().width };
    })).toEqual({ visible: true, focused: false, width: 100 });
    const evidenceDir = process.env.MORPHEUS_VISUAL_EVIDENCE_DIR;
    if (evidenceDir) await native!.screenshot({ path: join(evidenceDir, 'shared-motion-native-idle.png') });

    // Presentation fixture: the native observer maps Main's fixed presence enum.
    await native!.evaluate(() => { document.documentElement.dataset.state = 'waiting-for-approval'; });
    await expect(orb).toHaveAttribute('data-motion-state', 'attention');
    await expect(orb.locator('.morpheus-motion__cue')).toHaveText('?');
    await expect(orb).toHaveAttribute('aria-label', /approval/i);
    await native!.evaluate(() => { document.documentElement.dataset.state = 'error'; });
    await expect(orb).toHaveAttribute('data-motion-tone', 'error');
    await expect(orb.locator('.morpheus-motion__cue')).toHaveText('!');
    await expect(native!.locator('#orb-presence-status')).toContainText(/attention/i);
    if (evidenceDir) await native!.screenshot({ path: join(evidenceDir, 'shared-motion-native-attention.png') });
    await native!.evaluate(() => { document.documentElement.dataset.state = 'armed'; });
    await expect(orb).toHaveAttribute('data-motion-state', 'idle');

    // A typed Main presentation event carries the actual scalar to the native
    // surface. The value here is a test input, not a simulated voice recording.
    await main!.evaluate(() => window.clawx.hostInvoke({
      id: crypto.randomUUID(), module: 'morpheus', action: 'setVoiceSpeaking', payload: { speaking: true },
    }));
    await expect(orb).toHaveAttribute('data-motion-state', 'speaking');
    await main!.evaluate(() => window.clawx.hostInvoke({
      id: crypto.randomUUID(), module: 'morpheus', action: 'updatePresentationLevel', payload: { level: 0.6 },
    }));
    await expect.poll(() => orb.evaluate((element) => (element as HTMLElement).style.getPropertyValue('--morpheus-audio-level')))
      .toBe('0.600');
    await expect.poll(() => orb.locator('.morpheus-motion__halo').evaluate((element) => (
      new DOMMatrix(getComputedStyle(element).transform).a
    ))).toBeGreaterThan(1.05);
    if (evidenceDir) await native!.screenshot({ path: join(evidenceDir, 'shared-motion-native-level-fixture.png') });
    await main!.evaluate(() => window.clawx.hostInvoke({
      id: crypto.randomUUID(), module: 'morpheus', action: 'setVoiceSpeaking', payload: { speaking: false },
    }));
    await expect.poll(() => orb.evaluate((element) => (element as HTMLElement).style.getPropertyValue('--morpheus-audio-level')))
      .toBe('0.000');

    await native!.emulateMedia({ reducedMotion: 'reduce' });
    await expect(orb.locator('.morpheus-motion__aurora')).toHaveCSS('animation-name', 'none');
    await expect(orb.locator('.morpheus-motion__halo')).toHaveCSS('animation-name', 'none');

    await orb.click();
    await expect(native!.locator('#orb-input')).toBeFocused();
    await native!.locator('.hover-composer-expand').click();
    const quick = main!.getByTestId('morpheus-quick-command');
    await expect(quick).toBeVisible();
    await expect(quick).toHaveCSS('opacity', '1');
    await expect(orb).toHaveAttribute('data-motion-paused', 'true');
    const reactOrb = quick.getByTestId('morpheus-fluid-orb');
    await expect(reactOrb).toHaveClass(/morpheus-motion/);
    await expect(reactOrb.locator('.morpheus-motion__artwork')).toBeVisible();
    const nativeAurora = await orb.locator('.morpheus-motion__aurora').evaluate((el) => getComputedStyle(el).backgroundImage);
    await expect(reactOrb.locator('.morpheus-motion__aurora')).toHaveCSS('background-image', nativeAurora);
    await main!.emulateMedia({ reducedMotion: 'reduce' });
    await expect(reactOrb.locator('.morpheus-motion__halo')).toHaveCSS('animation-name', 'none');
    if (evidenceDir) await main!.screenshot({ path: join(evidenceDir, 'shared-motion-react-compact.png') });
    await main!.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(reactOrb.locator('.morpheus-motion__halo')).toHaveCSS('animation-name', 'morpheus-motion-breathe');

    // The tray API is guarded in E2E without a real tray. Main's hide event is
    // the same handoff used after a successful tray transfer.
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().find((item) => item.getTitle() === 'Morpheus')?.hide();
    });
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      const mainWindow = windows.find((item) => item.getTitle() === 'Morpheus');
      const orbWindow = windows.find((item) => item.getTitle() === 'Morpheus presence');
      return { mainVisible: mainWindow?.isVisible(), orbVisible: orbWindow?.isVisible(), orbFocused: orbWindow?.isFocused() };
    })).toEqual({ mainVisible: false, orbVisible: true, orbFocused: false });
    await expect(orb).toHaveAttribute('data-motion-paused', 'false');
    await expect(reactOrb).toHaveAttribute('data-motion-paused', 'true');
    await expect(reactOrb.locator('.morpheus-motion__halo')).toHaveCSS('animation-play-state', 'paused');
  } finally {
    await closeElectronApp(app);
  }
});
