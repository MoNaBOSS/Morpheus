import { describe, expect, it } from 'vitest';

import type { AcpTimelineSnapshot, PermissionItem, ToolCallItem } from '@/lib/acp/timeline-types';
import { resolveMorpheusChatPresence } from '@/pages/Chat/morpheus-chat-presence';
import type { MorpheusObjectiveRun } from '@shared/morpheus/core/objective-types';

function timeline(items: Array<ToolCallItem | PermissionItem> = []): AcpTimelineSnapshot {
  return {
    sessionId: 'agent:main:main',
    loadGeneration: 1,
    itemOrder: items.map((item) => item.id),
    itemsById: Object.fromEntries(items.map((item) => [item.id, item])),
    metadata: {},
    openMessageSegments: {},
    segmentCounts: {},
  };
}

function tool(status: ToolCallItem['status']): ToolCallItem {
  return {
    kind: 'tool-call',
    id: 'tool:browser',
    toolCallId: 'browser',
    title: 'Open the browser',
    status,
    outputParts: [],
    locations: [],
  };
}

function permission(): PermissionItem {
  return {
    kind: 'permission',
    id: 'permission:browser',
    requestId: 'permission-1',
    title: 'Open the browser',
    options: [],
    status: 'pending',
  };
}

function objective(state: MorpheusObjectiveRun['state'], origin: 'chat' | 'command-bar' = 'chat'): MorpheusObjectiveRun {
  return {
    v: 1,
    objectiveRunId: 'objective-1',
    objective: 'Show system information',
    origin: origin === 'chat' ? { type: 'chat' } : { type: 'command-bar', commandText: 'Show system information' },
    state,
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:01.000Z',
    iteration: 0,
    corrections: [],
    planIds: [],
    observations: [],
    artifacts: [],
  };
}

const idle = {
  timeline: timeline(),
  acpLoading: false,
  acpSending: false,
  acpCancelling: false,
  acpError: null,
  imageGenerationPending: false,
} as const;

describe('Morpheus Chat presence projection', () => {
  it('is ready only when no real runtime is active', () => {
    expect(resolveMorpheusChatPresence(idle)).toEqual({
      signalState: 'ready', source: 'ready', activity: 'ready',
    });
  });

  it('shows real OpenClaw thinking, tool and permission states', () => {
    expect(resolveMorpheusChatPresence({ ...idle, acpSending: true })).toMatchObject({
      signalState: 'understanding', source: 'openclaw', activity: 'thinking',
    });
    expect(resolveMorpheusChatPresence({ ...idle, timeline: timeline([tool('running')]) })).toMatchObject({
      signalState: 'executing', source: 'openclaw', activity: 'tool', activeToolTitle: 'Open the browser',
    });
    expect(resolveMorpheusChatPresence({ ...idle, timeline: timeline([tool('running'), permission()]) })).toMatchObject({
      signalState: 'trust', source: 'openclaw', activity: 'permission',
    });
  });

  it('gives live Voice and Objective Core priority over Chat transport state', () => {
    expect(resolveMorpheusChatPresence({
      ...idle,
      acpSending: true,
      objectiveRun: objective('executing'),
    })).toMatchObject({ signalState: 'executing', source: 'objective', activity: 'objective' });

    expect(resolveMorpheusChatPresence({
      ...idle,
      objectiveRun: objective('executing'),
      voicePhase: 'listening',
      voicePresence: 'listening',
    })).toMatchObject({ signalState: 'listening', source: 'voice', activity: 'voice' });
  });

  it('keeps a Chat-origin objective result visible without leaking results from other surfaces', () => {
    expect(resolveMorpheusChatPresence({ ...idle, objectiveRun: objective('complete') })).toMatchObject({
      signalState: 'complete', source: 'objective', activity: 'objective',
    });
    expect(resolveMorpheusChatPresence({
      ...idle,
      objectiveRun: objective('complete', 'command-bar'),
    })).toEqual({ signalState: 'ready', source: 'ready', activity: 'ready' });
  });

  it('never turns a historical replayed tool into live execution', () => {
    expect(resolveMorpheusChatPresence({
      ...idle,
      timeline: timeline([{ ...tool('running'), historical: true }]),
    })).toEqual({ signalState: 'ready', source: 'ready', activity: 'ready' });
  });
});
