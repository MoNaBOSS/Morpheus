import type { MorpheusVoicePresence } from './voice-types';

/** Fixed live local-wake format; frames are ephemeral and never persisted. */
export const MORPHEUS_WAKE_SAMPLE_RATE = 16_000;
export const MORPHEUS_WAKE_FRAME_SAMPLES = 3_200;
export const MORPHEUS_WAKE_FRAME_BYTES = MORPHEUS_WAKE_FRAME_SAMPLES * 2;
export const MORPHEUS_WAKE_MAX_BASE64_LENGTH = Math.ceil(MORPHEUS_WAKE_FRAME_BYTES / 3) * 4;

export interface MorpheusAmbientInputSession {
  sessionId: string | null;
  localWakeEnabled: boolean;
  presence: MorpheusVoicePresence;
}

export interface MorpheusWakeAudioFrame {
  sessionId: string;
  sequence: number;
  pcmBase64: string;
}

export function isMorpheusWakeAudioFrame(value: unknown): value is MorpheusWakeAudioFrame {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const frame = value as Record<string, unknown>;
  return Object.keys(frame).length === 3
    && typeof frame.sessionId === 'string' && /^voice-[a-f0-9-]{36}$/.test(frame.sessionId)
    && Number.isSafeInteger(frame.sequence) && (frame.sequence as number) >= 0
    && typeof frame.pcmBase64 === 'string' && frame.pcmBase64.length === MORPHEUS_WAKE_MAX_BASE64_LENGTH
    && /^[A-Za-z0-9+/]+==$/.test(frame.pcmBase64);
}
