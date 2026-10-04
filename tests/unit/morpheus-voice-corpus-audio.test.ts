// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { createCorpusAudioConverter } from '../../scripts/lib/voice-command-corpus-audio.mjs';

function generatedWave(samples = 2400) {
  const wave = Buffer.alloc(44 + samples * 2);
  wave.write('RIFF'); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(1, 22); wave.writeUInt32LE(24000, 24);
  wave.writeUInt32LE(48000, 28); wave.writeUInt16LE(2, 32); wave.writeUInt16LE(16, 34); wave.write('data', 36); wave.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) wave.writeInt16LE(8192, 44 + index * 2);
  return wave;
}

describe('offline corpus uses the actual production PCM converter', () => {
  it('preserves the complete utterance between declared context and complete 200ms frames', async () => {
    const convert = await createCorpusAudioConverter(resolve('src/lib/morpheus-wake-audio-worklet.js'));
    const wave = convert(generatedWave());
    expect(wave.readUInt32LE(24)).toBe(16000);
    expect(wave.readUInt32LE(40)).toBe(22400 * 2);
    expect((wave.length - 44) % 6400).toBe(0);
    for (let index = 0; index < 22400; index++) {
      expect(wave.readInt16LE(44 + index * 2)).toBe(index >= 9600 && index < 11200 ? 8192 : 0);
    }
  });
  it('rejects wrong-rate and incomplete WAV rather than measuring malformed input', async () => {
    const convert = await createCorpusAudioConverter(resolve('src/lib/morpheus-wake-audio-worklet.js'));
    const wrongRate = generatedWave(); wrongRate.writeUInt32LE(48000, 24);
    expect(() => convert(wrongRate)).toThrow(/24kHz/);
    expect(() => convert(generatedWave().subarray(0, 44))).toThrow(/24kHz/);
  });
});
