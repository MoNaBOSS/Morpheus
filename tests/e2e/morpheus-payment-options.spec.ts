import { closeElectronApp, expect, getRecordedHostInvocations, getStableWindow, installIpcMocks, test } from './fixtures/electron';

test('plan and payment choices remain honest, aligned and connected to the current conversation', async ({ launchElectronApp }, info) => {
  const app = await launchElectronApp({ skipSetup: true });
  try {
    await installIpcMocks(app, { recordHostInvocations: true });
    const page = await getStableWindow(app);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.getByTestId('morpheus-command-input').fill('Keep my plan-review draft');
    await page.getByTestId('signal-nav-presence').click();
    await page.getByTestId('quick-command-settings').click();
    await page.getByTestId('morpheus-settings-account').click();
    await expect(page.getByTestId('morpheus-payment-unavailable')).toHaveText('Not open yet');
    await expect(page.getByTestId('morpheus-plan-comparison').locator('article')).toHaveCount(3);
    for (const method of ['stripe', 'usdt', 'usdc']) {
      await page.getByTestId(`morpheus-payment-${method}`).click();
      await expect(page.getByTestId(`morpheus-payment-${method}`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('morpheus-payment-details')).toContainText(method === 'stripe' ? 'Stripe' : method.toUpperCase());
      await expect(page.getByTestId('morpheus-payment-details')).toContainText('No checkout or payment address is available');
    }
    for (const width of [1280, 800, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await page.getByTestId('morpheus-plan-comparison').scrollIntoViewIfNeeded();
      await page.getByTestId('morpheus-plan-comparison').locator('article').evaluateAll(async elements => {
        await Promise.all(elements.flatMap(element => element.getAnimations().map(animation => animation.finished)));
      });
      const cards = await page.getByTestId('morpheus-plan-comparison').locator('article').evaluateAll(elements => elements.map(element => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      }));
      for (const card of cards) { expect(card.x).toBeGreaterThanOrEqual(0); expect(card.x + card.width).toBeLessThanOrEqual(width + 1); }
      if (width >= 800) { expect(cards[1].y).toBeCloseTo(cards[0].y, 0); expect(cards[2].height).toBeCloseTo(cards[0].height, 0); }
      else expect(cards[1].y).toBeGreaterThanOrEqual(cards[0].y + cards[0].height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`plan-options-${width}.png`) });
      await page.getByTestId('morpheus-payment-options').scrollIntoViewIfNeeded();
      await expect(page.getByTestId('morpheus-payment-usdt')).toBeInViewport();
      await page.screenshot({ path: info.outputPath(`payment-options-${width}.png`) });
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.getByTestId('morpheus-plan-comparison').locator('article').first()).toHaveCSS('animation-name', 'none');
    await page.getByTestId('morpheus-plan-appearance').click();
    await expect(page.getByTestId('morpheus-settings-personality')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('morpheus-unrestricted-preview')).toBeVisible();
    await page.getByTestId('morpheus-settings-account').click();
    await page.getByTestId('morpheus-plan-connect').click();
    await expect(page.getByTestId('morpheus-settings-connections')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('morpheus-settings-return').click();
    await expect(page.getByTestId('quick-command-input')).toHaveValue('Keep my plan-review draft');
    expect((await getRecordedHostInvocations(app)).filter(call => /checkout|payment|billing|grant/i.test(`${call.module}.${call.action}`))).toEqual([]);
    expect(errors).toEqual([]);
  } finally { await closeElectronApp(app); }
});
