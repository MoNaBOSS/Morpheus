import { build } from 'esbuild';
import { join, resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
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

test('opt-in real public Chromium GET uses the production network with no profile, bridge or cookies', async ({ launchElectronApp, userDataDir }, testInfo) => {
  test.skip(process.env.MORPHEUS_PUBLIC_QUALIFICATION !== '1', 'Explicit public network qualification only');
  const bundle = join(userDataDir, 'browser-public-production.cjs');
  await build({ stdin: { contents: `export { createTaskBrowser } from './electron/services/task-browser/session'; export { requestPinnedPublicSource } from './electron/services/public-source-worker-adapter';`, resolveDir: process.cwd(), loader: 'ts' }, outfile: bundle, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], tsconfig: resolve('tsconfig.node.json') });
  const app = await launchElectronApp({ skipSetup: true });
  try {
    await getStableWindow(app);
    const result = await app.evaluate(async ({ BrowserWindow, webContents }, bundle) => {
      const { createTaskBrowser, requestPinnedPublicSource } = process.mainModule!.require(bundle) as typeof import('../../electron/services/task-browser/session') & typeof import('../../electron/services/public-source-worker-adapter');
      const controller = new AbortController();
      const network = { requests: 0, bytes: 0 };
      const browser = await createTaskBrowser({ url: 'https://example.org/', signal: controller.signal, lifetimeMs: 30_000 }, {
        // Observe real production transport; no response, DNS or TLS fixture.
        transport: async (...args) => {
          network.requests += 1;
          const response = await requestPinnedPublicSource(...args);
          network.bytes += response.body.length;
          return response;
        },
      });
      try {
        const observation = await browser.snapshot();
        const guest = webContents.getAllWebContents().find((wc) => wc.getURL() === observation.url)!;
        const publicGuide = await createTaskBrowser({ url: 'https://www.iana.org/help/example-domains', signal: controller.signal, lifetimeMs: 30_000 });
        try {
          const before = await publicGuide.snapshot();
          const link = before.controls.find((control) => control.kind === 'link' && control.name === 'IANA-managed Reserved Domains');
          if (!link) throw new Error('The public reference link changed; inspect the source before changing this qualification');
          const after = await publicGuide.act({ kind: 'click', revision: before.revision, ref: link.ref });
          return { observation, network, cookies: await guest.session.cookies.get({}), visible: BrowserWindow.fromWebContents(guest)!.isVisible(),
            privileges: await guest.executeJavaScript('({node:typeof process,require:typeof require,bridge:typeof window.clawx})'),
            interaction: { kind: 'click', control: link.name, beforeUrl: before.url, afterUrl: after.url, title: after.title, text: after.text } };
        } finally { await publicGuide.close(); }
      } finally { await browser.close(); }
    }, bundle);
    expect(result.observation.url).toBe('https://example.org/');
    expect(result.observation.title).toBe('Example Domain');
    expect(result.observation.text).toContain('documentation');
    expect(result.network.requests).toBeGreaterThan(0);
    expect(result.network.bytes).toBeGreaterThan(0);
    expect(result.cookies).toEqual([]);
    expect(result.visible).toBe(false);
    expect(result.privileges).toEqual({ node: 'undefined', require: 'undefined', bridge: 'undefined' });
    expect(result.interaction).toMatchObject({ kind: 'click', beforeUrl: 'https://www.iana.org/help/example-domains', afterUrl: 'https://www.iana.org/domains/reserved' });
    expect(result.interaction.title).toBe('IANA-managed Reserved Domains');
    expect(result.interaction.text).toContain('example');
    expect(await app.evaluate(({ webContents }) => webContents.getAllWebContents().filter((wc) => ['https://example.org', 'https://www.iana.org'].some((origin) => wc.getURL().startsWith(origin))).length)).toBe(0);
    await mkdir(testInfo.outputDir, { recursive: true });
    await writeFile(testInfo.outputPath('public-browser-qualification.json'), JSON.stringify({ passed: true, realPublicNetwork: true,
      providerCalls: 0, verifiedAt: new Date().toISOString(), ...result }, null, 2));
  } finally { await closeElectronApp(app); }
});

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

test('production Core executes task-bound browser plans and audits observations without page text', async ({ launchElectronApp, userDataDir }) => {
  const bundle = join(userDataDir, 'browser-core.cjs');
  const modules = {
    createMorpheusRuntime: 'electron/services/morpheus/runtime.ts',
    createMorpheusWorkerPort: 'electron/services/morpheus/workers/worker-port.ts',
    createMorpheusWorkerCheckpoints: 'electron/services/morpheus/workers/worker-checkpoints.ts',
    createMorpheusCapabilityRegistry: 'electron/services/morpheus/capability-registry.ts',
    createMorpheusAuditSink: 'electron/services/morpheus/audit.ts',
    createMorpheusGrantStore: 'electron/services/morpheus/policy/grant-store.ts',
    createMorpheusPolicyEngine: 'electron/services/morpheus/policy/policy-engine.ts',
    createPolicyPermissionGate: 'electron/services/morpheus/policy/permission-gate.ts',
    createBrowserWorkerAdapter: 'electron/services/task-browser/worker-adapter.ts',
    createTaskBrowser: 'electron/services/task-browser/session.ts',
  };
  await build({ stdin: { contents: Object.entries(modules).map(([name, path]) => `export { ${name} } from ${JSON.stringify(resolve(path))};`).join('\n'), resolveDir: process.cwd(), loader: 'ts' }, outfile: bundle, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], tsconfig: resolve('tsconfig.node.json') });
  const app = await launchElectronApp({ skipSetup: true });
  try {
    await getStableWindow(app);
    const result = await app.evaluate(async ({ webContents }, { bundle, userDataDir, html }) => {
      const factories = process.mainModule!.require(bundle);
      const root = process.mainModule!.require('node:path').join(userDataDir, 'browser-core-fixture');
      const audit = factories.createMorpheusAuditSink({ auditDir: root });
      const adapter = factories.createBrowserWorkerAdapter({ createBrowser: (input: Parameters<typeof import('../../electron/services/task-browser/session').createTaskBrowser>[0]) => factories.createTaskBrowser(input, {
        resolveAddresses: async () => [{ address: '93.184.216.34', family: 4 }],
        transport: async (url: URL) => ({ status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from(url.pathname === '/next' ? '<title>Next</title><h1>Second shelf</h1>' : html) }),
      }) });
      const port = factories.createMorpheusWorkerPort({ adapter, audit, checkpoints: factories.createMorpheusWorkerCheckpoints(root), appVersion: 'test' });
      const grants = factories.createMorpheusGrantStore({ userDataDir: root });
      grants.setProfile('autonomous');
      const roots: import('../../electron/services/morpheus/roots').MorpheusRootProvider = { resolve: () => root, forWorkspace: () => roots };
      const runtime: import('../../electron/services/morpheus/runtime').MorpheusRuntime = factories.createMorpheusRuntime({ registry: factories.createMorpheusCapabilityRegistry(), workerPort: port, audit, roots, grants, gate: factories.createPolicyPermissionGate(factories.createMorpheusPolicyEngine(grants), grants), appVersion: 'test', emit: () => {} });
      const run = async (id: string, action: 'browser.inspect' | 'browser.interact', params: Record<string, string>) => {
        runtime.registerPlan({ v: 1, planId: id, createdAt: new Date().toISOString(), objective: 'Find the second shelf', origin: { type: 'command-bar', commandText: 'Find the second shelf' }, status: 'draft', plannedBy: 'provider', steps: [{ stepId: 'step', capabilityId: action, params, dependsOn: [], summaryKey: 'test', permission: { capabilityId: action, platform: 'win32', resourceScope: 'https://library.example', riskTier: action === 'browser.inspect' ? 'low' : 'medium', mandatoryConfirmation: false } }] });
        return runtime.executePlan({ planId: id }, { workerOwner: { objectiveRunId: 'browser-core-objective', attemptId: id, cancellationGeneration: 1 } });
      };
      try {
        const first = await run('inspect-plan', 'browser.inspect', { url: 'https://library.example/' });
        const artifact = first.steps[0]?.artifact;
        if (artifact?.kind !== 'report' || !artifact.data.browserSnapshot) return { first, error: 'missing-observation' };
        const observed = JSON.parse(String(artifact.data.browserSnapshot)) as MorpheusBrowserSnapshot;
        const next = observed.controls.find((control) => control.name === 'Next shelf')!;
        const second = await run('interact-plan', 'browser.interact', { url: observed.url, sessionId: observed.sessionId, command: JSON.stringify({ kind: 'click', revision: observed.revision, ref: next.ref }) });
        await runtime.releaseWorkerOwner!('browser-core-objective');
        const history = await runtime.auditRecent({ limit: 100 });
        return { first: first.status, second: second.status, artifact: second.steps[0]?.artifact, history: JSON.stringify(history), remaining: webContents.getAllWebContents().filter((wc) => wc.getURL().startsWith('https://library.example')).length };
      } finally { runtime.dispose(); }
    }, { bundle, userDataDir, html: HTML });
    expect(result.first).toBe('completed');
    expect(result.second).toBe('completed');
    expect(result.artifact).toMatchObject({ kind: 'report', data: { title: 'Next', excerpt: 'Second shelf' } });
    expect(result.history).not.toMatch(/Second shelf|Public library|Find books|browserSnapshot/);
    expect(result.history).toContain('browser.interact');
    expect(result.remaining).toBe(0);
  } finally { await closeElectronApp(app); }
});
