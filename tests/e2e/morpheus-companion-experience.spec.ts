import { join } from 'node:path';
import { closeElectronApp, expect, getStableWindow, installIpcMocks, test } from './fixtures/electron';

test('companion voice checks remain truthful and visible at 1280x800', async ({ launchElectronApp }) => {
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const page = await getStableWindow(app);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page).toHaveTitle('Morpheus');
    await page.getByTestId('morpheus-open-welcome').click();
    await expect(page.getByTestId('morpheus-welcome')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.getByTestId('morpheus-welcome')).toHaveCSS('opacity', '1');
    await expect(page.getByTestId('morpheus-welcome').locator('.morpheus-signal-sphere')).toBeVisible();
    const folder = process.env.MORPHEUS_VISUAL_EVIDENCE_DIR;
    if (folder) await page.screenshot({ path: join(folder, 'companion-orb-1280x800.png') });
    await page.getByTestId('morpheus-welcome-voice-settings').click();
    const check = page.getByTestId('morpheus-voice-check');
    await check.scrollIntoViewIfNeeded();
    await expect(check).toContainText('Not tested yet');
    await expect(page.getByTestId('morpheus-microphone-check')).toBeDisabled();
    await expect(page.getByTestId('morpheus-local-wake')).toHaveAttribute('data-state', 'unchecked');
    // Playback fixture, not live neural speech: exercise truthful fallback UI.
    await page.evaluate(() => {
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
        cancel() {},
        speak(utterance: SpeechSynthesisUtterance) {
          utterance.dispatchEvent(new Event('start'));
          utterance.dispatchEvent(new Event('end'));
        },
      } });
    });
    await page.getByTestId('morpheus-voice-preview').click();
    await expect(page.getByTestId('morpheus-voice-preview-result')).toContainText('Windows fallback');
    if (folder) await page.screenshot({ path: join(folder, 'companion-voice-check-1280x800.png') });
    await page.getByTestId('morpheus-speech-voice').selectOption('marin');
    await expect(page.getByTestId('morpheus-voice-preview-result')).toContainText('Not tested yet');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByTestId('sidebar-nav-command-center').click();
    await page.getByTestId('morpheus-open-welcome').click();
    await expect(page.getByTestId('morpheus-welcome')).toHaveCSS('animation-name', 'none');
    expect(errors).toEqual([]);
  } finally { await closeElectronApp(app); }
});

test('MP3 chunks play through real Electron MediaSource before generation finishes', async ({ launchElectronApp }) => {
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const page = await getStableWindow(app);
    expect(await page.evaluate(() => MediaSource.isTypeSupported('audio/mpeg'))).toBe(true);
    const status = await page.evaluate(async () => {
      const response = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'voiceStatus' });
      if (!response.ok) throw new Error('Voice status unavailable');
      return response.data as Record<string, unknown>;
    });
    await installIpcMocks(app, { hostApi: { [JSON.stringify(['morpheus', 'voiceStatus', null])]: {
      ...status, neuralSpeechAvailable: true,
    } } });
    // A generated silent MPEG-1 Layer III fixture, not a provider or voice-quality
    // claim. Actual Chromium decoding, IPC delivery and player lifecycle are used.
    await app.evaluate(({ ipcMain }) => {
      type Request = { id: string; module: string; action: string; payload?: { streamId?: string; speaking?: boolean } };
      type Handler = (event: Electron.IpcMainInvokeEvent, request: Request) => Promise<unknown>;
      const original = (ipcMain as unknown as { _invokeHandlers: Map<string, Handler> })._invokeHandlers.get('host:invoke')!;
      const evidence = { playingBeforeComplete: false, complete: false };
      (globalThis as unknown as { speechStreamEvidence: typeof evidence }).speechStreamEvidence = evidence;
      ipcMain.removeHandler('host:invoke');
      ipcMain.handle('host:invoke', async (event, request: Request) => {
        if (request.module === 'morpheus' && request.action === 'synthesizeSpeech') {
          const bytes = Buffer.alloc(417 * 48);
          for (let offset = 0; offset < bytes.length; offset += 417) {
            bytes.set([0xff, 0xfb, 0x90, 0x64], offset);
          }
          let sequence = 0;
          for (let offset = 0; offset < bytes.length; offset += 417 * 8) {
            event.sender.send('morpheus:speech-chunk', {
              streamId: request.payload?.streamId, sequence: sequence++,
              audioBase64: bytes.subarray(offset, offset + 417 * 8).toString('base64'),
            });
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
          evidence.complete = true;
          return { id: request.id, ok: true, data: { audioBase64: bytes.toString('base64'), mimeType: 'audio/mpeg' } };
        }
        if (request.module === 'morpheus' && request.action === 'setVoiceSpeaking') {
          if (request.payload?.speaking && !evidence.complete) evidence.playingBeforeComplete = true;
          return { id: request.id, ok: true, data: null };
        }
        return original(event, request);
      });
    });
    await page.getByTestId('sidebar-nav-settings').click();
    await page.getByTestId('morpheus-voice-preview').scrollIntoViewIfNeeded();
    await page.getByTestId('morpheus-voice-preview').click();
    await expect(page.getByTestId('morpheus-voice-preview-result')).toContainText('Neural playback completed', { timeout: 15_000 });
    expect(await app.evaluate(() => (globalThis as unknown as {
      speechStreamEvidence: { playingBeforeComplete: boolean };
    }).speechStreamEvidence.playingBeforeComplete)).toBe(true);
  } finally { await closeElectronApp(app); }
});
