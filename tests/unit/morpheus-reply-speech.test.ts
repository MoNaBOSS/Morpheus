import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import { shouldSpeakMorpheusReply } from '@/lib/morpheus-reply-speech';
import en from '../../shared/i18n/locales/en/dashboard.json';
import zh from '../../shared/i18n/locales/zh/dashboard.json';
import ja from '../../shared/i18n/locales/ja/dashboard.json';
import ru from '../../shared/i18n/locales/ru/dashboard.json';

describe('live reply speech policy', () => {
  it.each([
    ['orb', 'compact', 'typed', true], ['orb', 'compact', 'voice', true],
    ['orb', 'full', 'typed', false], ['orb', 'full', 'voice', false],
    ['voice', 'compact', 'typed', false], ['voice', 'full', 'typed', false],
    ['voice', 'compact', 'voice', true], ['voice', 'full', 'voice', true],
    ['all', 'compact', 'typed', true], ['all', 'full', 'typed', true],
    ['all', 'compact', 'voice', true], ['all', 'full', 'voice', true],
  ] as const)('%s mode uses the %s origin for %s requests', (replySpeechMode, surface, input, expected) => {
    expect(shouldSpeakMorpheusReply({ enabled: true, speakResponses: true, replySpeechMode }, { surface, input })).toBe(expected);
  });
  it('defaults to orb while preserving speech-off and keeping microphone mute separate from typed replies', () => {
    expect(shouldSpeakMorpheusReply({ enabled: true, speakResponses: true }, { surface: 'compact', input: 'typed' })).toBe(true);
    expect(shouldSpeakMorpheusReply({ enabled: true, speakResponses: true }, { surface: 'full', input: 'voice' })).toBe(false);
    expect(shouldSpeakMorpheusReply({ enabled: true, speakResponses: false, replySpeechMode: 'all' }, { surface: 'compact', input: 'voice' })).toBe(false);
    expect(shouldSpeakMorpheusReply({ enabled: false, speakResponses: true }, { surface: 'compact', input: 'typed' })).toBe(true);
    expect(shouldSpeakMorpheusReply({ enabled: false, speakResponses: true }, { surface: 'full', input: 'typed' })).toBe(false);
    expect(shouldSpeakMorpheusReply({ enabled: false, speakResponses: true, replySpeechMode: 'all' }, { surface: 'compact', input: 'voice' })).toBe(false);
    expect(shouldSpeakMorpheusReply({ enabled: false, speakResponses: false, replySpeechMode: 'all' }, { surface: 'compact', input: 'typed' })).toBe(false);
  });
  it.each(Object.entries({ en, zh, ja, ru }))('resolves all policy labels and explanations in %s without fallback', async (language, dashboard) => {
    const i18n = createInstance();
    await i18n.init({ lng: language, fallbackLng: false, resources: { [language]: { dashboard } }, defaultNS: 'dashboard' });
    for (const key of ['replySpeechMode', 'replySpeechModes.orb', 'replySpeechModes.voice', 'replySpeechModes.all',
      'replySpeechDescriptions.orb', 'replySpeechDescriptions.voice', 'replySpeechDescriptions.all']) {
      const path = `morpheus.voice.settings.${key}`;
      expect(i18n.exists(path)).toBe(true); expect(i18n.t(path)).not.toBe(path);
    }
  });
});
