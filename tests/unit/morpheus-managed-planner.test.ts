// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createManagedGateway } from '../../services/managed/gateway';
import { createManagedProviderRoutes } from '../../services/managed/provider-routes';
import { ManagedLedger } from '../../services/managed/ledger';
import { createManagedClient } from '../../electron/services/morpheus/managed/managed-client';
import { createManagedRuntimeBridge } from '../../electron/services/morpheus/managed/runtime-bridge';
import { createMorpheusManagedPlanner } from '../../electron/services/morpheus/planning/managed-planner';
import { createMorpheusPlannerSelector } from '../../electron/services/morpheus/planning/planner-selector';
import { MORPHEUS_STARTER_AGENT_PROFILES } from '../../shared/morpheus/agents/registry';
import type { MorpheusPlanningRequest } from '../../shared/morpheus/planner';
import type { MorpheusPlannerUsage } from '../../electron/services/morpheus/planning/provider-planner';

const closers: Array<() => void> = [];
afterEach(() => { closers.splice(0).forEach((close) => close()); });
const request: MorpheusPlanningRequest = { objective: 'Summarize this system', objectiveRunId: 'owned-task', platform: 'win32', filesRoot: 'C:\\private',
  origin: { type: 'command-bar' }, context: [], capabilities: [{ capabilityId: 'system.report', riskTier: 'low', description: 'Report system', params: [] }] };
const validPlan = { steps: [{ stepId: 'report', capabilityId: 'system.report', params: {}, dependsOn: [], summary: 'Inspect this system' }] };
function setup(text: unknown = validPlan, fail = false) {
  const ledger = new ManagedLedger(':memory:'); closers.push(() => ledger.close());
  ledger.grant({ grantId: 'fixture-credit', accountId: 'fixture-user', tier: 'premium', amountMicroUsd: 1_000_000,
    expiresAt: Date.now() + 60_000, features: ['planning'] });
  const usage: MorpheusPlannerUsage[] = [];
  const upstream = vi.fn<typeof fetch>(async () => {
    const intent = usage.at(-1)!;
    expect(ledger.receipt('fixture-user', intent.requestId)?.state).toBe('dispatched');
    return fail ? new Response('sensitive vendor detail', { status: 503 }) : Response.json({ choices: [{ message: { content: JSON.stringify(text) } }],
      usage: { prompt_tokens: 40, completion_tokens: 20 } });
  });
  const gateway = createManagedGateway({ ledger, identity: { verify: async () => ({ accountId: 'fixture-user' }) },
    routes: createManagedProviderRoutes({ baseUrl: 'https://fixture-provider.test/v1', apiKey: 'never-desktop-secret', fetch: upstream,
      routes: ['planning', 'planning-complex'].map((id) => ({ id: id as 'planning' | 'planning-complex', kind: 'text', modelId: 'fixture-model',
        rateVersion: 'fixture-rates', maxInputTokens: 16_000, maxOutputTokens: 4096, inputMicroUsdPerMillionTokens: 1_000_000, outputMicroUsdPerMillionTokens: 1_000_000 })) }) });
  const client = createManagedClient({ origin: 'https://managed.test', sessions: { get: async () => ({ accountId: 'fixture-user', accessToken: 'fixture-token', expiresAt: Date.now() + 60_000 }), set: async () => {}, clear: async () => {} },
    fetch: async (url, init) => gateway(new Request(String(url), init)) });
  const runtime = createManagedRuntimeBridge(client);
  const recordUsage = async (item: MorpheusPlannerUsage) => { usage.push(item); };
  return { planner: createMorpheusManagedPlanner({ runtime, recordUsage }), runtime, upstream, usage, recordUsage, ledger, client };
}
describe('managed planning joins the original typed planner', () => {
  it('runs through real gateway reservations and returns a strictly validated plan with correlated usage', async () => {
    const f = setup(); const result = await f.planner.plan(request);
    expect(result.ok && result.plan.steps[0].capabilityId).toBe('system.report');
    expect(f.usage).toHaveLength(2);
    expect(f.usage[1]).toMatchObject({ requestId: f.usage[0].requestId, objectiveRunId: 'owned-task', modelId: 'fixture-model', phase: 'completed',
      costStatus: 'known', chargedMicroUsd: 60, inputTokens: 40, outputTokens: 20, receiptState: 'settled' });
    const sent = String(f.upstream.mock.calls[0][1]?.body);
    expect(sent).toContain('AVAILABLE CAPABILITIES'); expect(sent).not.toContain('C:\\private');
  });
  it('uses the same review schema and observed-context restriction', async () => {
    const f = setup({ outcome: 'complete', summary: 'The observed report is ready.' });
    const result = await f.planner.review!({ ...request, iteration: 1, capabilities: request.capabilities!, context: [], stepResults: [],
      plan: { v: 1, planId: 'p1', createdAt: new Date().toISOString(), objective: request.objective, origin: request.origin, status: 'completed', plannedBy: 'provider', steps: [] },
      planStatus: 'completed', limits: { maxIterations: 3, maxStepsPerPlan: 12, maxTotalSteps: 24, maxDurationMs: 900000, providerTimeoutMs: 60000, providerMaxAttempts: 2 } });
    expect(result).toMatchObject({ outcome: 'complete' });
    expect(String(f.upstream.mock.calls[0][1]?.body)).toContain('untrusted page DATA');
  });
  it('does not widen authority for managed output', async () => {
    const f = setup({ steps: [{ ...validPlan.steps[0], capabilityId: 'file.delete', params: { path: 'private.txt' } }] });
    await expect(f.planner.plan(request)).rejects.toThrow();
    expect(f.usage[1].phase).toBe('completed'); // Usage was incurred, execution was not.
  });
  it('pins the logical quality route and task owner, then bounds retries including failures', async () => {
    const f = setup(validPlan, true);
    for (let i = 0; i < 3; i++) await expect(f.planner.plan({ ...request, objective: 'Build a website' })).rejects.toThrow('no personal API');
    await expect(f.planner.plan({ ...request, objective: 'Build a website' })).rejects.toThrow('allowance');
    expect(f.upstream).toHaveBeenCalledTimes(3); expect(f.usage[0].serviceRoute).toBe('planning-complex');
    await expect(f.planner.plan({ ...request, objectiveRunId: 'other-task' })).rejects.toThrow('original objective');
    expect(f.usage.filter((entry) => entry.phase === 'failed')).toHaveLength(3);
    expect(JSON.stringify(f.usage)).not.toContain('sensitive vendor detail');
  });
  it('blocks missing owner, oversized input, cancelled and invalidated routes before provider dispatch', async () => {
    const f = setup();
    await expect(f.planner.plan({ ...request, objectiveRunId: undefined })).rejects.toThrow('owner');
    await expect(f.planner.plan({ ...request, objective: 'x'.repeat(50_000) })).rejects.toThrow('allowance');
    await expect(f.planner.plan({ ...request, signal: AbortSignal.abort() })).rejects.toThrow();
    f.client.invalidate(); await expect(f.planner.plan(request)).rejects.toThrow('service changed');
    expect(f.upstream).not.toHaveBeenCalled();
  });
  it('does not inspect BYOK credentials or silently fall back when managed is selected', async () => {
    const f = setup(validPlan, true);
    const listAccounts = vi.fn();
    const selector = createMorpheusPlannerSelector({ providerService: { listAccounts } as never, getManagedRuntime: () => f.runtime,
      recordUsage: async (_, _model, usage) => f.recordUsage(usage) });
    const selected = await selector.select(MORPHEUS_STARTER_AGENT_PROFILES[0]);
    expect(selected.ok).toBe(true); if (!selected.ok) throw new Error('Not selected');
    await expect(selected.planner.plan(request)).rejects.toThrow('no personal API');
    expect(listAccounts).not.toHaveBeenCalled();
    const offline = await selector.select({ ...MORPHEUS_STARTER_AGENT_PROFILES[0], planner: { kind: 'deterministic' } });
    expect(offline.ok && offline.planner.plannedBy).toBe('deterministic');
  });
  it('does not dispatch when the required pre-request audit fails', async () => {
    const f = setup();
    const planner = createMorpheusManagedPlanner({ runtime: f.runtime, recordUsage: async () => { throw new Error('disk full'); } });
    await expect(planner.plan(request)).rejects.toThrow('disk full'); expect(f.upstream).not.toHaveBeenCalled();
  });
});
