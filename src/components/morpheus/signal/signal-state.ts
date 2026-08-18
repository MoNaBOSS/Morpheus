import type { MorpheusSystemState } from '@shared/morpheus/core/objective-types';
import type { MorpheusVoicePresenceState } from '@shared/morpheus/voice-types';
import type { MorpheusVoicePhase } from '@/stores/morpheus-voice';

export type MorpheusSignalState =
  | 'asleep'
  | 'ready'
  | 'listening'
  | 'understanding'
  | 'planning'
  | 'trust'
  | 'executing'
  | 'speaking'
  | 'complete'
  | 'failed'
  | 'degraded';

type SignalInput = {
  voicePhase?: MorpheusVoicePhase | null;
  voicePresence?: MorpheusVoicePresenceState | null;
  objectiveState?: MorpheusSystemState | null;
};

const OBJECTIVE_SIGNAL: Readonly<Record<MorpheusSystemState, MorpheusSignalState>> = {
  ready: 'ready',
  listening: 'listening',
  understanding: 'understanding',
  planning: 'planning',
  'waiting-for-approval': 'trust',
  executing: 'executing',
  observing: 'executing',
  replanning: 'planning',
  speaking: 'speaking',
  complete: 'complete',
  'needs-clarification': 'trust',
  cancelled: 'ready',
  degraded: 'degraded',
  error: 'failed',
};

const PRESENCE_SIGNAL: Readonly<Record<MorpheusVoicePresenceState, MorpheusSignalState>> = {
  asleep: 'asleep',
  armed: 'ready',
  listening: 'listening',
  transcribing: 'understanding',
  understanding: 'understanding',
  'waiting-for-approval': 'trust',
  working: 'executing',
  speaking: 'speaking',
  error: 'failed',
};

export function resolveMorpheusSignalState({
  voicePhase,
  voicePresence,
  objectiveState,
}: SignalInput): MorpheusSignalState {
  if (voicePhase === 'listening') return 'listening';
  if (voicePhase === 'requesting' || voicePhase === 'transcribing') return 'understanding';
  if (voicePhase === 'error') return 'failed';
  if (objectiveState) return OBJECTIVE_SIGNAL[objectiveState];
  if (voicePresence) return PRESENCE_SIGNAL[voicePresence];
  return 'ready';
}
