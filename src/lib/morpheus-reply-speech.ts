import type { MorpheusReplySpeechOrigin, MorpheusVoiceSettings } from '@shared/morpheus/voice-types';

/** The originating live turn owns presentation; changing screens is irrelevant. */
export function shouldSpeakMorpheusReply(
  settings: Pick<MorpheusVoiceSettings, 'enabled' | 'speakResponses' | 'replySpeechMode'> | undefined,
  origin: MorpheusReplySpeechOrigin,
): boolean {
  if (!settings?.speakResponses || origin.input === 'voice' && !settings.enabled) return false;
  switch (settings.replySpeechMode ?? 'orb') {
    case 'orb': return origin.surface === 'compact';
    case 'voice': return origin.input === 'voice';
    case 'all': return true;
  }
}
