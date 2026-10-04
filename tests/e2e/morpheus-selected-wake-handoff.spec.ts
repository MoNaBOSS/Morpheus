import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { MorpheusVoiceSettingsPatch, MorpheusVoiceStatus } from '../../shared/morpheus/voice-types';
import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';

type CaptureEvidence = { constraints: MediaStreamConstraints; stopped: boolean };

test('native ambient OFF to ON reacquires the selected stream and stops for foreground and mute', async ({ launchElectronApp }, info) => {
  test.skip(process.platform !== 'win32' || !existsSync(resolve('build/local-voice/bin/sherpa-onnx-offline-tts.exe')),
    'Windows native recognition and included voice assets required');
  test.setTimeout(120_000);
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const page = await getStableWindow(app);
    await expect(page).toHaveTitle('Morpheus');
    await page.addInitScript(() => {
      const captures: CaptureEvidence[] = [];
      (window as unknown as { selectedWakeCaptures: CaptureEvidence[] }).selectedWakeCaptures = captures;
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const audio = constraints.audio;
        if (!audio || typeof audio !== 'object' || !audio.deviceId || typeof audio.deviceId !== 'object' || !('exact' in audio.deviceId)
          || audio.deviceId.exact !== 'morpheus-e2e-selected-mic') throw new Error('The selected input must be requested exactly');
        const evidence: CaptureEvidence = { constraints, stopped: false }; captures.push(evidence);
        // A silent real WebAudio stream drives the original worklet/native
        // readiness path. No physical input or recognized words are supplied.
        const context = new AudioContext({ sampleRate: 48_000 });
        const tone = context.createOscillator();
        const gain = context.createGain(); gain.gain.value = 0;
        const destination = context.createMediaStreamDestination();
        tone.connect(gain).connect(destination);
        const track = destination.stream.getAudioTracks()[0];
        const stop = track.stop.bind(track);
        track.stop = () => {
          if (evidence.stopped) return;
          evidence.stopped = true; stop(); tone.stop(); void context.close();
        };
        await context.resume(); tone.start();
        return destination.stream;
      };
    });
    const updateMain = (patch: MorpheusVoiceSettingsPatch) => page.evaluate(async (payload) => {
      // Original Main endpoint, bypassing the renderer settings store just as
      // native tray edits do. Voice/status/presence/prepare/feed are never mocked.
      const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'updateVoiceSettings', payload });
      if (!result.ok) throw new Error(result.error?.message ?? 'Original Main settings update failed');
      return result.data as MorpheusVoiceStatus;
    }, patch);
    const status = () => page.evaluate(async () => {
      const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'voiceStatus' });
      if (!result.ok) throw new Error(result.error?.message ?? 'Original Main voice status failed');
      return result.data as MorpheusVoiceStatus;
    });
    const captures = () => page.evaluate(() => (window as unknown as { selectedWakeCaptures: CaptureEvidence[] }).selectedWakeCaptures);
    const visibility = (visible: boolean) => app.evaluate(({ BrowserWindow }, show) => {
      const main = BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'Morpheus');
      if (!main) throw new Error('Original Main window required');
      if (show) main.show(); else main.hide();
    }, visible);
    const settings = await updateMain({ engine: 'local', enabled: true, ambientEnabled: true, localWakeEnabled: true,
      inputDeviceId: 'morpheus-e2e-selected-mic', wakePhrase: 'Morpheus', speakResponses: false,
      handsFreeFollowUp: false, autoSubmitTranscript: false });
    expect(settings.transcriptionAvailable).toBe(true);
    await page.reload();
    await expect(page.getByTestId('morpheus-command-input')).toBeVisible();
    await expect.poll(async () => (await captures()).length).toBe(0);

    await visibility(false);
    await expect.poll(async () => (await status()).presence.state, { timeout: 35_000 }).toBe('armed');
    expect(await captures()).toMatchObject([{ constraints: { audio: { deviceId: { exact: 'morpheus-e2e-selected-mic' } } }, stopped: false }]);
    const first = await status();
    expect(first.presence.sessionStartedAt).toBeTruthy();

    await updateMain({ ambientEnabled: false });
    await expect.poll(async () => (await captures()).every((capture) => capture.stopped)).toBe(true);
    await expect.poll(async () => ({ enabled: (await status()).settings.ambientEnabled, state: (await status()).presence.state }))
      .toEqual({ enabled: false, state: 'asleep' });
    expect(await captures()).toHaveLength(1);

    await updateMain({ ambientEnabled: true });
    await expect.poll(async () => (await captures()).length, { timeout: 35_000 }).toBe(2);
    await expect.poll(async () => (await status()).presence.state, { timeout: 35_000 }).toBe('armed');
    expect(await captures()).toMatchObject([{ stopped: true },
      { constraints: { audio: { deviceId: { exact: 'morpheus-e2e-selected-mic' } } }, stopped: false }]);
    const second = await status();
    expect(second.settings).toMatchObject({ enabled: true, ambientEnabled: true, inputDeviceId: 'morpheus-e2e-selected-mic' });

    await visibility(true);
    await expect.poll(async () => (await captures()).every((capture) => capture.stopped)).toBe(true);
    await expect.poll(async () => (await status()).presence.state).toBe('asleep');
    expect(await captures()).toHaveLength(2);
    await updateMain({ enabled: false });
    await expect.poll(async () => (await status()).settings.enabled).toBe(false);
    await visibility(false);
    // Observe beyond the native heartbeat timeout: an unauthorized fresh stream
    // would be visible in both capture evidence and Main's actual readiness.
    await page.waitForTimeout(3_500);
    expect(await captures()).toHaveLength(2);
    expect((await captures()).every((capture) => capture.stopped)).toBe(true);
    const muted = await status();
    expect(muted.settings).toMatchObject({ enabled: false, ambientEnabled: true });
    expect(muted.presence.state).toBe('asleep');
    expect(muted.presence.sessionStartedAt).toBeUndefined();
    await info.attach('selected-stream-handoff', { body: JSON.stringify({ first: first.presence, second: second.presence,
      muted: muted.presence, captures: await captures(),
      scope: 'Original Main settings, real selected-stream worklet and native readiness, synthetic silent WebAudio input.',
      exclusions: 'No physical microphone, wake words, transcription accuracy, inference or audible playback qualification.',
    }), contentType: 'application/json' });
  } finally { await closeElectronApp(app); }
});
