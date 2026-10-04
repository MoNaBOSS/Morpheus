import { join } from 'node:path';
import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

test('completed work settles into living presence and compact composer retains focus feedback', async ({ launchElectronApp }, info) => {
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const page = await getStableWindow(app);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await expect(page).toHaveTitle('Morpheus');
    await expect(page.locator('vite-error-overlay, nextjs-portal')).toHaveCount(0);
    await page.getByTestId('morpheus-command-input').fill('Show system information');
    await page.getByTestId('morpheus-command-submit').click();
    await expect(page.getByTestId('command-center-objective-state')).toContainText(/complete/i);
    const fullOrb = page.getByTestId('command-center-page').getByTestId('morpheus-fluid-orb');
    await expect(fullOrb).toHaveAttribute('data-motion-state', 'complete');
    const artwork = fullOrb.locator('.morpheus-motion__artwork');
    // Observe after the finite completion acknowledgement. The real result stays
    // selected; the companion must keep quiet movement rather than freeze.
    await expect.poll(() => artwork.evaluate((node) => node.getAnimations().some((animation) =>
      (animation as CSSAnimation).animationName === 'morpheus-motion-core-presence'
      && Number(animation.currentTime) > 1100))).toBe(true);
    const transform = await artwork.evaluate((node) => getComputedStyle(node).transform);
    await expect.poll(() => artwork.evaluate((node) => getComputedStyle(node).transform)).not.toBe(transform);
    await page.screenshot({ path: info.outputPath('completed-living-presence.png') });

    await page.getByTestId('signal-nav-presence').click();
    const compact = page.getByTestId('morpheus-quick-command');
    await expect(compact).toBeVisible();
    await page.getByTestId('quick-command-input').fill('Search YouTube for Mr Beast');
    await expect(page.getByTestId('quick-command-input')).toBeFocused();
    await expect(compact.locator('.morpheus-setup-composer')).toHaveCSS('border-color', 'rgb(133, 245, 185)');
    await expect(page.getByTestId('quick-command-settings')).toBeInViewport();
    await expect(page.getByTestId('quick-command-submit')).toBeInViewport();
    // A quiet composer must not fabricate audio activity.
    await expect(compact.getByTestId('morpheus-audio-meter')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('compact-focused-composer.png') });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(compact.locator('.morpheus-motion__artwork')).toHaveCSS('animation-name', 'none');
    await expect(compact.locator('.morpheus-setup-composer')).toHaveCSS('transition-duration', '0s');
    expect(errors).toEqual([]);
  } finally { await closeElectronApp(app); }
});

test('header identity visibly moves, respects reduced motion and pauses with the hidden window', async ({ launchElectronApp }, info) => {
  const app = await launchElectronApp({ skipSetup: true });
  let saveVideo: (() => Promise<void>) | undefined;
  try {
    const page = await getStableWindow(app);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const videoDir = process.env.MORPHEUS_VIDEO_EVIDENCE_DIR;
    const video = page.video();
    if (video && videoDir) saveVideo = () => video.saveAs(join(videoDir, 'corrected-header-identity.webm'));
    const brand = page.getByTestId('morpheus-open-welcome').getByTestId('morpheus-brand-mark');
    const identity = brand.locator('.morpheus-brand-mark__identity');
    await expect(brand).toBeVisible();
    await expect(brand).toHaveAttribute('data-motion-paused', 'false');
    await expect.poll(() => identity.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
    await expect(identity).toHaveCSS('animation-name', 'morpheus-brand-presence');
    await expect(identity).toHaveCSS('animation-timing-function', 'steps(84)');
    const first = await brand.screenshot();
    await info.attach('actual-size-header-first.png', { contentType: 'image/png', body: first });
    const initial = await identity.evaluate((node) => {
      const matrix = new DOMMatrix(getComputedStyle(node).transform);
      return { scale: Math.hypot(matrix.a, matrix.b), y: matrix.f };
    });
    await expect.poll(() => identity.evaluate((node, previous) => {
      const matrix = new DOMMatrix(getComputedStyle(node).transform);
      return Math.abs(Math.hypot(matrix.a, matrix.b) - previous.scale);
    }, initial)).toBeGreaterThan(.05);
    await info.attach('actual-size-header-second.png', { contentType: 'image/png', body: await brand.screenshot() });

    // The full page stays mounted underneath compact. Its presentation must
    // pause even though the BrowserWindow itself remains visible.
    await page.getByTestId('signal-nav-presence').click();
    const compact = page.getByTestId('morpheus-quick-command');
    await expect(compact).toBeVisible();
    await expect(brand).toHaveAttribute('data-motion-paused', 'true');
    await expect(identity).toHaveCSS('animation-name', 'none');
    expect(await brand.evaluate((node) => node.getAnimations({ subtree: true }).length)).toBe(0);
    await expect(page.getByTestId('command-center-page').getByTestId('morpheus-fluid-orb')).toHaveAttribute('data-motion-paused', 'true');
    await expect(compact.getByTestId('morpheus-fluid-orb')).toHaveAttribute('data-motion-paused', 'false');
    await page.getByTestId('quick-command-expand').click();
    await expect(compact).toHaveCount(0);
    await expect(brand).toHaveAttribute('data-motion-paused', 'false');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(identity).toHaveCSS('animation-name', 'none');
    await expect(identity).toHaveCSS('transform', 'none');
    await expect(identity).toHaveCSS('opacity', '1');
    await expect(identity).toHaveCSS('will-change', 'auto');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'Morpheus')?.hide();
    });
    await expect(brand).toHaveAttribute('data-motion-paused', 'true');
    await expect(identity).toHaveCSS('animation-name', 'none');
    await expect(identity).toHaveCSS('will-change', 'auto');
    const hidden = await brand.evaluate(async (node) => {
      const identity = node.querySelector('.morpheus-brand-mark__identity')!;
      const before = getComputedStyle(identity).transform;
      const animationsBefore = node.getAnimations({ subtree: true }).length;
      await new Promise((resolve) => setTimeout(resolve, 700));
      return { before, after: getComputedStyle(identity).transform, animationsBefore, animationsAfter: node.getAnimations({ subtree: true }).length };
    });
    expect(hidden.animationsBefore).toBe(0);
    expect(hidden.animationsAfter).toBe(0);
    expect(hidden.after).toBe(hidden.before);
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'Morpheus')?.show();
    });
    await expect(brand).toHaveAttribute('data-motion-paused', 'false');
    await expect(identity).toHaveCSS('animation-name', 'morpheus-brand-presence');
    const restoredTransform = await identity.evaluate((node) => getComputedStyle(node).transform);
    await expect.poll(() => identity.evaluate((node) => getComputedStyle(node).transform)).not.toBe(restoredTransform);
    expect(errors).toEqual([]);
  } finally { await closeElectronApp(app); await saveVideo?.(); }
});
