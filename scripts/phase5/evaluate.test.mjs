import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluate } from './evaluate.mjs';

const fixture = (patch = {}) => ({
  runId: 'fixture-1', caseId: 'routine', variantId: 'current', contextId: 'fixture-context',
  sourceRevision: 'fixture', evidence: 'offline-fixture', outcome: 'success',
  firstUsefulActionMs: 20, firstAudioMs: null, corrections: 0, handoffFailures: 0, attempts: 1,
  costs: [{ path: 'core', amountUsd: null, basis: 'unknown', reference: 'fixture-only' }],
  unobservedPaths: ['openclaw'], evidenceRef: 'in-memory test fixture', ...patch,
});
const report = (...runs) => evaluate({ schema: 'morpheus.phase5.evaluation.v1', runs });

test('missing costs and audio stay unknown; fixture evidence remains labelled', () => {
  const group = report(fixture()).groups[0];
  assert.equal(group.evidence, 'offline-fixture');
  assert.equal(group.costPerSuccessfulTaskUsd, null);
  assert.equal(group.costCoverageComplete, false);
  assert.deepEqual(group.firstAudio, { meanMs: null, observed: 0, missing: 1 });
});
test('cost per success includes failed attempts and distinguishes estimates', () => {
  const costs = [{ path: 'core', amountUsd: 2, basis: 'runtime-estimate', reference: 'synthetic test units' }];
  const group = report(fixture({ costs, unobservedPaths: [] }), fixture({
    runId: 'fixture-2', outcome: 'failure', costs, unobservedPaths: [], handoffFailures: 1,
  })).groups[0];
  assert.equal(group.costPerSuccessfulTaskUsd, 4);
  assert.equal(group.successRate, 0.5);
  assert.equal(group.handoffFailures, 1);
  assert.deepEqual(group.costBases, ['runtime-estimate']);
});
test('different evidence, revisions and contexts cannot be pooled', () => {
  assert.equal(report(fixture(), fixture({ runId: 'b', evidence: 'live' }),
    fixture({ runId: 'c', sourceRevision: 'other' }), fixture({ runId: 'd', contextId: 'other' })).groups.length, 4);
});
test('rejects duplicates, negative counts, invented unknown zero and unproven cost', () => {
  assert.throws(() => report(fixture(), fixture()), /Duplicate/);
  assert.throws(() => report(fixture({ corrections: -1 })), /Invalid/);
  assert.throws(() => report(fixture({ costs: [{ path: 'core', amountUsd: 0, basis: 'unknown', reference: 'x' }] })), /Invalid/);
  assert.throws(() => report(fixture({ costs: [{ path: 'core', amountUsd: 0, basis: 'provider-reported', reference: '' }] })), /Invalid/);
});
test('empty costs and empty runs do not imply zero spend or successful evaluation', () => {
  assert.equal(report(fixture({ costs: [], unobservedPaths: [] })).groups[0].costPerSuccessfulTaskUsd, null);
  assert.deepEqual(report().groups, []);
});
