import { join } from 'node:path';
import type { MorpheusWorkerOwner, MorpheusWorkerUsage } from '@shared/morpheus/worker-types';
import { readValidatedJson, writeJsonAtomically } from '../storage/atomic-json';

export type MorpheusWorkerCheckpoint = MorpheusWorkerOwner & {
  v: 1;
  workerRunId: string;
  operation: 'web.readPage';
  origin: string;
  state: 'running' | 'completed' | 'failed' | 'cancelled' | 'needs-review';
  effect: 'none' | 'verified' | 'unknown';
  usage: MorpheusWorkerUsage;
  updatedAt: string;
  contentSha256?: string;
};

function valid(value: unknown): value is MorpheusWorkerCheckpoint {
  if (!value || typeof value !== 'object') return false;
  const entry = value as MorpheusWorkerCheckpoint;
  return entry.v === 1 && ['workerRunId', 'objectiveRunId', 'attemptId', 'planId', 'stepId', 'origin', 'updatedAt'].every((key) =>
    typeof (entry as unknown as Record<string, unknown>)[key] === 'string')
    && entry.operation === 'web.readPage' && Number.isSafeInteger(entry.cancellationGeneration)
    && ['running', 'completed', 'failed', 'cancelled', 'needs-review'].includes(entry.state)
    && ['none', 'verified', 'unknown'].includes(entry.effect)
    && Boolean(entry.usage) && ['known', 'unknown'].includes(entry.usage.status)
    && (entry.usage.status === 'unknown' || [entry.usage.inputTokens, entry.usage.outputTokens, entry.usage.costUsd].every((count) => Number.isFinite(count) && count >= 0));
}

/** Recovery keeps metadata, never source excerpts, URLs with query strings or keys. */
export function createMorpheusWorkerCheckpoints(userDataDir: string) {
  const file = join(userDataDir, 'morpheus', 'worker-checkpoints.json');
  const loaded = readValidatedJson(file, (value) => {
    const data = value as { v?: unknown; entries?: unknown } | null;
    return data?.v === 1 && Array.isArray(data.entries) && data.entries.length <= 100 ? data.entries.filter(valid) : null;
  }) ?? [];
  let entries = new Map(loaded.map((entry) => [entry.workerRunId, entry]));
  return {
    list: () => [...entries.values()].map((entry) => structuredClone(entry)),
    get: (id: string) => entries.has(id) ? structuredClone(entries.get(id)!) : undefined,
    put(entry: MorpheusWorkerCheckpoint) {
      if (!valid(entry)) throw new Error('Invalid worker checkpoint.');
      const next = new Map(entries);
      next.set(entry.workerRunId, structuredClone(entry));
      while (next.size > 100) {
        const oldest = [...next.values()].find((item) => item.state !== 'running' && item.state !== 'needs-review');
        if (!oldest) throw new Error('Worker checkpoint capacity reached.');
        next.delete(oldest.workerRunId);
      }
      writeJsonAtomically(file, { v: 1, entries: [...next.values()] });
      entries = next;
    },
    reconcile() {
      for (const entry of [...entries.values()]) if (entry.state === 'running') {
        this.put({ ...entry, state: 'needs-review', updatedAt: new Date().toISOString() });
      }
      return [...entries.values()].filter((entry) => entry.state === 'needs-review').map((entry) => ({
        workerRunId: entry.workerRunId, objectiveRunId: entry.objectiveRunId,
        // The public-reader adapter has no model or durable write path. Other
        // adapters must supply evidence before receiving any replay permission.
        replaySafe: entry.operation === 'web.readPage' && entry.effect === 'none' && entry.usage.status === 'known'
          && entry.usage.inputTokens === 0 && entry.usage.outputTokens === 0 && entry.usage.costUsd === 0,
      }));
    },
  };
}

export type MorpheusWorkerCheckpoints = ReturnType<typeof createMorpheusWorkerCheckpoints>;
