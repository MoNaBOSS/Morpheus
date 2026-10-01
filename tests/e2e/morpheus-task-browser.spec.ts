import { build } from 'esbuild';
import { join, resolve } from 'node:path';
import type { MorpheusTaskBrowser } from '../../electron/services/task-browser/session';
import type { MorpheusBrowserCommand, MorpheusBrowserSnapshot } from '../../shared/morpheus/browser-types';
import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

type State = { browser: MorpheusTaskBrowser; controller: AbortController; requests: string[] };
type TestGlobal = typeof globalThis & { taskBrowserFixture: State };
const HTML = `<!doctype html><title>Public library</title><h1>Public library</h1>
<label>Find books<input name="q" type="search"></label>
<button onclick="document.querySelector('h1').textContent='Found '+document.querySelector('input').value">Search</button>
<a href="/next">Next shelf</a><a href="/download" download>Download</a>
<a href="https://other.example/page">Other site</a><a href="/?access_token=secret">Private link</a>
<label>Password<input name="password" type="password"></label>
<select aria-label="Genre"><option value="all">All</option><option value="fiction">Fiction</option></select>
<button onclick="window.open('/popup'); fetch('/write',{method:'POST',body:'bad'}).catch(()=>{}); fetch('http://127.0.0.1/private').catch(()=>{}); fetch('https://other.example/private').catch(()=>{});">Boundary checks</button>`;

test('task-owned Chromium observes and operates real controls without personal account or host access', async ({ launchElectronApp, userDataDir }) => {
  const bundle = join(userDataDir, 'browser-production.cjs');
  await build({ entryPoints: [resolve('electron/services/task-browser/session.ts')], outfile: bundle, bundle: true, platform: 'node', format: 'cjs', external: ['electron'] });
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const main = await getStableWindow(app);
    const mainId = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((window) => window.isVisible())?.id);
    await app.evaluate(async ({ app: _app }, { bundle, html }) => {
      const { createTaskBrowser } = process.mainModule!.require(bundle) as typeof import('../../electron/services/task-browser/session');
      const controller = new AbortController();
      const requests: string[] = [];
      const browser = await createTaskBrowser({ url: 'https://library.example/', signal: controller.signal }, {
        resolveAddresses: async () => [{ address: '93.184.216.34', family: 4 }],
        transport: async (url) => {
          requests.push(url.href);
          return { status: 200, headers: { 'content-type': 'text/html', 'set-cookie': 'account=not-imported' }, body: Buffer.from(url.pathname === '/next' ? '<title>Next</title><h1>Second shelf</h1><a href="/">Back</a>' : html) };
        },
      });
      (globalThis as TestGlobal).taskBrowserFixture = { browser, controller, requests };
    }, { bundle, html: HTML });
    const snapshot = () => app.evaluate(() => (globalThis as TestGlobal).taskBrowserFixture.browser.snapshot());
    const act = (command: MorpheusBrowserCommand) => app.evaluate((_electron, command) => (globalThis as TestGlobal).taskBrowserFixture.browser.act(command), command);
    let observed: MorpheusBrowserSnapshot = await snapshot();
    expect(observed.title).toBe('Public library');
    expect(observed.controls.map((entry) => entry.name)).not.toContain('Password');
    expect(observed.controls.map((entry) => entry.name)).not.toContain('Other site');
    expect(JSON.stringify(observed)).not.toContain('access_token');
    const input = observed.controls.find((entry) => entry.name === 'Find books')!;
    expect(observed.revision).toMatch(/^[a-f0-9-]{36}$/);
    expect(input.ref).toMatch(/^e\d{1,3}$/);
    const stale = observed;
    observed = await act({ kind: 'fill', revision: observed.revision, ref: input.ref, text: 'One Piece' });
    await expect(act({ kind: 'click', revision: stale.revision, ref: stale.controls.find((entry) => entry.name === 'Search')!.ref })).rejects.toThrow('inspect it again');
    observed = await act({ kind: 'click', revision: observed.revision, ref: observed.controls.find((entry) => entry.name === 'Search')!.ref });
    expect(observed.text).toContain('Found One Piece');
    const oldSearch = observed.controls.find((entry) => entry.name === 'Search')!;
    await app.evaluate(async ({ webContents }) => {
      const guest = webContents.getAllWebContents().find((wc) => wc.getURL().startsWith('https://library.example/'))!;
      await guest.executeJavaScript('document.querySelector("button").textContent="Changed button"');
    });
    await expect(act({ kind: 'click', revision: observed.revision, ref: oldSearch.ref })).rejects.toThrow('inspect it again');
    observed = await snapshot();
    await expect(act({ kind: 'click', revision: observed.revision, ref: observed.controls.find((entry) => entry.name === 'Download')!.ref })).rejects.toThrow();
    observed = await snapshot();
    observed = await act({ kind: 'select', revision: observed.revision, ref: observed.controls.find((entry) => entry.name === 'Genre')!.ref, value: 'fiction' });
    observed = await act({ kind: 'click', revision: observed.revision, ref: observed.controls.find((entry) => entry.name === 'Boundary checks')!.ref });
    const isolation = await app.evaluate(async ({ BrowserWindow, webContents }, mainId) => {
      const state = (globalThis as TestGlobal).taskBrowserFixture;
      const guest = webContents.getAllWebContents().find((wc) => wc.getURL().startsWith('https://library.example/'))!;
      return {
        requests: state.requests,
        cookies: await guest.session.cookies.get({}),
        windows: BrowserWindow.getAllWindows().filter((window) => window.webContents.getURL().startsWith('https://library.example/')).length,
        taskVisible: BrowserWindow.fromWebContents(guest)!.isVisible(),
        mainVisible: BrowserWindow.fromId(mainId!)!.isVisible(),
        privileges: await guest.executeJavaScript('({node:typeof process,require:typeof require,bridge:typeof window.clawx})'),
        loopbackProxy: await guest.session.resolveProxy('http://127.0.0.1/private'),
        udp: guest.getWebRTCIPHandlingPolicy(),
      };
    }, mainId);
    expect(isolation.requests.some((url) => /write|private|popup/.test(url))).toBe(false);
    expect(isolation.cookies).toEqual([]);
    expect(isolation.windows).toBe(1);
    expect(isolation.taskVisible).toBe(false);
    expect(isolation.mainVisible).toBe(true);
    expect(isolation.privileges).toEqual({ node: 'undefined', require: 'undefined', bridge: 'undefined' });
    expect(isolation.loopbackProxy).toMatch(/^PROXY 127\.0\.0\.1:\d+$/);
    expect(isolation.udp).toBe('disable_non_proxied_udp');
    observed = await act({ kind: 'press', revision: observed.revision, ref: observed.controls.find((entry) => entry.name === 'Next shelf')!.ref, key: 'Enter' });
    expect(observed.url).toBe('https://library.example/next');
    expect(observed.text).toContain('Second shelf');
    await expect(app.evaluate(() => (globalThis as TestGlobal).taskBrowserFixture.browser.navigate('https://other.example/'))).rejects.toThrow('approved origin');
    await app.evaluate(() => (globalThis as TestGlobal).taskBrowserFixture.controller.abort());
    await expect(snapshot()).rejects.toThrow();
    await expect.poll(() => app.evaluate(({ webContents }) => webContents.getAllWebContents().filter((wc) => wc.getURL().startsWith('https://library.example/')).length)).toBe(0);
    await expect(main.getByTestId('command-center-page')).toBeVisible();
  } finally { await closeElectronApp(app); }
});

test('browser cancellation and denied navigation release their own renderer without changing the companion', async ({ launchElectronApp, userDataDir }) => {
  const bundle = join(userDataDir, 'browser-production.cjs');
  await build({ entryPoints: [resolve('electron/services/task-browser/session.ts')], outfile: bundle, bundle: true, platform: 'node', format: 'cjs', external: ['electron'] });
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const main = await getStableWindow(app);
    const results = await app.evaluate(async ({ webContents }, bundle) => {
      const { createTaskBrowser } = process.mainModule!.require(bundle) as typeof import('../../electron/services/task-browser/session');
      const outcomes: string[] = [];
      for (const kind of ['private-dns', 'cross-origin-redirect', 'deadline', 'dns-deadline'] as const) {
        try {
          await createTaskBrowser({ url: 'https://library.example/', signal: new AbortController().signal, lifetimeMs: kind.includes('deadline') ? 300 : 5000 }, {
            resolveAddresses: async () => kind === 'dns-deadline' ? new Promise(() => {}) : [{ address: kind === 'private-dns' ? '127.0.0.1' : '93.184.216.34', family: 4 }],
            transport: async (_url, _address, signal) => {
              if (kind === 'deadline') await new Promise<void>((_resolve, reject) => {
                signal.addEventListener('abort', () => reject(signal.reason), { once: true });
                if (signal.aborted) reject(signal.reason);
              });
              return { status: 302, headers: { location: 'https://elsewhere.example/' }, body: Buffer.alloc(0) };
            },
          });
          outcomes.push('unexpected-success');
        } catch { outcomes.push(kind); }
      }
      return { outcomes, remaining: webContents.getAllWebContents().filter((wc) => wc.getURL().startsWith('https://library.example/')).length };
    }, bundle);
    expect(results).toEqual({ outcomes: ['private-dns', 'cross-origin-redirect', 'deadline', 'dns-deadline'], remaining: 0 });
    await expect(main.getByTestId('command-center-page')).toBeVisible();
  } finally { await closeElectronApp(app); }
});
