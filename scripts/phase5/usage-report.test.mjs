import assert from 'node:assert/strict';
import { test } from 'node:test';
import { usageReport } from './usage-report.mjs';

const audit = (rows) => ({ kind: 'audit', id: 'fixture-audit', text: rows.map(JSON.stringify).join('\n') });
const core = (phase, patch = {}) => ({ category: 'objective', event: 'provider-usage', details: { requestId: 'a', phase, ...patch } });

test('joins concurrent/out-of-order receipts and deduplicates input files', () => {
  const source = audit([core('completed', { totalTokens: 42 }), core('started'), core('started'),
    core('started', { requestId: 'b' }), core('failed', { requestId: 'b' })]);
  const report = usageReport([source, source]);
  assert.equal(report.paths.core.observedRequests, 2);
  assert.equal(report.paths.core.completed, 1);
  assert.equal(report.paths.core.failed, 1);
  assert.equal(report.paths.core.reportedTokenSubtotal, 42);
  assert.equal(report.paths.core.unknownCostRequests, 2);
  assert.equal(report.totalBilledCostUsd, null);
});
test('torn, legacy, pending and contradictory receipts never imply complete accounting', () => {
  const source = audit([core('started'), core('failed'), core('completed'),
    { category: 'voice', event: 'speech-completed', details: {} }, core('started', { requestId: 'b' })]);
  source.text += '\n{torn';
  const report = usageReport([source]);
  assert.equal(report.conflictingReceipts, 1);
  assert.equal(report.paths.core.pendingOrUnknown, 2);
  assert.equal(report.legacyUncorrelatedEvents, 1);
  assert.equal(report.malformedLines, 1);
  assert.equal(report.completeSpendingCap, false);
});
test('voice paths are counted separately and provider output cannot leak into report', () => {
  const source = audit(['transcription', 'speech'].flatMap((event) => ['started', 'completed'].map((phase) => ({
    category: 'voice', event: `${event}-${phase}`, details: { requestId: event, text: 'private-secret', totalTokens: 4 },
  }))));
  const report = usageReport([source]);
  assert.equal(report.paths.stt.completed, 1);
  assert.equal(report.paths.tts.completed, 1);
  assert.ok(!JSON.stringify(report).includes('private-secret'));
});
test('OpenClaw missing/zero/negative costs stay unknown and content is excluded', () => {
  const rows = [undefined, { cost: { total: 0 } }, { cost: { total: -1 } }, { total: 9, cost: { total: 0.25 } }]
    .map((usage, id) => ({ id, timestamp: '2026-09-27T00:00:00Z', message: { role: 'assistant', content: 'private-secret', usage } }));
  const report = usageReport([{ kind: 'transcript', id: 'fixture-transcript', text: rows.map(JSON.stringify).join('\n') }]);
  assert.equal(report.paths.openclaw.observedRequests, 4);
  assert.equal(report.paths.openclaw.unknownCostRequests, 3);
  assert.equal(report.paths.openclaw.missingTokenRecords, 3);
  assert.equal(report.knownRuntimeEstimateUsd, 0.25);
  assert.ok(!JSON.stringify(report).includes('private-secret'));
});
test('identical transcript records without ids can be separate paid calls', () => {
  const row = JSON.stringify({ timestamp: '2026-09-27T00:00:00Z', message: { role: 'assistant', usage: { total: 5 } } });
  assert.equal(usageReport([{ kind: 'transcript', id: 'fixture', text: `${row}\n${row}` }]).paths.openclaw.observedRequests, 2);
});
test('an empty report cannot certify no spend', () => {
  assert.equal(usageReport([]).completeSpendingCap, false);
  assert.equal(usageReport([]).totalBilledCostUsd, null);
});
