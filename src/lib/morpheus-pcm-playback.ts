import { createMorpheusAudioLevelSource } from './morpheus-audio-level';
import { MORPHEUS_SPEECH_MAX_AUDIO_BYTES } from '@shared/morpheus/voice-types';

/** Bounded mono PCM24k playback owned by the existing speech generation. Samples
 * are never persisted; metering reads the actual scheduled audible output. */
export function createMorpheusPcmPlayback(onSpeaking: (value: boolean) => void) {
  const context = new AudioContext({ sampleRate: 24_000 });
  const analyser = context.createAnalyser(); analyser.fftSize = 512; analyser.connect(context.destination);
  const level = createMorpheusAudioLevelSource();
  const samples = new Uint8Array(analyser.fftSize);
  const sources = new Map<AudioBufferSourceNode, { start: number; end: number }>();
  let bytes = 0, carry: number | null = null, nextAt = 0, ended = false, disposed = false, speaking = false;
  let ready = Promise.resolve();
  let resolve!: () => void, reject!: (error: Error) => void;
  const completed = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  void completed.catch(() => undefined);
  const timer = window.setInterval(() => {
    if (disposed) return;
    const playing = context.state === 'running' && [...sources.values()].some(({ start, end }) => context.currentTime >= start && context.currentTime < end);
    if (playing !== speaking) { speaking = playing; onSpeaking(playing); }
    if (!playing) { level.update(0); return; }
    analyser.getByteTimeDomainData(samples);
    let energy = 0; for (const sample of samples) energy += ((sample - 128) / 128) ** 2;
    level.update(Math.sqrt(energy / samples.length));
  }, 50);
  const dispose = () => {
    if (disposed) return;
    disposed = true; window.clearInterval(timer); level.dispose();
    for (const source of sources.keys()) { source.onended = null; try { source.stop(); } catch { /* Already ended. */ } source.disconnect(); }
    sources.clear(); analyser.disconnect(); void context.close().catch(() => undefined);
    if (speaking) onSpeaking(false); speaking = false; resolve();
  };
  const fail = (error: unknown) => { reject(error instanceof Error ? error : new Error('PCM playback failed.')); dispose(); };
  const checkEnd = () => { if (ended && sources.size === 0 && !disposed) { resolve(); dispose(); } };
  return {
    completed, dispose,
    push(chunk: Uint8Array) {
      if (disposed || ended) return;
      bytes += chunk.length;
      if (!chunk.length || bytes > MORPHEUS_SPEECH_MAX_AUDIO_BYTES) { fail(new Error('PCM speech exceeds its limit.')); return; }
      let input = chunk;
      if (carry !== null) { input = new Uint8Array(chunk.length + 1); input[0] = carry; input.set(chunk, 1); }
      carry = input.length % 2 ? input[input.length - 1] : null;
      const count = Math.floor(input.length / 2); if (!count) return;
      const buffer = context.createBuffer(1, count, 24_000); const channel = buffer.getChannelData(0);
      const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
      for (let index = 0; index < count; index++) channel[index] = view.getInt16(index * 2, true) / 32768;
      ready = ready.then(async () => {
        if (disposed) return;
        if (context.state !== 'running') await context.resume();
        if (disposed) return;
        if (context.state !== 'running') throw new Error('Speech output is unavailable.');
        const source = context.createBufferSource(); source.buffer = buffer; source.connect(analyser);
        const start = Math.max(context.currentTime + 0.02, nextAt);
        nextAt = start + buffer.duration; sources.set(source, { start, end: nextAt });
        source.onended = () => { sources.delete(source); source.disconnect(); checkEnd(); };
        source.start(start);
      }).catch(fail);
    },
    async finish() {
      ended = true; await ready;
      if (disposed) return;
      if (!bytes || carry !== null) { fail(new Error('PCM speech ended with incomplete samples.')); return; }
      checkEnd();
    },
  };
}
