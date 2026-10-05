import type {
  MorpheusDeepgramVoiceConnectionPayload, MorpheusDeepgramVoiceStatus,
  MorpheusVoiceSettingsPatch, MorpheusVoiceStatus,
} from '../../shared/morpheus/voice-types';
import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

type DeepgramUiState = { saved: number; tested: number; removed: number; secretAccepted: boolean; nextFailure: boolean; settings: MorpheusVoiceStatus['settings'] };
type Globals = typeof globalThis & { deepgramVoiceUiFixture: DeepgramUiState };

// Browser plugin not available. Flow: conversation -> ordinary Voice -> optional
// secure connection/save/test/repair -> explicit cloud selection -> return draft.
// Only admission metadata is a fixture; no live credential, provider, microphone
// or audible-output acceptance is implied. Screenshots use an empty key field.
for (const locale of ['en', 'zh', 'ja', 'ru']) {
  test(`optional Deepgram setup preserves mute and conversation in ${locale}`, async ({ launchElectronApp }, info) => {
    const app = await launchElectronApp({ skipSetup: true });
    try {
      const page = await getStableWindow(app);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      const baseline = await page.evaluate(async (language) => {
        await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'settings', action: 'set', payload: { key: 'language', value: language } });
        const response = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'voiceStatus' });
        if (!response.ok) throw new Error('Voice status unavailable');
        return response.data as MorpheusVoiceStatus;
      }, locale);
      await app.evaluate(({ ipcMain }, originalStatus) => {
        type Request = { id: string; module: string; action: string; payload?: MorpheusDeepgramVoiceConnectionPayload | MorpheusVoiceSettingsPatch };
        type Handler = (event: Electron.IpcMainInvokeEvent, request: Request) => Promise<unknown>;
        const original = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers.get('host:invoke')!;
        let connection: MorpheusDeepgramVoiceStatus = { configured: false, recognitionModel: 'nova-3', speechModel: 'flux-kit-en', storage: 'protected' };
        let status: MorpheusVoiceStatus = { ...originalStatus, deepgram: connection,
          settings: { ...originalStatus.settings, engine: 'local', enabled: false, ambientEnabled: false, localWakeEnabled: true, speakResponses: false },
          speechFormat: 'wav', availableSpeechVoices: ['cedar', 'coral'], providers: [],
          transcriptionAvailable: false, neuralSpeechAvailable: true,
          presence: { ...originalStatus.presence, state: 'asleep', inputEnabled: false, ambientEnabled: false },
        };
        const fixture: DeepgramUiState = { saved: 0, tested: 0, removed: 0, secretAccepted: false, nextFailure: true, settings: status.settings };
        (globalThis as Globals).deepgramVoiceUiFixture = fixture;
        ipcMain.removeHandler('host:invoke');
        ipcMain.handle('host:invoke', async (event, request: Request) => {
          if (request.module !== 'morpheus') return original(event, request);
          const response = (data: unknown) => ({ id: request.id, ok: true, data });
          if (request.action === 'voiceStatus') return response(status);
          if (request.action === 'deepgramVoiceStatus') return response(connection);
          if (request.action === 'saveDeepgramVoiceConnection') {
            const payload = request.payload as MorpheusDeepgramVoiceConnectionPayload;
            fixture.saved++;
            if (payload.apiKey) fixture.secretAccepted = payload.apiKey === 'fixture-only-deepgram-key';
            connection = { ...connection, configured: connection.configured || fixture.secretAccepted, recognitionModel: payload.recognitionModel ?? connection.recognitionModel };
            status = { ...status, deepgram: connection };
            return response(connection);
          }
          if (request.action === 'testDeepgramVoiceConnection') {
            fixture.tested++;
            if (fixture.nextFailure) { fixture.nextFailure = false; return response({ ok: false, recognition: false, speech: false, reason: 'authentication' }); }
            return response({ ok: true, recognition: true, speech: true });
          }
          if (request.action === 'removeDeepgramVoiceConnection') {
            fixture.removed++;
            connection = { ...connection, configured: false };
            status = { ...status, deepgram: connection, settings: { ...status.settings, engine: 'local' }, speechFormat: 'wav', availableSpeechVoices: ['cedar', 'coral'] };
            fixture.settings = status.settings;
            return response(connection);
          }
          if (request.action === 'updateVoiceSettings') {
            status = { ...status, settings: { ...status.settings, ...request.payload as MorpheusVoiceSettingsPatch } };
            fixture.settings = status.settings;
            if (status.settings.engine === 'deepgram') status = { ...status, captureFormat: 'pcm16-wav', speechFormat: 'pcm24', providerLabel: 'Deepgram', speechProviderLabel: 'Deepgram Kit' };
            return response(status);
          }
          if (['prepareAmbientVoiceInput', 'beginAmbientVoice', 'feedAmbientWakeAudio', 'transcribeAudio', 'synthesizeSpeech'].includes(request.action)) {
            throw new Error('Connection UI fixture must not open audio or send voice');
          }
          return original(event, request);
        });
      }, baseline);
      await page.reload();
      await page.setViewportSize({ width: 1280, height: 900 });
      const draft = 'Keep my conversation while I connect voice';
      await page.getByTestId('morpheus-command-input').fill(draft);
      await page.getByTestId('sidebar-nav-settings').click();
      await page.getByTestId('morpheus-settings-voice').click();
      await expect(page).toHaveTitle('Morpheus');
      expect(page.url()).toContain('index.html');
      await expect(page.getByTestId('morpheus-voice-setup')).toBeVisible();
      await expect(page.locator('vite-error-overlay, nextjs-portal')).toHaveCount(0);
      const card = page.getByTestId('morpheus-deepgram-connection');
      await card.scrollIntoViewIfNeeded();
      await card.locator('summary').click();
      const key = page.getByTestId('morpheus-deepgram-key');
      await expect(key).toHaveAttribute('type', 'password');
      await expect(key).toHaveValue('');
      await expect(page.getByTestId('morpheus-deepgram-use')).toBeDisabled();
      await key.fill('fixture-only-deepgram-key');
      await page.getByTestId('morpheus-deepgram-save').click();
      await expect(key).toHaveValue('');
      await expect(page.getByTestId('morpheus-deepgram-test-result')).toBeVisible();
      await expect(page.getByTestId('morpheus-deepgram-use')).toBeDisabled();
      expect(await app.evaluate(() => (globalThis as Globals).deepgramVoiceUiFixture.secretAccepted)).toBe(true);
      expect(await app.evaluate(() => (globalThis as Globals).deepgramVoiceUiFixture.settings.engine)).toBe('local');
      expect(await app.evaluate(() => (globalThis as Globals).deepgramVoiceUiFixture.settings.enabled)).toBe(false);
      await page.screenshot({ path: info.outputPath('deepgram-authentication-repair.png') });
      await page.getByTestId('morpheus-deepgram-test').click();
      await expect(page.getByTestId('morpheus-deepgram-use')).toBeEnabled();
      await page.getByTestId('morpheus-deepgram-use').click();
      await expect(page.getByTestId('morpheus-deepgram-use-local')).toBeVisible();
      expect(await app.evaluate(() => (globalThis as Globals).deepgramVoiceUiFixture.settings.enabled)).toBe(false);
      expect(await app.evaluate(() => (globalThis as Globals).deepgramVoiceUiFixture.settings.providerAccountId)).toBe(baseline.settings.providerAccountId);
      await page.getByTestId('morpheus-deepgram-model').selectOption('flux-general-en');
      await page.getByTestId('morpheus-deepgram-save').click();
      await expect(page.getByTestId('morpheus-deepgram-test-result')).toBeVisible();
      await expect(key).toHaveValue('');
      if (locale === 'en') await expect(page.getByTestId('morpheus-deepgram-test-result')).toContainText('Now check your microphone');
      await expect.poll(() => app.evaluate(() => (globalThis as Globals).deepgramVoiceUiFixture.saved)).toBe(2);
      await expect.poll(() => app.evaluate(() => (globalThis as Globals).deepgramVoiceUiFixture.tested)).toBe(3);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.screenshot({ path: info.outputPath('deepgram-connected-muted.png') });
      await page.setViewportSize({ width: 430, height: 800 });
      await card.scrollIntoViewIfNeeded();
      expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await page.screenshot({ path: info.outputPath('deepgram-connected-430.png') });
      await page.getByTestId('morpheus-deepgram-remove').click();
      await expect(page.getByTestId('morpheus-deepgram-test')).toHaveCount(0);
      await expect(page.getByTestId('morpheus-deepgram-use')).toBeDisabled();
      expect(await app.evaluate(() => (globalThis as Globals).deepgramVoiceUiFixture.removed)).toBe(1);
      await page.getByTestId('morpheus-settings-return').click();
      await expect(page.getByTestId('morpheus-command-input')).toHaveValue(draft);
      expect(errors).toEqual([]);
    } finally { await closeElectronApp(app); }
  });
}
