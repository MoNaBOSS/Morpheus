import { randomUUID } from 'node:crypto';
import type { ManagedRuntimeBridge } from '../managed/runtime-bridge';
import { createTypedMorpheusPlanner, type MorpheusPlannerUsage } from './provider-planner';

/** One objective, one managed generation and a pinned logical quality route.
 * A missing/failed service never falls through to the user's private API key. */
export function createMorpheusManagedPlanner(options: {
  runtime: ManagedRuntimeBridge;
  recordUsage?: (usage: MorpheusPlannerUsage) => Promise<void>;
}) {
  const generation = options.runtime.getGeneration();
  let owner: string | undefined, requests = 0, reservedOutput = 0;
  let complex: boolean | undefined;
  return createTypedMorpheusPlanner({ plannerId: 'managed:planning', async invoke(system, user, objective, signal, objectiveRunId) {
    signal?.throwIfAborted();
    if (!objectiveRunId || requests > 0 && owner !== objectiveRunId) throw new Error('Managed planning requires its original objective owner.');
    if (generation !== options.runtime.getGeneration()) throw new Error('Managed service changed. Start a new task with the selected service.');
    const inputChars = system.length + user.length;
    const outputTokenLimit = /\b(website|web site|landing page)\b/i.test(objective) ? 4096 : 2048;
    if (inputChars > 48_000 || requests >= 4 || reservedOutput + outputTokenLimit > 12_288) throw new Error('Planning request allowance reached. Review the current result before continuing.');
    owner = objectiveRunId;
    // Logical server route only, never an invented provider/model identifier.
    complex ??= /\b(research|website|web site|landing page|compare|analysis)\b/i.test(objective);
    const serviceRoute = complex ? 'planning-complex' : 'planning';
    const requestId = randomUUID(); requests++; reservedOutput += outputTokenLimit;
    const started = performance.now();
    const usage: MorpheusPlannerUsage = { requestId, objectiveRunId, phase: 'started', requestNumber: requests, inputChars, outputTokenLimit,
      modelId: `managed-route:${serviceRoute}`, serviceRoute, costStatus: 'unknown' };
    await options.recordUsage?.(usage);
    let recorded = false;
    try {
      signal?.throwIfAborted();
      if (generation !== options.runtime.getGeneration()) throw new Error('Managed service changed.');
      const result = await options.runtime.text({ requestId, objectiveId: objectiveRunId, kind: 'planning', complex,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }], maxOutputTokens: outputTokenLimit }, signal);
      signal?.throwIfAborted();
      if (generation !== options.runtime.getGeneration()) throw new Error('Managed service changed.');
      const { output, receipt } = result;
      recorded = true; // A failed audit must not cause another paid request.
      await options.recordUsage?.({ ...usage, phase: 'completed', durationMs: Math.round(performance.now() - started),
        modelId: output.modelId, usageStatus: output.usage ? 'reported' : 'missing',
        ...(output.usage ? { ...output.usage, totalTokens: output.usage.inputTokens + output.usage.outputTokens } : {}),
        costStatus: receipt.state === 'settled' && receipt.chargedMicroUsd !== null ? 'known' : 'unknown',
        reservedMicroUsd: receipt.reservedMicroUsd, ...(receipt.chargedMicroUsd !== null ? { chargedMicroUsd: receipt.chargedMicroUsd } : {}),
        ...(receipt.assessedCostMicroUsd !== null ? { assessedCostMicroUsd: receipt.assessedCostMicroUsd } : {}),
        ...(receipt.costEvidence ? { costEvidence: receipt.costEvidence } : {}), rateVersion: receipt.rateVersion, receiptState: receipt.state });
      return output.text;
    } catch {
      if (!recorded) await options.recordUsage?.({ ...usage, phase: signal?.aborted ? 'cancelled' : 'failed', usageStatus: 'missing',
        durationMs: Math.round(performance.now() - started) });
      throw new Error(signal?.aborted ? 'Managed planning cancelled; any dispatched usage remains recorded by the service.'
        : 'Managed planning is unavailable. Check your managed account and the original request receipt; no personal API was used.');
    }
  } });
}
