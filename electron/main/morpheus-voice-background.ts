import type { MorpheusVoicePresence } from '@shared/morpheus/voice-types';

/** Keep audio monitoring alive only while an explicitly armed session needs it. */
export function updateMorpheusVoiceBackground(
  contents: { setBackgroundThrottling(enabled: boolean): void },
  presence: MorpheusVoicePresence,
): void {
  const audioActive = presence.ambientEnabled && presence.state !== 'asleep';
  contents.setBackgroundThrottling(!audioActive);
}
