import { describe, expect, it } from 'vitest';
import { selectMorpheusWindowsVoice } from '@/lib/morpheus-windows-voice';

const voice = (name: string, lang: string, options: Partial<SpeechSynthesisVoice> = {}) => ({
  name, lang, default: false, localService: true, voiceURI: name, ...options,
}) as SpeechSynthesisVoice;

describe('Windows speech fallback selection', () => {
  it('prefers a natural voice in the user language over a generic default', () => {
    const selected = selectMorpheusWindowsVoice([
      voice('Microsoft David Desktop', 'en-US', { default: true }),
      voice('Microsoft Aria Natural', 'en-US', { localService: false }),
      voice('Microsoft Katja', 'de-DE'),
    ], 'en-US');
    expect(selected?.name).toBe('Microsoft Aria Natural');
  });

  it('keeps language affinity stronger than an unrelated natural voice name', () => {
    const selected = selectMorpheusWindowsVoice([
      voice('Microsoft Aria Natural', 'en-US'),
      voice('Microsoft Katja', 'de-DE', { default: true }),
    ], 'de-DE');
    expect(selected?.name).toBe('Microsoft Katja');
  });

  it('returns null when Windows exposes no installed voices', () => {
    expect(selectMorpheusWindowsVoice([], 'en-US')).toBeNull();
  });
});
