import type { SessionTurnTimingCandidate } from '@shared/host-api/contract';
import { acpUserTurns, turnMatchKey } from './openclaw-media-compat';
import type { AcpTimelineSnapshot } from './timeline-types';

export type AcpTurnTiming =
  | { source: 'live'; status: 'running'; startedAtMs: number }
  | { source: 'live' | 'transcript'; status: 'complete'; durationMs: number; startedAtMs?: number };

export function alignHistoricalTurnTimings(
  snapshot: AcpTimelineSnapshot,
  timings: SessionTurnTimingCandidate[],
): Record<string, AcpTurnTiming> {
  const turns = acpUserTurns(snapshot);
  const turnIdCounts = new Map<string, number>();
  for (const turn of turns) turnIdCounts.set(turn.turnId, (turnIdCounts.get(turn.turnId) ?? 0) + 1);
  const acpByKey = new Map(turns.filter((turn) => turnIdCounts.get(turn.turnId) === 1)
    .map((turn) => [turnMatchKey(turn), turn]));
  const validTimings = timings.filter((timing) => (
    Number.isFinite(timing.durationMs) && timing.durationMs >= 0
  ));
  const timingKeyCounts = new Map<string, number>();
  for (const timing of validTimings) {
    const key = turnMatchKey(timing);
    timingKeyCounts.set(key, (timingKeyCounts.get(key) ?? 0) + 1);
  }

  const result: Record<string, AcpTurnTiming> = {};
  for (const timing of validTimings) {
    const key = turnMatchKey(timing);
    if (timingKeyCounts.get(key) !== 1) continue;
    const turn = acpByKey.get(key);
    if (!turn) continue;
    result[turn.turnId] = {
      source: 'transcript',
      status: 'complete',
      durationMs: timing.durationMs,
      ...(typeof timing.startedAtMs === 'number' && timing.startedAtMs > 0
        && Number.isFinite(new Date(timing.startedAtMs).getTime())
        ? { startedAtMs: timing.startedAtMs } : {}),
    };
  }
  // Correlated transcript starts must agree with authoritative ACP turn order.
  // A skewed/reversed supplement may still explain durations, but cannot date
  // the conversation relative to tasks. Missing starts remain unknown.
  let previousStart: number | undefined;
  for (const turn of turns) {
    const timing = result[turn.turnId];
    const startedAtMs = timing?.status === 'complete' ? timing.startedAtMs : undefined;
    if (startedAtMs === undefined) continue;
    if (previousStart !== undefined && startedAtMs < previousStart) {
      for (const item of Object.values(result)) if (item.status === 'complete') delete item.startedAtMs;
      break;
    }
    previousStart = startedAtMs;
  }
  return result;
}
