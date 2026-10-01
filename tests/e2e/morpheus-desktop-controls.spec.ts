import { build } from 'esbuild';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { MorpheusActionEvent } from '../../shared/morpheus/action-types';
import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

type Fixture = { events: MorpheusActionEvent[]; runtime: import('../../electron/services/morpheus/runtime').MorpheusRuntime };
type FixtureGlobal = typeof globalThis & { windowControlFixture: Fixture };

for (const locale of ['en', 'zh', 'ja', 'ru']) {
test(`real Windows helper observes owned fixture controls through Core in ${locale}`, async ({ launchElectronApp, userDataDir }, testInfo) => {
  test.skip(process.platform !== 'win32', 'Windows native API acceptance');
  const systemRoot = join(userDataDir, 'controlled-system');
  await mkdir(join(systemRoot, 'System32'), { recursive: true });
  const fixtureExe = join(systemRoot, 'System32', 'notepad.exe');
  const powerShell = join(process.env.SystemRoot!, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  // Owned no-document WinForms fixture, not the user's Notepad. Nothing closes,
  // minimizes or types into any user-owned application during this test.
  const compile = `$ErrorActionPreference='Stop'; Add-Type -ReferencedAssemblies System.Windows.Forms -OutputAssembly $env:MORPHEUS_WINDOW_FIXTURE_EXE -OutputType WindowsApplication -TypeDefinition @'
using System; using System.Windows.Forms;
public class TestWindow { [STAThread] public static void Main() { Application.Run(new Form { Text="Morpheus owned window-control fixture", Width=420, Height=220 }); } }
'@`;
  await promisify(execFile)(powerShell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(compile, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15_000, env: { ...process.env, MORPHEUS_WINDOW_FIXTURE_EXE: fixtureExe } });
  const fixture = spawn(fixtureExe, [], { windowsHide: false, stdio: 'ignore' });
  await new Promise<void>((done, fail) => { fixture.once('spawn', done); fixture.once('error', fail); });
  const bundle = join(userDataDir, 'window-production.cjs');
  await build({ stdin: { contents: [
    "export { createWindowControlCapability, runWindowHelper } from './electron/services/morpheus/capabilities/win32/window-control';",
    "export { runMediaHelper } from './electron/services/morpheus/capabilities/win32/media-control';",
    "export { createMorpheusRuntime } from './electron/services/morpheus/runtime';",
    "export { createMorpheusCapabilityRegistry } from './electron/services/morpheus/capability-registry';",
    "export { createMorpheusGrantStore } from './electron/services/morpheus/policy/grant-store';",
    "export { createMorpheusPolicyEngine } from './electron/services/morpheus/policy/policy-engine';",
    "export { createPolicyPermissionGate } from './electron/services/morpheus/policy/permission-gate';",
    "export { createMorpheusAuditSink } from './electron/services/morpheus/audit';",
    "export { createMorpheusRootProvider } from './electron/services/morpheus/roots';",
    "export { createMorpheusWorkspaceStore } from './electron/services/morpheus/workspaces/workspace-store';",
  ].join('\n'), resolveDir: process.cwd(), loader: 'ts' }, outfile: bundle, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], tsconfig: resolve('tsconfig.node.json') });
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const page = await getStableWindow(app);
    await page.evaluate(async (language) => { await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'settings', action: 'set', payload: { key: 'language', value: language } }); }, locale);
    await page.reload();
    const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
    await app.evaluate(async ({ BrowserWindow }, { bundle, userDataDir, systemRoot }) => {
      const f = process.mainModule!.require(bundle);
      const workspaces = f.createMorpheusWorkspaceStore({ userDataDir });
      const roots = f.createMorpheusRootProvider({ userDataDir, workspaces });
      const grants = f.createMorpheusGrantStore({ userDataDir }); grants.setProfile('autonomous');
      const registry = f.createMorpheusCapabilityRegistry();
      registry.register(f.createWindowControlCapability((request: unknown, _env: unknown, signal: AbortSignal) => f.runWindowHelper(request, process.env, signal)));
      const events: MorpheusActionEvent[] = [];
      const main = BrowserWindow.getAllWindows().find((w) => w.getTitle().includes('Morpheus'))!;
      const runtime = f.createMorpheusRuntime({ registry, grants, roots, workspaces,
        audit: f.createMorpheusAuditSink({ auditDir: `${userDataDir}/native-window-audit` }), gate: f.createPolicyPermissionGate(f.createMorpheusPolicyEngine(grants), grants),
        appVersion: 'test', platform: 'win32', env: { SystemRoot: systemRoot },
        emit: (event: MorpheusActionEvent) => { events.push(event); main.webContents.send('morpheus:action-event', event); } });
      (globalThis as FixtureGlobal).windowControlFixture = { runtime, events };
    }, { bundle, userDataDir, systemRoot });
    const timings: Record<string, number> = {};
    for (const operation of ['minimize', 'restore', 'focus']) {
      const started = Date.now();
      const request = await app.evaluate(async (_, operation) => (globalThis as FixtureGlobal).windowControlFixture.runtime.requestAction({ actionId: 'app.controlWindow', params: { applicationKey: 'notepad', operation }, originType: 'quick-command' }), operation);
      await expect.poll(() => app.evaluate((_, runId) => (globalThis as FixtureGlobal).windowControlFixture.events.find((e) => e.runId === runId && ['succeeded', 'failed', 'denied'].includes(e.phase)) ?? null, request.runId), { timeout: 20_000 }).not.toBeNull();
      const terminal = await app.evaluate((_, runId) => (globalThis as FixtureGlobal).windowControlFixture.events.find((e) => e.runId === runId && ['succeeded', 'failed', 'denied'].includes(e.phase))!, request.runId);
      timings[operation] = Date.now() - started;
      if (operation !== 'focus') expect(terminal.phase, JSON.stringify(terminal)).toBe('succeeded');
      else {
        // Windows may deny foreground activation. That must be truthful, never a
        // fake success or AttachThreadInput/global-key bypass of the OS policy.
        if (terminal.phase === 'failed') expect(terminal.error?.message).toContain('not observed');
        else expect(terminal.result).toMatchObject({ kind: 'desktop-control', operation: 'focus', observed: true });
      }
    }
    await testInfo.attach('native-latency', { body: JSON.stringify(timings), contentType: 'application/json' });
    await expect(page.getByTestId('command-center-page')).toBeVisible();
    await expect(page.getByTestId('desktop-control-result').first()).toBeVisible();
    await expect(page.getByTestId('workspace-result')).not.toContainText('observed');
    expect(await page.getByTestId('command-center-page').innerText()).not.toContain('morpheus.actions.appControlWindow');
    expect(await page.title()).toContain('Morpheus'); expect(page.url()).toContain('index.html');
    expect(errors).toEqual([]);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.screenshot({ path: testInfo.outputPath('native-window-result.png') });
    await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows().find((w) => w.getTitle().includes('Morpheus'))!; window.setMinimumSize(380, 500); window.setContentSize(430, 740); });
    await expect(page.getByTestId('desktop-control-result').first()).toBeVisible();
    expect(await page.getByTestId('workspace-result').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('native-window-compact.png') });
    if (locale === 'en') {
      // Inspection only: never change the user's playback or output volume.
      const probe = await app.evaluate(async (_, bundle) => {
        const f = process.mainModule!.require(bundle);
        const output = await f.runMediaHelper({ command: 'inspect', target: 'system-volume' }, process.env);
        const spotify = await f.runMediaHelper({ command: 'inspect', target: 'spotify' }, process.env);
        return { output: { ok: output.ok, level: output.level, code: output.code }, spotify: { ok: spotify.ok, code: spotify.code } };
      }, bundle);
      expect(probe.output.ok, JSON.stringify(probe)).toBe(true);
      expect(probe.output.level).toBeGreaterThanOrEqual(0); expect(probe.output.level).toBeLessThanOrEqual(100);
      expect(probe.spotify.ok || ['no-session', 'ambiguous-session'].includes(probe.spotify.code), JSON.stringify(probe)).toBe(true);
      await testInfo.attach('native-audio-read-only', { body: JSON.stringify(probe), contentType: 'application/json' });
    }
    await app.evaluate(() => (globalThis as FixtureGlobal).windowControlFixture.runtime.dispose());
  } finally {
    fixture.kill(); // Only the exact child owned by this fixture; no process-name termination.
    await closeElectronApp(app);
  }
});
}
