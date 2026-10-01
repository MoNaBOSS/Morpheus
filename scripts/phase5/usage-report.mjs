import { readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseUsageEntriesFromJsonl } from '../../electron/utils/token-usage-core.ts';

const validCount = (n) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const validMoney = (n) => validCount(n) && n <= 1_000_000_000_000;
const logicalRoutes = { core: ['planning', 'planning-complex'], stt: ['transcription'], tts: ['speech'] };
function managedCharge(details, path) {
  if (details.costStatus !== 'known' || details.receiptState !== 'settled'
    || !logicalRoutes[path].includes(details.serviceRoute)
    || !validMoney(details.chargedMicroUsd) || !validMoney(details.reservedMicroUsd)
    || typeof details.rateVersion !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(details.rateVersion)
    || !['rate-estimate', 'provider-reported', 'reconciled'].includes(details.costEvidence)) return null;
  return details.chargedMicroUsd;
}
const correlation = (details) => JSON.stringify([details.serviceRoute ?? null, details.objectiveRunId ?? null, details.speechId ?? null]);

/** Reduces explicitly supplied local sources. Never writes profiles or contacts providers. */
export function usageReport(sources) {
  const requests = new Map();
  const paths = Object.fromEntries(['core', 'stt', 'tts', 'openclaw'].map((path) => [path, {
    observedRequests: 0, completed: 0, failed: 0, cancelled: 0, pendingOrUnknown: 0,
    unknownCostRequests: 0, reportedTokenSubtotal: 0, missingTokenRecords: 0,
    settledManagedRequests: 0, settledManagedChargeMicroUsd: 0,
  }]));
  let malformedLines = 0;
  let legacyUncorrelatedEvents = 0;
  let conflictingReceipts = 0;
  let knownRuntimeEstimateUsd = 0;
  const seenSources = new Set();
  const seenTranscriptRows = new Set();
  for (const source of sources) {
    if (!['audit', 'transcript'].includes(source.kind) || typeof source.id !== 'string' || typeof source.text !== 'string') {
      throw new Error('Invalid usage source.');
    }
    const sourceKey = JSON.stringify([source.kind, source.id]);
    if (seenSources.has(sourceKey)) continue;
    seenSources.add(sourceKey);
    for (const line of source.text.split(/\r?\n/).filter((line) => line.trim())) {
      let row;
      try { row = JSON.parse(line); } catch { malformedLines++; continue; }
      if (!row || typeof row !== 'object' || Array.isArray(row)) { malformedLines++; continue; }
      if (source.kind === 'transcript') {
        if (!['assistant', 'toolResult'].includes(row.message?.role)) continue;
        // Deduplicate repeated rows within one source. Distinct files are kept
        // separate: identical model output can represent separate paid calls.
        if (typeof row.id === 'string' || typeof row.id === 'number') {
          const key = JSON.stringify([source.id, row.id]);
          if (seenTranscriptRows.has(key)) continue;
          seenTranscriptRows.add(key);
        }
        const entry = parseUsageEntriesFromJsonl(line, { sessionId: 'local', agentId: 'local' })[0];
        const path = paths.openclaw;
        path.observedRequests++;
        // A retained assistant/tool row is evidence, not proof of task success.
        path.pendingOrUnknown++;
        const rawUsage = row.message.role === 'assistant' ? row.message.usage : row.message.details?.usage;
        const hasUnits = rawUsage && typeof rawUsage === 'object' && Object.entries(rawUsage).some(([key, value]) =>
          /token|^(input|output|total|cacheRead|cacheWrite)$/i.test(key) && validCount(value));
        if (hasUnits && entry?.usageStatus === 'available' && validCount(entry.totalTokens)) path.reportedTokenSubtotal += entry.totalTokens;
        else path.missingTokenRecords++;
        if (typeof entry?.costUsd === 'number' && Number.isFinite(entry.costUsd) && entry.costUsd > 0) {
          knownRuntimeEstimateUsd += entry.costUsd;
        } else path.unknownCostRequests++; // Runtime zero-rate defaults cannot prove free usage.
        continue;
      }
      const path = row.category === 'objective' && row.event === 'provider-usage' ? 'core'
        : row.category === 'voice' && /^transcription-(started|completed|failed|cancelled)$/.test(row.event) ? 'stt'
          : row.category === 'voice' && /^speech-(started|completed|failed|cancelled)$/.test(row.event) ? 'tts' : null;
      if (!path) continue;
      const details = row.details;
      const phase = path === 'core' ? details?.phase : row.event.split('-')[1];
      if (!details || typeof details.requestId !== 'string' || !details.requestId) { legacyUncorrelatedEvents++; continue; }
      if (!['started', 'completed', 'failed', 'cancelled'].includes(phase)) { malformedLines++; continue; }
      const key = JSON.stringify([path, details.requestId]);
      const request = requests.get(key) ?? { path, started: false, terminal: null, conflict: false, correlation: correlation(details) };
      if (request.correlation !== correlation(details)) request.conflict = true;
      if (phase === 'started') request.started = true;
      else {
        const terminal = { phase, totalTokens: validCount(details.totalTokens) ? details.totalTokens : null,
          managedChargeMicroUsd: managedCharge(details, path),
          // Retain only bounded cost metadata for conflict detection, never raw content.
          receipt: JSON.stringify([details.costStatus ?? null, details.receiptState ?? null,
            validMoney(details.chargedMicroUsd) ? details.chargedMicroUsd : null,
            validMoney(details.reservedMicroUsd) ? details.reservedMicroUsd : null,
            validMoney(details.assessedCostMicroUsd) ? details.assessedCostMicroUsd : null,
            details.costEvidence ?? null, details.rateVersion ?? null]) };
        if (request.terminal && JSON.stringify(request.terminal) !== JSON.stringify(terminal)) request.conflict = true;
        request.terminal = terminal;
      }
      requests.set(key, request);
    }
  }
  for (const request of requests.values()) {
    const path = paths[request.path];
    path.observedRequests++;
    if (request.started && !request.conflict && request.terminal?.managedChargeMicroUsd !== null
      && request.terminal?.managedChargeMicroUsd !== undefined) {
      path.settledManagedRequests++;
      path.settledManagedChargeMicroUsd += request.terminal.managedChargeMicroUsd;
      if (!Number.isSafeInteger(path.settledManagedChargeMicroUsd)) throw new Error('Managed charge aggregate overflow.');
    } else path.unknownCostRequests++; // No invented price table or inferred provider bill.
    if (request.conflict) conflictingReceipts++;
    if (!request.started || !request.terminal || request.conflict) path.pendingOrUnknown++;
    else path[request.terminal.phase]++;
    if (request.terminal?.totalTokens !== null && request.terminal?.totalTokens !== undefined && !request.conflict) {
      path.reportedTokenSubtotal += request.terminal.totalTokens;
    } else path.missingTokenRecords++;
  }
  if (!Number.isFinite(knownRuntimeEstimateUsd)) throw new Error('Cost aggregate overflow.');
  const settledManagedChargeMicroUsd = Object.values(paths).reduce((sum, path) => sum + path.settledManagedChargeMicroUsd, 0);
  if (!Number.isSafeInteger(settledManagedChargeMicroUsd)) throw new Error('Managed charge aggregate overflow.');
  return {
    schema: 'morpheus.phase5.usage-report.v1',
    sourceCount: seenSources.size, paths, malformedLines, legacyUncorrelatedEvents, conflictingReceipts,
    knownRuntimeEstimateUsd,
    settledManagedChargeMicroUsd,
    totalBilledCostUsd: null,
    completeSpendingCap: false,
    unobservedPaths: ['provider-validation', 'image-generation-and-editing', 'plugin-and-external-services', 'openclaw-outside-retained-transcripts'],
    limitations: [
      'Only supplied files are observed; audit retention, deleted transcripts and missing files create gaps.',
      'Only correlated settled managed charges count; unknown/uncertain receipts remain unknown. Managed charges are not a provider invoice.',
      'BYOK Core/STT/TTS costs remain unknown; transcript cost is a runtime estimate, not a reconciled invoice.',
      'Speech request ids do not yet establish an objective link; first audio byte is not audible playback.',
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args.length || args.length % 2) throw new Error('Usage: node scripts/phase5/usage-report.mjs --audit <file> [--transcript <file>] ...');
    const sources = [];
    for (let i = 0; i < args.length; i += 2) {
      const kind = args[i] === '--audit' ? 'audit' : args[i] === '--transcript' ? 'transcript' : null;
      if (!kind) throw new Error('Only --audit and --transcript inputs are supported.');
      const file = realpathSync(args[i + 1]);
      const stat = statSync(file);
      if (!stat.isFile() || stat.size > 64 * 1024 * 1024) throw new Error(`Input must be a file of at most 64 MiB: ${basename(file)}`);
      sources.push({ kind, id: file, text: readFileSync(file, 'utf8') });
    }
    console.log(JSON.stringify(usageReport(sources), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
