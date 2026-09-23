export type MorpheusInstalledVoice = Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'default' | 'localService'>;

const NATURAL_VOICE = /\b(natural|aria|jenny|guy|sonia|ryan|libby|ava|andrew|brian|emma)\b/i;

/** Selects a good installed fallback without presenting it as neural speech. */
export function selectMorpheusWindowsVoice<T extends MorpheusInstalledVoice>(
  voices: readonly T[],
  locale = 'en-US',
): T | null {
  if (voices.length === 0) return null;
  const exactLocale = locale.toLowerCase();
  const language = exactLocale.split('-')[0];
  return [...voices].sort((left, right) => {
    const score = (voice: T): number => {
      const voiceLocale = voice.lang.toLowerCase();
      return (voiceLocale === exactLocale ? 80 : voiceLocale.split('-')[0] === language ? 50 : 0)
        + (NATURAL_VOICE.test(voice.name) ? 40 : 0)
        + (voice.default ? 8 : 0)
        + (voice.localService ? 2 : 0);
    };
    return score(right) - score(left) || left.name.localeCompare(right.name);
  })[0] ?? null;
}

/** Chromium may populate Windows voices after the first getVoices call. */
export async function resolveMorpheusWindowsVoice(
  synthesis: SpeechSynthesis,
  locale = navigator.language,
): Promise<SpeechSynthesisVoice | null> {
  // Some Chromium builds (and accessibility/test shims) expose speak/cancel
  // before the installed-voice catalogue API is ready. Speech must still work
  // with the platform default in that case.
  if (typeof synthesis.getVoices !== 'function') return null;
  const immediate = synthesis.getVoices();
  if (immediate.length > 0) return selectMorpheusWindowsVoice(immediate, locale);
  if (typeof synthesis.addEventListener !== 'function'
    || typeof synthesis.removeEventListener !== 'function') return null;
  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(done, 500);
    function done(): void {
      window.clearTimeout(timer);
      synthesis.removeEventListener('voiceschanged', done);
      resolve();
    }
    synthesis.addEventListener('voiceschanged', done, { once: true });
  });
  return selectMorpheusWindowsVoice(synthesis.getVoices(), locale);
}
