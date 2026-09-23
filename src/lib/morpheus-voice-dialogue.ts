import { MORPHEUS_VOICE_FOLLOW_UP_MS } from '@shared/morpheus/voice-types';

/** Short-lived addressing state. It never grants authority to execute a tool. */
export const MORPHEUS_FOLLOW_UP_MS = MORPHEUS_VOICE_FOLLOW_UP_MS;
export type VoiceAddress =
  | { kind: 'ignore' }
  | { kind: 'wake' }
  | { kind: 'command'; text: string };

export function matchMorpheusAddress(transcript: string, phrase: string): VoiceAddress {
  // Slice the same normalized string used for indices (full-width/ligature safety).
  const normalized = transcript.normalize('NFKC');
  const tokens = [...normalized.matchAll(/[\p{L}\p{N}]+/gu)];
  const wake = [...phrase.normalize('NFKC').toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)].map((m) => m[0]);
  if (!wake.length) return { kind: 'ignore' };
  for (let i = 0; i <= tokens.length - wake.length; i += 1) {
    if (!wake.every((word, j) => word === tokens[i + j][0].toLowerCase())) continue;
    const end = tokens[i + wake.length - 1];
    const text = normalized.slice(end.index! + end[0].length).replace(/^[\s,.:;!?\-–—]+/u, '').trim();
    return text ? { kind: 'command', text } : { kind: 'wake' };
  }
  return { kind: 'ignore' };
}

export class MorpheusVoiceDialogue {
  private until = 0;
  reset(): void { this.until = 0; }
  open(now: number): number { this.until = now + MORPHEUS_FOLLOW_UP_MS; return this.until; }
  accept(transcript: string, phrase: string, now: number): VoiceAddress {
    const addressed = matchMorpheusAddress(transcript, phrase);
    if (addressed.kind === 'wake') { this.open(now); return addressed; }
    if (addressed.kind === 'command') { this.reset(); return addressed; }
    const active = now < this.until;
    this.reset(); // one subsequent utterance, not indefinite authorization
    const text = transcript.trim();
    return active && text ? { kind: 'command', text } : { kind: 'ignore' };
  }
}
