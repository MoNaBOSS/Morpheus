import { build } from 'esbuild';
import { join, resolve } from 'node:path';
import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';
import type { MorpheusVoiceService } from '../../electron/services/morpheus/voice/voice-service';

type Fixture = { service: MorpheusVoiceService; pending: boolean; requests: string[]; captureCount: number; speaking: boolean[];
  invalidate(): void; close(): void };
type Globals = typeof globalThis & { managedVoiceFixture: Fixture };

for (const locale of ['en', 'zh', 'ja', 'ru']) {
test(`managed voice uses existing capture/playback and stops on invalidation in ${locale}`, async ({ launchElectronApp, userDataDir }, testInfo) => {
  const bundle = join(userDataDir, 'managed-voice-production.cjs');
  await build({ stdin: { contents: [
    "export { createMorpheusVoiceService } from './electron/services/morpheus/voice/voice-service';",
    "export { createManagedClient } from './electron/services/morpheus/managed/managed-client';",
    "export { createManagedRuntimeBridge } from './electron/services/morpheus/managed/runtime-bridge';",
    "export { createManagedGateway } from './services/managed/gateway';",
    "export { createManagedProviderRoutes } from './services/managed/provider-routes';",
    "export { ManagedLedger } from './services/managed/ledger';",
  ].join('\n'), loader: 'ts', resolveDir: process.cwd() }, outfile: bundle, bundle: true, platform: 'node', format: 'cjs',
    external: ['electron'], tsconfig: resolve('tsconfig.node.json') });
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const page = await getStableWindow(app);
    const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
    const consoleErrors: string[] = []; page.on('console', (entry) => { if (entry.type() === 'error') consoleErrors.push(entry.text()); });
    await page.evaluate(async (language) => { await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'settings', action: 'set', payload: { key: 'language', value: language } }); }, locale);
    await app.evaluate(async ({ ipcMain, BrowserWindow }, { bundle, userDataDir }) => {
      const f = process.mainModule!.require(bundle);
      const window = BrowserWindow.getAllWindows().find((w) => w.getTitle().includes('Morpheus'))!;
      window.webContents.setAudioMuted(true); // Synthetic output must not play through the user's speakers.
      const ledger = new f.ManagedLedger(':memory:');
      ledger.grant({ grantId: 'trial', accountId: 'fixture', tier: 'trial', amountMicroUsd: 100_000, expiresAt: Date.now() + 120_000, features: ['transcription', 'speech'] });
      const state = { pending: false, requests: [] as string[], captureCount: 0, speaking: [] as boolean[] };
      const gateway = f.createManagedGateway({ ledger, identity: { verify: async () => ({ accountId: 'fixture' }) },
        routes: f.createManagedProviderRoutes({ baseUrl: 'https://provider.test/v1', apiKey: 'fixture-only', routes: [
          { id: 'transcription', kind: 'transcription', modelId: 'fixture-stt', rateVersion: 'rates', microUsdPerMinute: 60_000, maxDurationMs: 30_000 },
          { id: 'speech', kind: 'speech', modelId: 'fixture-tts', rateVersion: 'rates', voices: ['cedar'], supportsInstructions: true, pricing: { unit: 'unknown', maximumMicroUsd: 1_000 } },
        ], fetch: async (url: URL, init: RequestInit) => {
          state.requests.push(String(url));
          if (String(url).endsWith('/transcriptions')) {
            const blob = (init.body as FormData).get('file') as Blob;
            const bytes = Buffer.from(await blob.arrayBuffer());
            if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.readUInt32LE(24) !== 16000) throw new Error('Expected locally converted PCM16 WAV');
            state.captureCount++;
            return Response.json({ text: 'Open Notepad' });
          }
          const pcm = new Uint8Array(96_000);
          if (!state.pending) return new Response(pcm);
          return new Response(new ReadableStream<Uint8Array>({ start(controller) {
            controller.enqueue(pcm.subarray(0, 24000));
            init.signal!.addEventListener('abort', () => controller.error(new Error('Cancelled fixture')), { once: true });
          } }));
        } }) });
      const client = f.createManagedClient({ origin: 'https://managed.test', sessions: {
        get: async () => ({ accountId: 'fixture', accessToken: 'fixture-session', expiresAt: Date.now() + 120_000 }), set: async () => {}, clear: async () => {},
      }, fetch: (url: URL, init: RequestInit) => gateway(new Request(String(url), init)) });
      const bridge = f.createManagedRuntimeBridge(client);
      const service = f.createMorpheusVoiceService({ userDataDir: `${userDataDir}/managed-voice`, appVersion: 'fixture',
        providerService: { listAccounts: () => { throw new Error('BYOK must not be consulted'); } },
        audit: { isHealthy: () => true, recordControl: async () => {} }, getManagedRuntime: () => bridge,
        emitSpeechChunk: (chunk: unknown) => window.webContents.send('morpheus:speech-chunk', chunk),
        emitPresence: (presence: unknown) => window.webContents.send('morpheus:voice-presence', presence) });
      const fixture = Object.assign(state, { service, invalidate: () => { client.invalidate(); service.invalidateService(); }, close: () => { service.dispose(); ledger.close(); } });
      (globalThis as Globals).managedVoiceFixture = fixture;
      const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (event: unknown, request: unknown) => unknown> })._invokeHandlers;
      const original = handlers.get('host:invoke')!; ipcMain.removeHandler('host:invoke');
      ipcMain.handle('host:invoke', async (event, request) => {
        if (request.module !== 'morpheus') return original(event, request);
        const actions: Record<string, () => unknown> = {
          voiceStatus: () => service.status(), transcribeAudio: () => service.transcribe(request.payload),
          synthesizeSpeech: () => service.synthesize(request.payload), cancelSpeech: () => service.cancelSpeech(),
          setVoiceSpeaking: () => { state.speaking.push(request.payload.speaking); return service.setSpeaking(request.payload.speaking); },
        };
        if (!actions[request.action]) return original(event, request);
        try { return { ok: true, id: request.id, data: await actions[request.action]() }; }
        catch { return { ok: false, id: request.id, error: { code: 'INTERNAL_ERROR', message: 'Managed fixture voice unavailable.' } }; }
      });
    }, { bundle, userDataDir });
    await page.reload(); await page.getByTestId('sidebar-nav-settings').click();
    const check = page.getByTestId('morpheus-voice-check'); await check.scrollIntoViewIfNeeded();
    await expect(check).toBeVisible(); expect(await page.title()).toContain('Morpheus'); expect(page.url()).toContain('index.html');
    await expect(page.getByTestId('morpheus-openrouter-voice-presets')).toHaveCount(0);
    await expect(page.getByTestId('morpheus-voice-provider')).toHaveCount(0);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await page.getByTestId('morpheus-voice-preview').click();
    await expect.poll(() => app.evaluate(() => (globalThis as Globals).managedVoiceFixture.speaking.includes(true))).toBe(true);
    await expect.poll(() => app.evaluate(() => (globalThis as Globals).managedVoiceFixture.speaking.at(-1))).toBe(false);
    // Exercise real Chromium recorder, decoder/resampler and Main/service routes,
    // substituting only a synthetic source for physical microphone permission.
    await page.evaluate(() => {
      const context = new AudioContext({ sampleRate: 48000 }); const oscillator = context.createOscillator();
      const destination = context.createMediaStreamDestination(); oscillator.connect(destination); oscillator.start();
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => destination.stream });
      (window as unknown as { fixtureInput: { context: AudioContext; stream: MediaStream } }).fixtureInput = { context, stream: destination.stream };
    });
    await page.getByTestId('morpheus-microphone-check').click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { fixtureInput: { stream: MediaStream } }).fixtureInput.stream.active)).toBe(true);
    // Need a nonempty recording, not a race against the first recorder slice.
    await page.waitForTimeout(350);
    await page.getByTestId('morpheus-microphone-check').click();
    await expect(page.getByTestId('morpheus-microphone-check-result')).toContainText('Open Notepad');
    expect(await app.evaluate(() => (globalThis as Globals).managedVoiceFixture.captureCount)).toBe(1);
    expect(await page.evaluate(() => (window as unknown as { fixtureInput: { stream: MediaStream } }).fixtureInput.stream.active)).toBe(false);
    await app.evaluate(() => { (globalThis as Globals).managedVoiceFixture.pending = true; });
    await page.getByTestId('morpheus-voice-preview').click();
    await expect.poll(() => app.evaluate(() => (globalThis as Globals).managedVoiceFixture.requests.length)).toBe(3);
    await app.evaluate(() => (globalThis as Globals).managedVoiceFixture.invalidate());
    await expect.poll(() => app.evaluate(() => (globalThis as Globals).managedVoiceFixture.speaking.at(-1))).toBe(false);
    await expect(page.getByTestId('morpheus-voice-preview-result')).not.toBeEmpty();
    expect(errors).toEqual([]); expect(consoleErrors).toEqual([]); await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.screenshot({ path: testInfo.outputPath('managed-voice-check.png') });
    await page.getByTestId('sidebar-collapse-toggle').click();
    await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows().find((w) => w.getTitle().includes('Morpheus'))!; window.setMinimumSize(380, 500); window.setContentSize(430, 740); });
    await check.scrollIntoViewIfNeeded(); await expect(check).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('managed-voice-compact.png') });
    expect(await check.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.evaluate(() => (window as unknown as { fixtureInput: { context: AudioContext } }).fixtureInput.context.close());
    await app.evaluate(() => (globalThis as Globals).managedVoiceFixture.close());
  } finally { await closeElectronApp(app); }
});
}
