import { closeElectronApp, expect, getStableWindow, test } from './fixtures/electron';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

test('Voice preview plays real included PCM progressively with input muted', async ({ launchElectronApp }) => {
  test.skip(process.platform !== 'win32' || !existsSync(resolve('build/local-voice/bin/sherpa-onnx-offline-tts.exe')), 'Real Windows bundled voice assets required');
  test.setTimeout(60_000);
  const app = await launchElectronApp({ skipSetup: true });
  try {
    const page = await getStableWindow(app);
    await page.evaluate(async () => {
      const result = await window.clawx.hostInvoke({ id: crypto.randomUUID(), module: 'morpheus', action: 'updateVoiceSettings', payload: { engine: 'local', enabled: false, ambientEnabled: false } });
      if (!result.ok) throw new Error('Cannot mute isolated voice test');
      const evidence = { chunks: [] as Array<{ at: number; sequence: number; mimeType?: string }>, states: [] as string[] };
      (window as unknown as { voiceEvidence: typeof evidence }).voiceEvidence = evidence;
      window.electron.ipcRenderer.on('morpheus:speech-chunk', (value) => {
        const chunk = value as { sequence: number; mimeType?: string };
        evidence.chunks.push({ at: performance.now(), sequence: chunk.sequence, mimeType: chunk.mimeType });
      });
      window.electron.ipcRenderer.on('morpheus:voice-presence', (value) => evidence.states.push((value as { state: string }).state));
    });
    await page.getByTestId('sidebar-nav-settings').click();
    await page.getByTestId('morpheus-settings-voice').click();
    const sample = page.getByTestId('morpheus-voice-preview');
    await sample.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { voiceEvidence: { chunks: unknown[] } }).voiceEvidence.chunks.length), { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page.getByTestId('morpheus-voice-preview-result')).toContainText('Neural playback completed', { timeout: 35_000 });
    const result = await page.evaluate(() => (window as unknown as { voiceEvidence: { chunks: Array<{ at: number; sequence: number; mimeType: string }>; states: string[] } }).voiceEvidence);
    expect(result.chunks.length).toBeGreaterThan(1);
    expect(result.chunks.every((chunk, index) => chunk.sequence === index && chunk.mimeType === 'audio/pcm')).toBe(true);
    expect(result.chunks.at(-1)!.at - result.chunks[0].at).toBeGreaterThan(100);
    expect(result.states).toContain('speaking'); expect(result.states).not.toContain('listening');
  } finally { await closeElectronApp(app); }
});
