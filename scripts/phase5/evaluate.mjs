import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const number = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const id = (value) => typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,120}$/.test(value);
const mean = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

/** Offline reducer only. It has no provider client, credential lookup or network path. */
export function evaluate(input) {
  if (input?.schema !== 'morpheus.phase5.evaluation.v1' || !Array.isArray(input.runs)) {
    throw new Error('Expected morpheus.phase5.evaluation.v1 and runs array.');
  }
  const seen = new Set();
  const groups = new Map();
  for (const run of input.runs) {
    if (!run || !['offline-fixture', 'live'].includes(run.evidence)
      || !['success', 'failure', 'blocked'].includes(run.outcome)
      || ![run.runId, run.caseId, run.variantId, run.contextId, run.sourceRevision].every(id)
      || !['firstUsefulActionMs', 'firstAudioMs'].every((key) => run[key] === null || number(run[key]))
      || !['corrections', 'handoffFailures', 'attempts'].every((key) => number(run[key]) && Number.isSafeInteger(run[key]))
      || !Array.isArray(run.costs) || !Array.isArray(run.unobservedPaths)
      || !run.unobservedPaths.every(id)
      || typeof run.evidenceRef !== 'string' || !run.evidenceRef.trim()) {
      throw new Error('Invalid evaluation run; metrics must be explicit numbers or permitted nulls.');
    }
    if (seen.has(run.runId)) throw new Error(`Duplicate run: ${run.runId}`);
    seen.add(run.runId);
    for (const cost of run.costs) {
      if (!cost || !id(cost.path)
        || !['provider-reported', 'runtime-estimate', 'verified-no-charge', 'unknown'].includes(cost.basis)
        || (cost.basis === 'unknown' ? cost.amountUsd !== null : !number(cost.amountUsd))
        || (cost.basis === 'verified-no-charge' && cost.amountUsd !== 0)
        || typeof cost.reference !== 'string' || !cost.reference.trim()) {
        throw new Error('Invalid cost evidence; unknown cost must be null and all amounts need provenance.');
      }
    }
    const key = JSON.stringify([run.evidence, run.variantId, run.sourceRevision, run.contextId]);
    const group = groups.get(key) ?? [];
    group.push(run);
    groups.set(key, group);
  }
  return {
    schema: 'morpheus.phase5.evaluation-report.v1',
    routeSelection: 'requires-human-review-of-matched-live-runs',
    groups: [...groups.values()].map((runs) => {
      const costs = runs.flatMap((run) => run.costs);
      const successes = runs.filter((run) => run.outcome === 'success').length;
      const complete = runs.every((run) => run.costs.length > 0 && run.unobservedPaths.length === 0)
        && costs.every((cost) => cost.basis !== 'unknown');
      const sum = costs.reduce((total, cost) => total + (cost.amountUsd ?? 0), 0);
      if (!Number.isFinite(sum)) throw new Error('Cost aggregate overflow.');
      const metric = (key) => {
        const values = runs.map((run) => run[key]).filter((value) => value !== null);
        return { meanMs: mean(values), observed: values.length, missing: runs.length - values.length };
      };
      return {
        evidence: runs[0].evidence, variantId: runs[0].variantId,
        sourceRevision: runs[0].sourceRevision, contextId: runs[0].contextId,
        caseCounts: Object.fromEntries([...new Set(runs.map((run) => run.caseId))]
          .sort().map((caseId) => [caseId, runs.filter((run) => run.caseId === caseId).length])),
        runs: runs.length, successes, successRate: successes / runs.length,
        failures: runs.filter((run) => run.outcome === 'failure').length,
        blocked: runs.filter((run) => run.outcome === 'blocked').length,
        firstUsefulAction: metric('firstUsefulActionMs'), firstAudio: metric('firstAudioMs'),
        corrections: runs.reduce((sum, run) => sum + run.corrections, 0),
        handoffFailures: runs.reduce((sum, run) => sum + run.handoffFailures, 0),
        attempts: runs.reduce((sum, run) => sum + run.attempts, 0),
        costCoverageComplete: complete,
        costBases: [...new Set(costs.map((cost) => cost.basis))].sort(),
        knownCostSubtotalUsd: sum,
        // Includes failed/blocked run spend, avoiding a success-only cost bias.
        costPerSuccessfulTaskUsd: complete && successes > 0 ? sum / successes : null,
        unobservedPaths: [...new Set(runs.flatMap((run) => run.unobservedPaths))].sort(),
      };
    }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/phase5/evaluate.mjs <evidence.json>');
    console.log(JSON.stringify(evaluate(JSON.parse(readFileSync(process.argv[2], 'utf8'))), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
