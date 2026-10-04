import { MORPHEUS_WAKE_SAMPLE_RATE } from '@shared/morpheus/wake-audio-types';
import type { LocalWakeAudioRange } from './windows-wake';

/** Maximum 21.5 seconds of volatile local wake input; never persisted. */
export class MorpheusWakeAudioBuffer {
  private chunks: Buffer[] = [];
  private firstSample = 0;
  private nextSample = 0;
  append(pcm: Buffer): void {
    this.chunks.push(pcm);
    this.nextSample += pcm.length / 2;
    while (this.nextSample - this.firstSample > MORPHEUS_WAKE_SAMPLE_RATE * 21.5) {
      this.firstSample += this.chunks.shift()!.length / 2;
    }
  }
  clear(): void { this.chunks = []; this.firstSample = 0; this.nextSample = 0; }
  wave(range: LocalWakeAudioRange): Buffer {
    const { startSample, sampleCount } = range;
    if (!Number.isSafeInteger(startSample) || !Number.isSafeInteger(sampleCount) || sampleCount <= 0
      || sampleCount > MORPHEUS_WAKE_SAMPLE_RATE * 20 || startSample < this.firstSample
      || startSample + sampleCount > this.nextSample) {
      throw new Error('The addressed audio was incomplete or too long. Say the wake phrase and try a shorter command.');
    }
    const all = Buffer.concat(this.chunks);
    // SAPI clips useful acoustic context at the recognized range edges. Use
    // only already accepted bytes, with 300 ms of bounded context each side.
    const from = Math.max(this.firstSample, startSample - 4_800);
    const until = Math.min(this.nextSample, startSample + sampleCount + 4_800);
    const pcm = all.subarray((from - this.firstSample) * 2, (until - this.firstSample) * 2);
    const header = Buffer.alloc(44);
    header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
    header.writeUInt32LE(MORPHEUS_WAKE_SAMPLE_RATE, 24); header.writeUInt32LE(MORPHEUS_WAKE_SAMPLE_RATE * 2, 28);
    header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([header, pcm]);
  }
}

/** Require the included recognizer's exact wake prefix before any routing. */
export function addressedLocalWakeTranscript(transcript: string, phrase: string): string | null {
  const normalized = transcript.normalize('NFKC');
  const tokens = [...normalized.matchAll(/[\p{L}\p{N}]+/gu)];
  const wake = [...phrase.normalize('NFKC').toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)].map((token) => token[0]);
  const offset = wake[0] !== 'hey' && tokens[0]?.[0].toLowerCase() === 'hey' ? 1 : 0;
  if (!wake.length || !wake.every((word, index) => tokens[index + offset]?.[0].toLowerCase() === word)) return null;
  const end = tokens[offset + wake.length - 1];
  return normalized.slice(end.index! + end[0].length).replace(/^[\s,.:;!?\-–—]+/u, '').trim();
}
