import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createMorpheusLocalVoice } from '../../electron/services/morpheus/voice/local-voice';
import { MorpheusNoSpeechError, validateMorpheusLocalTranscript } from '../../electron/services/morpheus/voice/local-input';

const root = process.env.MORPHEUS_LOCAL_VOICE_TEST_ROOT;
function pcm16k(source: Buffer): Buffer {
  let dataOffset = 12; let rate = 24000; let samples = Buffer.alloc(0);
  while (dataOffset + 8 < source.length) {
    const name = source.toString('ascii', dataOffset, dataOffset + 4); const size = source.readUInt32LE(dataOffset + 4);
    if (name === 'fmt ') rate = source.readUInt32LE(dataOffset + 12);
    if (name === 'data') { samples = source.subarray(dataOffset + 8, dataOffset + 8 + size); break; }
    dataOffset += 8 + size + size % 2;
  }
  const count = Math.floor(samples.length / 2 * 16000 / rate); const wav = Buffer.alloc(44 + count * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) wav.writeInt16LE(samples.readInt16LE(Math.floor(i * rate / 16000) * 2), 44 + i * 2);
  return wav;
}

describe.skipIf(process.platform !== 'win32' || !root)('real included voice engine', () => {
  it('rejects silence before decoding, then recognizes short real synthesized answers through the gate', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'local-voice-input-gate-'));
    const voice = createMorpheusLocalVoice(root!, temporary);
    try {
      const signal = new AbortController().signal;
      const sample = pcm16k(await voice.synthesize('Yes.', 'cedar', signal));
      const silent = Buffer.from(sample); silent.fill(0, 44);
      await expect(voice.transcribe(silent, signal)).rejects.toThrow(MorpheusNoSpeechError);
      // Real ASR still runs for audible noise: energy is not proof of speech.
      // A deterministic broadband sample tests the independent semantic gate.
      const noise = Buffer.from(sample);
      let seed = 17;
      for (let i = 44; i < noise.length; i += 2) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        noise.writeInt16LE(Math.round((seed / 0xffffffff * 2 - 1) * 2600), i);
      }
      const noiseTranscript = await voice.transcribe(noise, signal);
      expect(() => validateMorpheusLocalTranscript(noiseTranscript), `Noise decoded as ${JSON.stringify(noiseTranscript)}`).toThrow(MorpheusNoSpeechError);
      const quiet = Buffer.from(sample);
      for (let i = 44; i < quiet.length; i += 2) quiet.writeInt16LE(Math.round(quiet.readInt16LE(i) * 0.2), i);
      expect(validateMorpheusLocalTranscript(await voice.transcribe(quiet, signal)).toLowerCase()).toMatch(/^yes[.!]?$/);
      for (const command of ['No.', 'Stop.']) {
        const audio = pcm16k(await voice.synthesize(command, 'cedar', signal));
        expect(validateMorpheusLocalTranscript(await voice.transcribe(audio, signal)).toLowerCase().replace(/[.!]$/, ''))
          .toBe(command.toLowerCase().replace('.', ''));
      }
      expect(await readdir(temporary)).toEqual([]);
    } finally { voice.dispose?.(); await rm(temporary, { recursive: true, force: true }); }
  }, 45_000);
  it('synthesizes and recognizes a real command without a provider and removes audio after success', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'local-voice-'));
    const voice = createMorpheusLocalVoice(root!, temporary);
    try {
      expect(voice.ready()).toBe(true);
      const audio = await voice.synthesize('Open YouTube.', 'cedar', new AbortController().signal);
      const transcript = await voice.transcribe(pcm16k(audio), new AbortController().signal);
      expect(transcript.toLowerCase()).toMatch(/^open youtube[.!]?$/);
      expect(await readdir(temporary)).toEqual([]);
    } finally { voice.dispose?.(); await rm(temporary, { recursive: true, force: true }); }
  }, 45_000);
  it('cancels the real speech process and removes its temporary directory', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'local-voice-cancel-'));
    const voice = createMorpheusLocalVoice(root!, temporary);
    try {
      const controller = new AbortController();
      const result = voice.synthesize('This deliberately long sample is interrupted before it can finish speaking.', 'cedar', controller.signal);
      const cancel = setTimeout(() => controller.abort(), 100);
      await expect(result).rejects.toMatchObject({ name: 'AbortError' }); clearTimeout(cancel);
      expect(await readdir(temporary)).toEqual([]);
    } finally { voice.dispose?.(); await rm(temporary, { recursive: true, force: true }); }
  });
  it('streams real validated PCM before the complete reply and cancels between phrases without retaining audio', async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'local-voice-stream-'));
    const voice = createMorpheusLocalVoice(root!, temporary);
    try {
      const controller = new AbortController();
      const parts: Buffer[] = [];
      const pending = voice.synthesizeStream!('I am Morpheus. Tell me what you need, and I will get moving. A little humor, a little Matrix, and useful results.', 'cedar', controller.signal, pcm => {
        parts.push(pcm); controller.abort();
      });
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      expect(parts).toHaveLength(1); expect(parts[0].length).toBeGreaterThan(24_000);
      expect(parts[0].length % 2).toBe(0); expect(await readdir(temporary)).toEqual([]);
    } finally { voice.dispose?.(); await rm(temporary, { recursive: true, force: true }); }
  }, 30_000);
});
