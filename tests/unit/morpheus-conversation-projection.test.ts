import { describe, expect, it } from 'vitest';
import { interleaveMorpheusConversation, projectMorpheusConversation } from '@/lib/morpheus-conversation-projection';
import type { AcpTimelineSnapshot, TimelineItem } from '@/lib/acp/timeline-types';
import type { MorpheusAssistantPendingTurn } from '@shared/morpheus/assistant-session-types';
import type { MorpheusObjectiveRun } from '@shared/morpheus/core/objective-types';

function timeline(sessionId: string, items: TimelineItem[]): AcpTimelineSnapshot {
  return {
    sessionId,
    loadGeneration: 2,
    itemOrder: items.map((item) => item.id),
    itemsById: Object.fromEntries(items.map((item) => [item.id, item])),
    metadata: {},
    openMessageSegments: {},
    segmentCounts: {},
  };
}

describe('compact conversation projection', () => {
  it('shows the current ACP conversation and never mixes another selected session', () => {
    const history = timeline('agent:main:one', [
      { kind: 'message-segment', id: 'u:0', role: 'user', messageId: 'u', segmentIndex: 0, parts: [{ kind: 'markdown', text: 'What changed?' }] },
      { kind: 'tool-call', id: 'tool', toolCallId: 'tool', title: 'Internal tool', status: 'completed', outputParts: [{ kind: 'markdown', text: 'private output' }], locations: [] },
      { kind: 'message-segment', id: 'a:0', role: 'assistant', messageId: 'a', segmentIndex: 0, parts: [{ kind: 'markdown', text: 'The report is ready.' }] },
      { kind: 'message-segment', id: 'a:1', role: 'assistant', messageId: 'a', segmentIndex: 1, parts: [{ kind: 'markdown', text: ' You can review it.' }] },
    ]);

    expect(projectMorpheusConversation(history, 'agent:main:other')).toEqual({ messages: [], permissions: [] });
    expect(projectMorpheusConversation(history, 'agent:main:one').messages).toMatchObject([
      { role: 'user', text: 'What changed?' },
      { role: 'assistant', text: 'The report is ready. You can review it.' },
    ]);
    expect(JSON.stringify(projectMorpheusConversation(history, 'agent:main:one'))).not.toContain('private output');
  });

  it('keeps pending permission visible when older messages are bounded', () => {
    const history = timeline('agent:main:main', [
      ...Array.from({ length: 8 }, (_, index) => ({
        kind: 'message-segment' as const,
        id: `user-${index}`,
        role: 'user' as const,
        messageId: `user-${index}`,
        segmentIndex: 0,
        parts: [{ kind: 'markdown' as const, text: `Message ${index}` }],
      })),
      { kind: 'permission', id: 'permission-1', requestId: 'permission-1', title: 'Read a file', options: [{ optionId: 'deny', name: 'Deny', kind: 'reject' }], status: 'pending' },
    ]);

    const projection = projectMorpheusConversation(history, 'agent:main:main', { messageLimit: 2 });
    expect(projection.messages.map((message) => message.text)).toEqual(['Message 6', 'Message 7']);
    expect(projection.permissions).toMatchObject([{ requestId: 'permission-1' }]);
  });

  it('bounds streaming text and accounts for rich media without exposing raw parts', () => {
    const history = timeline('agent:main:main', [
      { kind: 'message-segment', id: 'reply', role: 'assistant', messageId: 'reply', segmentIndex: 0,
        parts: [{ kind: 'markdown', text: 'A'.repeat(120) }, { kind: 'image', source: 'data:image/png;base64,private' }] },
    ]);
    expect(projectMorpheusConversation(history, 'agent:main:main', { textLimit: 100 }).messages).toMatchObject([
      { text: 'A'.repeat(100), mediaCount: 1, truncated: true },
    ]);
  });
});

function turn(id: string, admittedAt: string, conversationId = 'agent:main:main'): MorpheusAssistantPendingTurn {
  return { conversationId, turnId: id, clientRequestId: id, source: 'full', status: 'admitted', generation: 1, admittedAt, text: id };
}

function objective(id: string, createdAt: string): MorpheusObjectiveRun {
  return { v: 1, objectiveRunId: id, objective: id, origin: { type: 'command-bar', commandText: id },
    state: 'complete', createdAt, updatedAt: '2026-10-02T00:59:00.000Z', iteration: 1,
    corrections: [], planIds: [], observations: [], artifacts: [] };
}

describe('continuous conversation/task display', () => {
  const times = ['2026-10-02T00:00:00.000Z', '2026-10-02T00:01:00.000Z', '2026-10-02T00:02:00.000Z', '2026-10-02T00:03:00.000Z'];
  const history = timeline('agent:main:main', ['older', 'newer'].flatMap((id) => [
    { kind: 'message-segment' as const, id: `${id}:user`, role: 'user' as const, messageId: id, segmentIndex: 0, parts: [{ kind: 'markdown' as const, text: `${id} question` }] },
    { kind: 'message-segment' as const, id: `${id}:reply`, role: 'assistant' as const, messageId: `${id}-reply`, segmentIndex: 0, parts: [{ kind: 'markdown' as const, text: `${id} reply` }] },
  ]));
  const summarize = (entries: ReturnType<typeof interleaveMorpheusConversation>) => entries.map((entry) => entry.kind === 'message' ? entry.message.text : entry.kind === 'objective' ? entry.run.objective : entry.turn.text);

  it('places earlier tasks before later chat and queues, using creation rather than completion time', () => {
    const entries = interleaveMorpheusConversation({
      projection: projectMorpheusConversation(history, 'agent:main:main'), sessionKey: 'agent:main:main',
      turns: [turn('older', times[0]), turn('newer', times[2])],
      pendingTurns: [turn('newer', times[2]), turn('queued', times[3]), turn('other-session', times[0], 'agent:main:other')],
      objectiveRuns: [objective('later task', times[3]), objective('middle task', times[1])],
    });
    expect(summarize(entries)).toEqual(['older question', 'older reply', 'middle task', 'newer question', 'newer reply', 'queued', 'later task']);
  });

  it('retains a user anchor when compact history begins at the assistant reply', () => {
    const entries = interleaveMorpheusConversation({
      projection: projectMorpheusConversation(history, 'agent:main:main', { messageLimit: 1 }), sessionKey: 'agent:main:main',
      turns: [turn('newer', times[2])], pendingTurns: [turn('newer', times[2])], objectiveRuns: [objective('middle task', times[1])],
    });
    expect(summarize(entries)).toEqual(['middle task', 'newer reply']);
  });

  it('restores task chronology after Main admission refs are absent using canonical transcript starts', () => {
    const entries = interleaveMorpheusConversation({
      projection: projectMorpheusConversation(history, 'agent:main:main'), sessionKey: 'agent:main:main',
      turns: [], pendingTurns: [], objectiveRuns: [objective('middle task', times[1])],
      turnTimingsByUserMessageId: {
        older: { source: 'transcript', status: 'complete', durationMs: 2_000, startedAtMs: Date.parse(times[0]) },
        newer: { source: 'transcript', status: 'complete', durationMs: 2_000, startedAtMs: Date.parse(times[2]) },
      },
    });
    expect(summarize(entries)).toEqual(['older question', 'older reply', 'middle task', 'newer question', 'newer reply']);
  });

  it('prefers original Main admission over a historical fallback and keeps bounded reply anchors', () => {
    const entries = interleaveMorpheusConversation({
      projection: projectMorpheusConversation(history, 'agent:main:main', { messageLimit: 1 }), sessionKey: 'agent:main:main',
      turns: [turn('newer', times[2])], pendingTurns: [], objectiveRuns: [objective('middle task', times[1])],
      turnTimingsByUserMessageId: { newer: { source: 'transcript', status: 'complete', durationMs: 2_000, startedAtMs: Date.parse(times[0]) } },
    });
    expect(summarize(entries)).toEqual(['middle task', 'newer reply']);
    expect(summarize(interleaveMorpheusConversation({
      projection: projectMorpheusConversation(history, 'agent:main:main', { messageLimit: 1 }), sessionKey: 'agent:main:main',
      turns: [], pendingTurns: [], objectiveRuns: [objective('middle task', times[1])],
      turnTimingsByUserMessageId: { newer: { source: 'transcript', status: 'complete', durationMs: 2_000, startedAtMs: Date.parse(times[2]) } },
    }))).toEqual(['middle task', 'newer reply']);
  });

  it('never uses invalid or running live metadata to invent missing historical chronology', () => {
    for (const timing of [
      { source: 'transcript' as const, status: 'complete' as const, durationMs: 2_000 },
      { source: 'transcript' as const, status: 'complete' as const, durationMs: 2_000, startedAtMs: 1e20 },
      { source: 'live' as const, status: 'running' as const, startedAtMs: Date.parse(times[2]) },
    ]) {
      expect(summarize(interleaveMorpheusConversation({
        projection: projectMorpheusConversation(history, 'agent:main:main'), sessionKey: 'agent:main:main',
        turns: [], pendingTurns: [], objectiveRuns: [objective('middle task', times[1])],
        turnTimingsByUserMessageId: { newer: timing },
      }))).toEqual(['older question', 'older reply', 'newer question', 'newer reply', 'middle task']);
    }
  });

  it('keeps undated historical ACP messages in their original order without invented chronology', () => {
    const entries = interleaveMorpheusConversation({
      projection: projectMorpheusConversation(history, 'agent:main:main'), sessionKey: 'agent:main:main',
      turns: [turn('newer', times[2])], pendingTurns: [], objectiveRuns: [objective('middle task', times[1])],
    });
    expect(summarize(entries)).toEqual(['older question', 'older reply', 'middle task', 'newer question', 'newer reply']);
  });
});
