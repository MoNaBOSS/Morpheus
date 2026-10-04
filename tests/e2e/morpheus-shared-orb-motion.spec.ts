import { join } from 'node:path';
import { closeElectronApp, expect, test } from './fixtures/electron';

test('native and React orb share motion, pause while hidden, and retain a visible attention cue', async ({ launchElectronApp }, info) => {
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
    // Saved microphone-off state is now truthfully quiet after Main scopes
    // automatic input away from visible chat. Seed presentation only to inspect
    // the idle motion below; this does not grant actual audio authority.
    await expect(orb).toHaveAttribute('data-motion-state', 'quiet');
    await native!.evaluate(() => { document.documentElement.dataset.state = 'armed'; });
    await expect(orb).toHaveAttribute('data-motion-state', 'idle');
    await expect(orb.locator('.morpheus-motion__halo')).toHaveCSS('animation-name', 'morpheus-motion-breathe');
    await expect(orb.locator('.morpheus-motion__halo')).toHaveCSS('animation-timing-function', 'steps(84)');
    const aurora = orb.locator('.morpheus-motion__aurora');
    await expect(aurora).toHaveCSS('animation-name', 'none');
    await expect(aurora).toHaveCSS('will-change', 'auto');
    const initialContour = await aurora.evaluate((node) => ({ radius: getComputedStyle(node).borderRadius, transform: getComputedStyle(node).transform }));
    expect(await aurora.evaluate((node) => getComputedStyle(node).borderRadius)).toBe(initialContour.radius);
    expect(await aurora.evaluate((node) => node.getAnimations().flatMap(animation => (animation.effect as KeyframeEffect).getKeyframes()).some(frame => Object.keys(frame).some(key => /^border.*radius$/i.test(key))))).toBe(false);
    expect(await orb.locator('.morpheus-motion__artwork').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    const artwork = orb.locator('.morpheus-motion__artwork');
    await expect(artwork).toHaveCSS('animation-name', 'morpheus-motion-core-presence');
    await expect(artwork).toHaveCSS('animation-timing-function', 'steps(84)');

    // Actual 56-DIP pixels, excluding the old thin perimeter: movement must
    // reach the central identity, not merely change a CSS animation property.
    const firstFrame = await orb.screenshot();
    const firstTransform = await artwork.evaluate((node) => getComputedStyle(node).transform);
    await expect.poll(async () => {
      const transform = await artwork.evaluate((node) => getComputedStyle(node).transform);
      return Math.abs(new DOMMatrixLike(firstTransform).scale - new DOMMatrixLike(transform).scale);
    }).toBeGreaterThan(0.025);
    const secondFrame = await orb.screenshot();
    const changedCentralPixels = await app.evaluate(({ nativeImage }, frames) => {
      const images = frames.map((frame) => nativeImage.createFromBuffer(Buffer.from(frame, 'base64')));
      const { width, height } = images[0].getSize();
      const pixels = images.map((image) => image.toBitmap());
      let changed = 0;
      let total = 0;
      for (let y = Math.ceil(height * .24); y < height * .76; y += 1) {
        for (let x = Math.ceil(width * .24); x < width * .76; x += 1) {
          const offset = (y * width + x) * 4;
          const difference = [0, 1, 2].reduce((sum, channel) => sum + Math.abs(pixels[0][offset + channel] - pixels[1][offset + channel]), 0);
          if (difference > 24) changed += 1;
          total += 1;
        }
      }
      return changed / total;
    }, [firstFrame.toString('base64'), secondFrame.toString('base64')]);
    expect(changedCentralPixels).toBeGreaterThan(.03);
    expect(await aurora.evaluate((node) => getComputedStyle(node).transform)).toBe(initialContour.transform);
    await info.attach('native-center-motion.json', { contentType: 'application/json', body: JSON.stringify({ changedCentralPixelRatio: changedCentralPixels, excludesPerimeter: true, syntheticPresenceOnly: true }) });
    await info.attach('native-orb-first-actual-size.png', { contentType: 'image/png', body: firstFrame });
    await info.attach('native-orb-second-actual-size.png', { contentType: 'image/png', body: secondFrame });
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find((item) => item.getTitle() === 'Morpheus presence');
      return { visible: window?.isVisible(), focused: window?.isFocused(), width: window?.getBounds().width };
    })).toEqual({ visible: true, focused: false, width: 56 });
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
    await expect(artwork).toHaveCSS('animation-name', 'none');
    await expect.poll(() => artwork.evaluate((node) => node.getAnimations().length)).toBe(0);
    const silentSpeakingTransform = await artwork.evaluate((node) => getComputedStyle(node).transform);
    const halo = orb.locator('.morpheus-motion__halo');
    const silentHaloGeometry = await halo.evaluate((node) => ({ radius: getComputedStyle(node).borderRadius, inset: getComputedStyle(node).inset }));
    const silentObservation = await artwork.evaluate(async (node) => {
      const before = getComputedStyle(node).transform;
      await new Promise((resolve) => setTimeout(resolve, 350));
      return { before, after: getComputedStyle(node).transform };
    });
    expect(silentObservation.after).toBe(silentObservation.before);
    await expect(orb.locator('.morpheus-motion__aurora')).toHaveCSS('animation-name', 'none');
    await main!.evaluate(() => window.clawx.hostInvoke({
      id: crypto.randomUUID(), module: 'morpheus', action: 'updatePresentationLevel', payload: { level: 0.6 },
    }));
    await expect.poll(() => orb.evaluate((element) => (element as HTMLElement).style.getPropertyValue('--morpheus-audio-level')))
      .toBe('0.600');
    await expect.poll(() => orb.locator('.morpheus-motion__halo').evaluate((element) => (
      new DOMMatrix(getComputedStyle(element).transform).a
    ))).toBeGreaterThan(1.05);
    await expect.poll(() => artwork.evaluate((node) => getComputedStyle(node).transform)).not.toBe(silentSpeakingTransform);
    // Real scalar presentation changes only composited pose/opacity, never
    // per-frame border-radius or element insets that force fresh artwork paint.
    expect(await halo.evaluate((node) => ({ radius: getComputedStyle(node).borderRadius, inset: getComputedStyle(node).inset }))).toEqual(silentHaloGeometry);
    await expect(halo).toHaveCSS('transition-property', 'transform, opacity');
    if (evidenceDir) await native!.screenshot({ path: join(evidenceDir, 'shared-motion-native-level-fixture.png') });
    await main!.evaluate(() => window.clawx.hostInvoke({
      id: crypto.randomUUID(), module: 'morpheus', action: 'updatePresentationLevel', payload: { level: 0 },
    }));
    await expect.poll(() => artwork.evaluate((node) => getComputedStyle(node).transform)).toBe(silentSpeakingTransform);
    await expect.poll(() => artwork.evaluate((node) => node.getAnimations().length)).toBe(0);
    await main!.evaluate(() => window.clawx.hostInvoke({
      id: crypto.randomUUID(), module: 'morpheus', action: 'setVoiceSpeaking', payload: { speaking: false },
    }));
    await expect.poll(() => orb.evaluate((element) => (element as HTMLElement).style.getPropertyValue('--morpheus-audio-level')))
      .toBe('0.000');

    await native!.emulateMedia({ reducedMotion: 'reduce' });
    await expect(orb.locator('.morpheus-motion__aurora')).toHaveCSS('animation-name', 'none');
    await expect(orb.locator('.morpheus-motion__halo')).toHaveCSS('animation-name', 'none');
    await expect(artwork).toHaveCSS('animation-name', 'none');
    await expect(artwork).toHaveCSS('transform', 'none');
    await expect(artwork).toHaveCSS('will-change', 'auto');

    await orb.click();
    await expect(native!.locator('#orb-input')).toBeFocused();
    await native!.locator('.hover-composer-expand').click();
    const quick = main!.getByTestId('morpheus-quick-command');
    await expect(quick).toBeVisible();
    await expect(quick).toHaveCSS('opacity', '1');
    await expect(orb).toHaveAttribute('data-motion-paused', 'true');
    await expect(aurora).toHaveCSS('will-change', 'auto');
    // Native remains in reduced-motion mode: no animation exists to pause.
    await expect(artwork).toHaveCSS('animation-name', 'none');
    await expect(artwork).toHaveCSS('will-change', 'auto');
    expect(await orb.evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);
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
    await expect(reactOrb.locator('.morpheus-motion__halo')).toHaveCSS('animation-timing-function', 'steps(84)');
    await expect(reactOrb.locator('.morpheus-motion__aurora')).toHaveCSS('animation-name', 'none');
    await expect(reactOrb.locator('.morpheus-motion__artwork')).toHaveCSS('animation-name', 'morpheus-motion-core-presence');

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
    await expect(reactOrb.locator('.morpheus-motion__aurora')).toHaveCSS('will-change', 'auto');
    await expect(reactOrb.locator('.morpheus-motion__halo')).toHaveCSS('animation-name', 'none');
    await expect(reactOrb.locator('.morpheus-motion__artwork')).toHaveCSS('animation-name', 'none');
    await expect(reactOrb.locator('.morpheus-motion__artwork')).toHaveCSS('will-change', 'auto');
    const hidden = await reactOrb.evaluate(async (node) => {
      const artwork = node.querySelector('.morpheus-motion__artwork')!;
      const before = getComputedStyle(artwork).transform;
      const animationsBefore = node.getAnimations({ subtree: true }).length;
      await new Promise((resolve) => setTimeout(resolve, 700));
      return { before, after: getComputedStyle(artwork).transform, animationsBefore, animationsAfter: node.getAnimations({ subtree: true }).length };
    });
    expect(hidden.animationsBefore).toBe(0);
    expect(hidden.animationsAfter).toBe(0);
    expect(hidden.after).toBe(hidden.before);
  } finally {
    await closeElectronApp(app);
  }
});

/** Read only uniform scale; DOMMatrix itself belongs to the renderer. */
class DOMMatrixLike {
  readonly scale: number;
  constructor(transform: string) {
    const [a = 1, b = 0] = transform.slice(transform.indexOf('(') + 1, -1).split(',').map(Number);
    this.scale = Math.hypot(a, b);
  }
}
