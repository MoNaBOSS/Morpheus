import { afterEach, describe, expect, it, vi } from 'vitest';
import { morpheusManagedRecording } from '@/lib/morpheus-managed-audio';
import { inspectMorpheusPcmWav } from '@shared/morpheus/pcm-wav';

afterEach(() => vi.unstubAllGlobals());
function audio(overrides = {}) {
  const decode = vi.fn(async () => ({ duration: 0.1, length: 1600, sampleRate: 16000, numberOfChannels: 2,
    getChannelData: (channel: number) => new Float32Array(1600).fill(channel === 0 ? 1 : -0.5), ...overrides }));
  vi.stubGlobal('OfflineAudioContext', class { decodeAudioData = decode; });
  return decode;
}
const blob = { size: 100, arrayBuffer: async () => new ArrayBuffer(100) } as Blob;
describe('existing capture to managed PCM', () => {
  it('locally resamples/downmixes into bounded canonical audio with sample-derived duration', async () => {
    const decode = audio(); const result = await morpheusManagedRecording(blob);
    expect(decode).toHaveBeenCalledOnce(); expect(result.mimeType).toBe('audio/wav'); expect(result.durationMs).toBe(100);
    const bytes = Uint8Array.from(atob(result.audioBase64), (char) => char.charCodeAt(0));
    expect(inspectMorpheusPcmWav(bytes)).toEqual({ durationMs: 100, sampleRate: 16000 });
    expect(new DataView(bytes.buffer).getInt16(44, true)).toBe(8192);
  });
  it.each([{ duration: 121 }, { duration: 0.09 }, { sampleRate: 8000 }, { numberOfChannels: 6 },
    { getChannelData: () => new Float32Array(1600).fill(NaN) }])('rejects unsupported decoded data %o', async (overrides) => {
    audio(overrides); await expect(morpheusManagedRecording(blob)).rejects.toThrow();
  });
  it('does not decode empty or oversized recordings', async () => {
    const decode = audio();
    await expect(morpheusManagedRecording({ ...blob, size: 0 } as Blob)).rejects.toThrow();
    await expect(morpheusManagedRecording({ ...blob, size: 11 * 1024 * 1024 } as Blob)).rejects.toThrow();
    expect(decode).not.toHaveBeenCalled();
  });
});
