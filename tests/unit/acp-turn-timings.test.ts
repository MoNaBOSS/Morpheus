import { describe, expect, it } from 'vitest';
import type { SessionTurnTimingCandidate } from '@shared/host-api/contract';
import { alignHistoricalTurnTimings } from '@/lib/acp/turn-timings';
import { createEmptyAcpTimeline } from '@/lib/acp/reducer';
import type { AcpTimelineSnapshot } from '@/lib/acp/timeline-types';

function timeline(turns: Array<{ userId: string; text: string; promptBlocks?: string[] }>): AcpTimelineSnapshot {
  const snapshot = createEmptyAcpTimeline('agent:main:session-1', 2);
  for (const turn of turns) {
    const id = `${turn.userId}:0`;
    snapshot.itemOrder.push(id);
    snapshot.itemsById[id] = {
      kind: 'message-segment',
      id,
      role: 'user',
      messageId: turn.userId,
      segmentIndex: 0,
      parts: [{ kind: 'markdown', text: turn.text }],
      ...(turn.promptBlocks ? { userPromptTextBlocks: turn.promptBlocks } : {}),
    };
  }
  return snapshot;
}

function timing(
  normalizedUserText: string,
  userOccurrenceFromTail: number,
  durationMs: number,
  startedAtMs?: number,
): SessionTurnTimingCandidate {
  return { normalizedUserText, userOccurrenceFromTail, durationMs, ...(startedAtMs !== undefined ? { startedAtMs } : {}) };
}

describe('ACP historical turn timing alignment', () => {
  it('aligns repeated prompts from the tail without changing ACP turn identity', () => {
    const snapshot = timeline([
      { userId: 'user-old', text: 'Repeat this' },
      { userId: 'user-other', text: 'Different prompt' },
      { userId: 'user-new', text: 'Repeat this' },
    ]);

    expect(alignHistoricalTurnTimings(snapshot, [
      timing('Repeat this', 2, 5_000),
      timing('Different prompt', 1, 2_500),
      timing('Repeat this', 1, 4_000),
    ])).toEqual({
      'user-old': { source: 'transcript', status: 'complete', durationMs: 5_000 },
      'user-other': { source: 'transcript', status: 'complete', durationMs: 2_500 },
      'user-new': { source: 'transcript', status: 'complete', durationMs: 4_000 },
    });
  });

  it('uses the binary-free ACP prompt projection and rejects missing or duplicate candidates', () => {
    const snapshot = timeline([{
      userId: 'user-resource',
      text: 'Rendered fallback text',
      promptBlocks: ['Create report', '[Resource link]\nURI: file:///repo/input.csv\nName: input.csv'],
    }]);
    const candidate = timing(
      'Create report\n[Resource link]\nURI: file:///repo/input.csv\nName: input.csv',
      1,
      7_500,
    );

    expect(alignHistoricalTurnTimings(snapshot, [candidate])).toEqual({
      'user-resource': { source: 'transcript', status: 'complete', durationMs: 7_500 },
    });
    expect(alignHistoricalTurnTimings(snapshot, [candidate, candidate])).toEqual({});
    expect(alignHistoricalTurnTimings(snapshot, [timing('Unknown', 1, 1_000)])).toEqual({});
  });

  it('does not project invalid durations', () => {
    const snapshot = timeline([{ userId: 'user-1', text: 'Hello' }]);

    expect(alignHistoricalTurnTimings(snapshot, [
      timing('Hello', 1, Number.NaN),
      timing('Hello', 1, -1),
    ])).toEqual({});
  });

  it('retains original starts for repeated prompts using their existing tail occurrence', () => {
    const snapshot = timeline([
      { userId: 'old', text: 'Repeat this' },
      { userId: 'new', text: 'Repeat this' },
    ]);
    expect(alignHistoricalTurnTimings(snapshot, [
      timing('Repeat this', 1, 4_000, 2_000),
      timing('Repeat this', 2, 5_000, 1_000),
    ])).toEqual({
      new: { source: 'transcript', status: 'complete', durationMs: 4_000, startedAtMs: 2_000 },
      old: { source: 'transcript', status: 'complete', durationMs: 5_000, startedAtMs: 1_000 },
    });
  });

  it('keeps valid durations but rejects invalid or reversed chronological evidence', () => {
    const snapshot = timeline([{ userId: 'old', text: 'Old' }, { userId: 'new', text: 'New' }]);
    expect(alignHistoricalTurnTimings(snapshot, [
      timing('Old', 1, 5_000, 2_000), timing('New', 1, 4_000, 1_000),
    ])).toEqual({
      old: { source: 'transcript', status: 'complete', durationMs: 5_000 },
      new: { source: 'transcript', status: 'complete', durationMs: 4_000 },
    });
    for (const startedAtMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1e20]) {
      expect(alignHistoricalTurnTimings(snapshot, [timing('Old', 1, 5_000, startedAtMs)]))
        .toEqual({ old: { source: 'transcript', status: 'complete', durationMs: 5_000 } });
    }
  });

  it('rejects a reused ACP user identity across distinct correlated turns', () => {
    const snapshot = timeline([{ userId: 'reused', text: 'First' }, { userId: 'other', text: 'Other' }, { userId: 'reused', text: 'Last' }]);
    // Give the first and last occurrence distinct segment IDs while preserving
    // the malformed repeated owner ID; an identity must never date two turns.
    snapshot.itemOrder[0] = 'reused:first';
    snapshot.itemsById['reused:first'] = { ...snapshot.itemsById['reused:0']!, id: 'reused:first', parts: [{ kind: 'markdown', text: 'First' }] } as typeof snapshot.itemsById[string];
    expect(alignHistoricalTurnTimings(snapshot, [timing('First', 1, 1_000, 1_000), timing('Last', 1, 1_000, 3_000)]))
      .toEqual({});
  });
});
