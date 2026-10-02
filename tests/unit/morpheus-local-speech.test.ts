import { describe, expect, it } from 'vitest';
import { localSpeechPcm, localSpeechSegments } from '../../electron/services/morpheus/voice/local-speech';

function wav(pcm = Buffer.from([0, 32, 0, 64])) {
  const value = Buffer.alloc(44 + pcm.length);
  value.write('RIFF'); value.writeUInt32LE(value.length - 8, 4); value.write('WAVEfmt ', 8); value.writeUInt32LE(16, 16);
  value.writeUInt16LE(1, 20); value.writeUInt16LE(1, 22); value.writeUInt32LE(24_000, 24); value.writeUInt32LE(48_000, 28);
  value.writeUInt16LE(2, 32); value.writeUInt16LE(16, 34); value.write('data', 36); value.writeUInt32LE(pcm.length, 40); pcm.copy(value, 44);
  return value;
}
describe('included speech segments and PCM validation', () => {
  it('starts with a short complete phrase and preserves the entire reply in order', () => {
    const text = 'I am Morpheus. Tell me what you need, and I will get moving. A little humor, a little Matrix, and useful results.';
    const parts = localSpeechSegments(text);
    expect(parts[0]).toBe('I am Morpheus.');
    expect(parts.join(' ')).toBe(text);
    expect(parts.slice(1).every(part => part.length <= 160)).toBe(true);
  });
  it('bounds an unpunctuated reply at word boundaries and keeps Unicode', () => {
    const text = Array.from({ length: 120 }, () => '世界 together').join(' ');
    const parts = localSpeechSegments(text);
    expect(parts[0].length).toBeLessThanOrEqual(64); expect(parts.every(part => part.length <= 160)).toBe(true);
    expect(parts.join(' ')).toBe(text); expect(localSpeechSegments('  \n ')).toEqual([]);
  });
  it('returns only actual mono 24 kHz PCM samples', () => {
    expect(localSpeechPcm(wav())).toEqual(Buffer.from([0, 32, 0, 64]));
  });
  it.each(['stereo', 'wrong-rate', 'float', 'truncated', 'odd-samples', 'no-data'])('rejects %s before streaming', kind => {
    let value = wav();
    if (kind === 'stereo') value.writeUInt16LE(2, 22);
    if (kind === 'wrong-rate') value.writeUInt32LE(16_000, 24);
    if (kind === 'float') value.writeUInt16LE(3, 20);
    if (kind === 'truncated') value = value.subarray(0, value.length - 1);
    if (kind === 'odd-samples') value = wav(Buffer.from([1, 2, 3]));
    if (kind === 'no-data') value.write('JUNK', 36);
    expect(() => localSpeechPcm(value)).toThrow(/audio/);
  });
});
