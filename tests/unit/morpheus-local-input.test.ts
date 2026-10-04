import { describe, expect, it } from 'vitest';
import {
  MorpheusNoSpeechError,
  validateMorpheusLocalRecording,
  validateMorpheusLocalTranscript,
} from '../../electron/services/morpheus/voice/local-input';

function recording(sample: (index: number) => number, durationMs = 500): Buffer {
  const count = durationMs * 16;
  const wav = Buffer.alloc(44 + count * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36);
  wav.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) wav.writeInt16LE(Math.round(sample(i) * 32767), 44 + i * 2);
  return wav;
}

describe('included voice input gate', () => {
  it.each([
    ['silence', () => 0],
    ['DC-biased input', () => 0.3],
    ['near-silent recording', (i: number) => Math.sin(i * 0.1) * 0.0001],
    ['isolated clicks', (i: number) => i % 3200 === 0 ? 0.9 : 0],
  ] as const)('rejects %s instead of asking the decoder to invent text', (_name, sample) => {
    expect(() => validateMorpheusLocalRecording(recording(sample))).toThrow(MorpheusNoSpeechError);
  });

  it('preserves short, quiet signal, including after silence and with DC bias', () => {
    expect(() => validateMorpheusLocalRecording(recording(i => Math.sin(i * 0.1) * 0.004, 80))).not.toThrow();
    expect(() => validateMorpheusLocalRecording(recording(i => i < 4000 ? 0 : 0.1 + Math.sin(i * 0.1) * 0.004))).not.toThrow();
  });

  it('requires valid complete canonical samples rather than silently bypassing the gate', () => {
    const valid = recording(i => Math.sin(i * 0.1) * 0.1);
    const invalidRate = Buffer.from(valid); invalidRate.writeUInt32LE(48000, 24);
    const invalidLength = valid.subarray(0, valid.length - 1);
    const invalidAlign = Buffer.from(valid); invalidAlign.writeUInt16LE(1, 32);
    for (const invalid of [Buffer.alloc(0), invalidRate, invalidLength, invalidAlign]) {
      expect(() => validateMorpheusLocalRecording(invalid)).toThrow('valid mono 16 kHz');
    }
  });

  it.each([
    '', '  ', '[BLANK_AUDIO]', '[BLANK_AUDIO', '(wind blowing)', '(wind blowing', '(wind howling',
    '[Silence]', '(inaudible)', '[music]', '[Music playing].', '[noise] (breathing)',
    '[SOUND]', '[sound', '(sound effects)', '[background sound]', '[Sound]. [noise]',
    '<|nospeech|>', '<|endoftext|>', '♪ ♫', '[blank audio] — [background noise]',
  ])('rejects annotation-only decoder result %j', transcript => {
    expect(() => validateMorpheusLocalTranscript(transcript)).toThrow(MorpheusNoSpeechError);
  });

  it.each([
    'yes', 'no', 'stop', 'Open YouTube.', 'music', 'wind blowing',
    'sound', 'Sounds good.', 'Explain [SOUND].', '[sound] Open YouTube.',
    'What does [BLANK_AUDIO] mean?', 'Play wind blowing sounds.', '(Open YouTube)',
    'Use [music] as the title.', '[music] Open YouTube.', 'Say (wind blowing).',
    'There is no speech in this video.', 'Thank you.', '♪ Play this song',
  ])('preserves genuine text without rewriting %j', transcript => {
    expect(validateMorpheusLocalTranscript(`  ${transcript}  `)).toBe(transcript);
  });
});
