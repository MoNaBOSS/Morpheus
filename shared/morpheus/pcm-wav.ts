/** Canonical mono PCM16 only. Derive duration from samples, never client claims. */
export function inspectMorpheusPcmWav(audio: Uint8Array): { durationMs: number; sampleRate: number } {
  const invalid = () => { throw new Error('Invalid bounded PCM audio.'); };
  if (audio.length < 46 || audio.length > 5_760_000 + 44) return invalid();
  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  const ascii = (offset: number, value: string) => [...value].every((char, index) => audio[offset + index] === char.charCodeAt(0));
  if (!ascii(0, 'RIFF') || view.getUint32(4, true) !== audio.length - 8
    || !ascii(8, 'WAVEfmt ') || view.getUint32(16, true) !== 16
    || view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1
    || view.getUint16(32, true) !== 2 || view.getUint16(34, true) !== 16
    || !ascii(36, 'data') || view.getUint32(40, true) !== audio.length - 44
    || (audio.length - 44) % 2) return invalid();
  const sampleRate = view.getUint32(24, true);
  if (![16_000, 24_000, 48_000].includes(sampleRate) || view.getUint32(28, true) !== sampleRate * 2) return invalid();
  const exactDuration = (audio.length - 44) / (sampleRate * 2) * 1_000;
  if (exactDuration < 100 || exactDuration > 120_000) return invalid();
  return { durationMs: Math.ceil(exactDuration), sampleRate };
}
