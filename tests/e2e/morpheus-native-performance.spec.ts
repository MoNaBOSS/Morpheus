import { execFileSync } from 'node:child_process';
import { cpus, release, totalmem } from 'node:os';
import { closeElectronApp, expect, test } from './fixtures/electron';

type OrbProbe = Window & {
  morpheusOrb: { present(action: 'collapse'): Promise<void>; snapshot(): Promise<{ draft: { text: string } }> };
  nativeTiming: { kind: string; start: number; samples: { kind: string; ms: number }[] };
  nativePointerEvents: unknown[];
};

function distribution(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { count: samples.length, p50Ms: sorted[Math.ceil(sorted.length * .5) - 1],
    p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], maxMs: sorted.at(-1), samples };
}

for (const locale of ['en', 'zh', 'ja', 'ru']) {
  test(`collapsed orb click is editable without hover and Escape preserves the draft in ${locale}`, async ({ launchElectronApp }, testInfo) => {
    test.skip(process.platform !== 'win32', 'Windows native presence');
    test.setTimeout(120_000);
    const app = await launchElectronApp({ skipSetup: true, additionalArgs: ['--morpheus-test-wake-orb'] });
    try {
      await expect.poll(() => app.windows().length).toBeGreaterThanOrEqual(2);
      const pages = await Promise.all(app.windows().map(async (page) => ({ page, title: await page.title() })));
      const native = pages.find(({ title }) => title === 'Morpheus presence')!.page;
      const main = pages.find(({ title }) => title === 'Morpheus')!.page;
      const errors: string[] = [];
      native.on('pageerror', (error) => errors.push(error.message));
      native.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      await main.evaluate(async (language) => {
        const response = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'settings', action: 'set', payload: { key: 'language', value: language } });
        if (!response.ok) throw new Error('Cannot set language');
      }, locale);
      await native.reload();
      expect(native.url()).toContain('orb.html');
      expect(await native.title()).toBe('Morpheus presence');
      await expect(native.locator('html')).toHaveAttribute('lang', locale);
      await expect(native.locator('#orb-input')).toBeEnabled();
      await native.evaluate(() => {
        const w = window as unknown as OrbProbe;
        w.nativeTiming = { kind: '', start: 0, samples: [] };
        w.nativePointerEvents = [];
        for (const type of ['pointerenter', 'pointerleave', 'pointermove', 'keydown']) document.addEventListener(type, (event) => {
          const pointer = event as PointerEvent;
          w.nativePointerEvents.push({ type, time: performance.now(), target: (event.target as Element)?.className,
            x: pointer.screenX, y: pointer.screenY, mx: pointer.movementX, my: pointer.movementY,
            hover: document.documentElement.dataset.hover });
          if (w.nativePointerEvents.length > 80) w.nativePointerEvents.shift();
        }, { capture: true });
        const orb = document.querySelector('.orb')!;
        const panel = document.querySelector('.hover-composer')!;
        const measure = (kind: string) => {
          const start = performance.now();
          w.nativeTiming.kind = kind; w.nativeTiming.start = start;
          const frame = () => {
            if (w.nativeTiming.start !== start) return;
            if (!(panel as HTMLElement).inert && Number(getComputedStyle(panel).opacity) > 0
              && (kind !== 'click' || document.activeElement?.id === 'orb-input')) {
              w.nativeTiming.samples.push({ kind, ms: performance.now() - start });
            } else if (performance.now() - start < 2_000) requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        };
        orb.addEventListener('click', () => measure('click'), { capture: true });
        orb.addEventListener('pointerenter', () => measure('hover'), { capture: true });
      });
      const orb = native.locator('.orb');
      const input = native.locator('#orb-input');
      const count = locale === 'en' ? 30 : 5;
      for (let index = 0; index < count; index++) {
        await native.mouse.move(-10, -10);
        // Click directly from the collapsed state, not after waiting out hover.
        await orb.click();
        await expect(input).toBeFocused();
        const text = `${locale} preserved draft ${index}`;
        await input.fill(text);
        await expect.poll(() => native.evaluate(async () => (await (window as unknown as OrbProbe).morpheusOrb.snapshot()).draft.text)).toBe(text);
        await expect.poll(() => native.evaluate(() => (window as unknown as OrbProbe).nativeTiming.samples.filter((sample) => sample.kind === 'click').length)).toBe(index + 1);
        await input.press('Escape');
        await expect(native.locator('html')).toHaveAttribute('data-hover', 'false');
      }
      // Escape cannot be undone by a stale 140ms hover timer; draft is retained.
      await native.waitForTimeout(180);
      await testInfo.attach('native-pointer-events.json', { contentType: 'application/json', body: JSON.stringify(await native.evaluate(() => (window as unknown as OrbProbe).nativePointerEvents)) });
      await expect(native.locator('html')).toHaveAttribute('data-hover', 'false');
      await native.mouse.move(-10, -10);
      await orb.hover();
      await expect(native.locator('.hover-composer')).toHaveCSS('opacity', '1');
      await expect(input).toHaveValue(`${locale} preserved draft ${count - 1}`);
      await native.emulateMedia({ reducedMotion: 'reduce' });
      await expect(orb.locator('.morpheus-motion__halo')).toHaveCSS('animation-name', 'none');
      await native.screenshot({ path: testInfo.outputPath(`native-composer-${locale}.png`) });
      await native.emulateMedia({ reducedMotion: 'no-preference' });

      if (locale === 'en') {
        await native.evaluate(() => { (window as unknown as OrbProbe).nativeTiming.samples = (window as unknown as OrbProbe).nativeTiming.samples.filter((sample) => sample.kind === 'click'); });
        for (let index = 0; index < 30; index++) {
          await native.mouse.move(-10, -10);
          await native.evaluate(() => (window as unknown as OrbProbe).morpheusOrb.present('collapse'));
          await orb.hover();
          await expect.poll(() => native.evaluate(() => (window as unknown as OrbProbe).nativeTiming.samples.filter((sample) => sample.kind === 'hover').length)).toBe(index + 1);
        }
        const samples = await native.evaluate(() => (window as unknown as OrbProbe).nativeTiming.samples);
        // Real active native animation; synthetic state, no mic/provider work.
        await main.evaluate(() => window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'setVoiceSpeaking', payload: { speaking: true } }));
        const frames = await native.evaluate(() => new Promise<number[]>((resolve) => {
          const samples: number[] = []; const start = performance.now(); let previous = start;
          const frame = (now: number) => {
            samples.push(now - previous); previous = now;
            if (now - start < 30_000) requestAnimationFrame(frame); else resolve(samples.slice(1));
          }; requestAnimationFrame(frame);
        }));
        const metadata = await app.evaluate(({ app, screen }) => ({
          versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
          displays: screen.getAllDisplays().map(({ bounds, workArea, scaleFactor }) => ({ bounds, workArea, scaleFactor })),
          processes: app.getAppMetrics().map(({ type, memory }) => ({ type, memory })),
        }));
        const clicks = distribution(samples.filter((s) => s.kind === 'click').map((s) => s.ms));
        const hovers = distribution(samples.filter((s) => s.kind === 'hover').map((s) => Math.max(0, s.ms - 140)));
        const motion = distribution(frames);
        await testInfo.attach('native-performance.json', { contentType: 'application/json', body: JSON.stringify({
          evidence: 'source Electron fixture; Gateway and physical voice inactive; first recorded warm baseline, not packaged or loaded qualification',
          source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
          dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
          cpu: cpus()[0].model, logicalCpus: cpus().length, ramBytes: totalmem(), windows: release(), ...metadata,
          boundary: 'Native renderer event receipt to first painted editable composer frame; click also requires focused input; hover dwell 140ms subtracted',
          click: clicks, hoverAfterDwell: hovers, animationFrameInterval: motion,
          gates: { click100ms: clicks.p95Ms <= 100, hover100ms: hovers.p95Ms <= 100, frame20ms: motion.p95Ms <= 20 },
        }, null, 2) });
        expect(clicks.p95Ms, 'Native click to editable feedback p95').toBeLessThanOrEqual(100);
        expect(hovers.p95Ms, 'Native hover feedback after dwell p95').toBeLessThanOrEqual(100);
        expect(motion.p95Ms, 'Active native frame pacing p95').toBeLessThanOrEqual(20);
      }
      expect(errors).toEqual([]);
    } finally { await closeElectronApp(app); }
  });
}
