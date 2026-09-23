import type { AcpTimelineSnapshot, PermissionItem, ToolCallItem } from '@/lib/acp/timeline-types';
import { resolveMorpheusSignalState, type MorpheusSignalState } from '@/components/morpheus/signal/signal-state';
import type { MorpheusVoicePhase } from '@/stores/morpheus-voice';
import {
  isObjectiveTerminalState,
  type MorpheusObjectiveRun,
} from '@shared/morpheus/core/objective-types';
import type { MorpheusVoicePresenceState } from '@shared/morpheus/voice-types';

export type MorpheusChatPresenceSource = 'voice' | 'objective' | 'openclaw' | 'ready';
export type MorpheusChatPresenceActivity =
  | 'voice'
  | 'objective'
  | 'permission'
  | 'tool'
  | 'thinking'
  | 'stopping'
  | 'connecting'
  | 'error'
  | 'ready';

export type MorpheusChatPresenceSnapshot = {
  signalState: MorpheusSignalState;
  source: MorpheusChatPresenceSource;
  activity: MorpheusChatPresenceActivity;
  activeToolTitle?: string;
};

export type MorpheusChatPresenceInput = {
  timeline: AcpTimelineSnapshot;
  acpLoading: boolean;
  acpSending: boolean;
  acpCancelling: boolean;
  acpError: string | null;
  imageGenerationPending: boolean;
  voicePhase?: MorpheusVoicePhase | null;
  voicePresence?: MorpheusVoicePresenceState | null;
  objectiveRun?: MorpheusObjectiveRun | null;
};

function latestLiveItem<T extends ToolCallItem | PermissionItem>(
  timeline: AcpTimelineSnapshot,
  predicate: (item: ToolCallItem | PermissionItem) => item is T,
): T | undefined {
  for (let index = timeline.itemOrder.length - 1; index >= 0; index -= 1) {
    const item = timeline.itemsById[timeline.itemOrder[index]];
    if ((item?.kind === 'tool-call' || item?.kind === 'permission') && predicate(item)) return item;
  }
  return undefined;
}

function voiceIsEngaged(
  phase?: MorpheusVoicePhase | null,
  presence?: MorpheusVoicePresenceState | null,
): boolean {
  return Boolean(
    phase && !['idle', 'ready'].includes(phase)
    || presence && !['asleep', 'armed'].includes(presence),
  );
}

/**
 * Projects only real runtime state into the Chat Signal.
 *
 * No timer or inferred progress lives here: every non-ready state is backed by
 * Voice, Objective Core, or the ACP timeline/session lifecycle.
 */
export function resolveMorpheusChatPresence({
  timeline,
  acpLoading,
  acpSending,
  acpCancelling,
  acpError,
  imageGenerationPending,
  voicePhase,
  voicePresence,
  objectiveRun,
}: MorpheusChatPresenceInput): MorpheusChatPresenceSnapshot {
  if (voiceIsEngaged(voicePhase, voicePresence)) {
    return {
      signalState: resolveMorpheusSignalState({ voicePhase, voicePresence }),
      source: 'voice',
      activity: 'voice',
    };
  }

  if (objectiveRun && !isObjectiveTerminalState(objectiveRun.state)) {
    return {
      signalState: resolveMorpheusSignalState({ objectiveState: objectiveRun.state }),
      source: 'objective',
      activity: 'objective',
    };
  }

  if (acpError) {
    return { signalState: 'failed', source: 'openclaw', activity: 'error' };
  }

  const permission = latestLiveItem(
    timeline,
    (item): item is PermissionItem => item.kind === 'permission' && item.status === 'pending',
  );
  if (permission) {
    return { signalState: 'trust', source: 'openclaw', activity: 'permission' };
  }

  const tool = latestLiveItem(
    timeline,
    (item): item is ToolCallItem => item.kind === 'tool-call'
      && !item.historical
      && (item.status === 'pending' || item.status === 'running'),
  );
  if (tool) {
    return {
      signalState: 'executing',
      source: 'openclaw',
      activity: 'tool',
      activeToolTitle: tool.title,
    };
  }

  if (acpCancelling) {
    return { signalState: 'understanding', source: 'openclaw', activity: 'stopping' };
  }

  if (acpSending || imageGenerationPending) {
    return { signalState: 'understanding', source: 'openclaw', activity: 'thinking' };
  }

  if (acpLoading) {
    return { signalState: 'understanding', source: 'openclaw', activity: 'connecting' };
  }

  // Keep the result of a Chat-origin Objective visible until the user starts a
  // new interaction. Objectives from other surfaces do not repaint idle Chat.
  if (objectiveRun?.origin.type === 'chat') {
    return {
      signalState: resolveMorpheusSignalState({ objectiveState: objectiveRun.state }),
      source: 'objective',
      activity: 'objective',
    };
  }

  return { signalState: 'ready', source: 'ready', activity: 'ready' };
}
