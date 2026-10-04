import type { MorpheusVoicePresence } from '@shared/morpheus/voice-types';

/** Keep audio monitoring alive only while an explicitly armed session needs it. */
export function updateMorpheusVoiceBackground(
  contents: { setBackgroundThrottling(enabled: boolean): void },
  presence: MorpheusVoicePresence,
): void {
  // A Main-audited pending session must be scheduled while the hidden renderer
  // acquires/resumes its selected microphone. Pending never means armed.
  const audioActive = presence.ambientEnabled && presence.state !== 'error'
    && (presence.state !== 'asleep' || Boolean(presence.sessionStartedAt));
  contents.setBackgroundThrottling(!audioActive);
}
