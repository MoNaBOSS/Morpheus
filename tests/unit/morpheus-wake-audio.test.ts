import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { isMorpheusWakeAudioFrame } from '@shared/morpheus/wake-audio-types';
import { MorpheusWakeAudioBuffer, addressedLocalWakeTranscript } from '@electron/services/morpheus/voice/wake-audio-buffer';

describe('selected wake PCM ownership', () => {
  it.each([16_000, 44_100, 48_000])('resamples %i Hz into five exact 200 ms mono PCM16 frames', (rate) => {
    const frames: ArrayBuffer[] = [];
    let Processor!: new () => { process(inputs: Float32Array[][]): boolean };
    runInNewContext(readFileSync(join(process.cwd(), 'src/lib/morpheus-wake-audio-worklet.js'), 'utf8'), {
      sampleRate: rate,
      AudioWorkletProcessor: class { port = { postMessage: (buffer: ArrayBuffer) => frames.push(buffer) }; },
      registerProcessor: (name: string, constructor: typeof Processor) => {
        expect(name).toBe('morpheus-wake-audio'); Processor = constructor;
      },
    });
    const processor = new Processor();
    for (let remaining = rate; remaining > 0;) {
      const count = Math.min(128, remaining);
      expect(processor.process([[new Float32Array(count).fill(0.5)]])).toBe(true);
      remaining -= count;
    }
    expect(frames).toHaveLength(5);
    expect(frames.every((frame) => frame.byteLength === 6400)).toBe(true);
    expect(frames.every((frame) => [...new Int16Array(frame)].every((sample) => sample === 16384))).toBe(true);
  });

  it('limits the public PCM shape and rejects extra fields, replay counters and wrong frame sizes', () => {
    const frame = { sessionId: 'voice-00000000-0000-0000-0000-000000000001', sequence: 0, pcmBase64: Buffer.alloc(6400).toString('base64') };
    expect(isMorpheusWakeAudioFrame(frame)).toBe(true);
    expect(isMorpheusWakeAudioFrame({ ...frame, device: 'default' })).toBe(false);
    expect(isMorpheusWakeAudioFrame({ ...frame, sequence: -1 })).toBe(false);
    expect(isMorpheusWakeAudioFrame({ ...frame, pcmBase64: Buffer.alloc(3200).toString('base64') })).toBe(false);
  });

  it('retains at most 21.5 seconds and rejects evicted, future, overlong and post-clear ranges', () => {
    const buffer = new MorpheusWakeAudioBuffer();
    for (let i = 0; i < 110; i++) buffer.append(Buffer.alloc(6400, i));
    expect(() => buffer.wave({ startSample: 0, sampleCount: 3200 })).toThrow('incomplete');
    expect(() => buffer.wave({ startSample: 350000, sampleCount: 3200 })).toThrow('incomplete');
    expect(() => buffer.wave({ startSample: 9600, sampleCount: 320001 })).toThrow('incomplete');
    const wave = buffer.wave({ startSample: 320000, sampleCount: 3200 });
    expect(wave.subarray(0, 4).toString()).toBe('RIFF');
    expect(wave.readUInt32LE(24)).toBe(16000);
    expect(wave.length - 44).toBe((3200 + 4800 * 2) * 2);
    buffer.clear();
    expect(() => buffer.wave({ startSample: 320000, sampleCount: 3200 })).toThrow('incomplete');
  });

  it('requires an exact addressed prefix, allowing configured hey and punctuation without fuzzy execution', () => {
    expect(addressedLocalWakeTranscript('Hey, MORPHEUS — open YouTube.', 'Morpheus')).toBe('open YouTube.');
    expect(addressedLocalWakeTranscript('Hey Morpheus open YouTube', 'Hey Morpheus')).toBe('open YouTube');
    expect(addressedLocalWakeTranscript('Morpheus.', 'Morpheus')).toBe('');
    expect(addressedLocalWakeTranscript('more fierce open YouTube', 'Morpheus')).toBeNull();
    expect(addressedLocalWakeTranscript('Please Morpheus open YouTube', 'Morpheus')).toBeNull();
  });
});
