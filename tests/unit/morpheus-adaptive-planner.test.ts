import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMorpheusPlannerSelector } from '@electron/services/morpheus/planning/planner-selector';
import type { MorpheusPlannerUsage } from '@electron/services/morpheus/planning/provider-planner';
import type { ProviderAccount } from '@electron/shared/providers/types';
import { MORPHEUS_STARTER_AGENT_PROFILES } from '@shared/morpheus/agents/registry';
import type { MorpheusPlannerRoutingPolicy } from '@shared/morpheus/planner-routing';
import type { MorpheusPlanningRequest } from '@shared/morpheus/planner';

const ACCOUNT: ProviderAccount = {
  id: 'work', vendorId: 'openrouter', label: 'Work', authMode: 'api_key',
  baseUrl: 'https://provider.example/v1', apiProtocol: 'openai-completions', model: 'vendor/saved',
  headers: { 'x-route': 'original' }, enabled: true, isDefault: true, createdAt: '', updatedAt: '',
};
const POLICY: MorpheusPlannerRoutingPolicy = {
  mode: 'adaptive', routes: { work: { efficientModelId: 'vendor/efficient', strongModelId: 'vendor/strong' } },
};
const REQUEST: MorpheusPlanningRequest = {
  objective: 'Inspect the current folder', objectiveRunId: 'objective-owned', iteration: 1,
  origin: { type: 'command-bar', commandText: 'Inspect the current folder' }, platform: 'win32', filesRoot: 'E:\\synthetic',
  capabilities: [{ capabilityId: 'system.report', riskTier: 'low', description: 'System report', params: [] }], context: [],
};
const validPlan = JSON.stringify({ steps: [{ stepId: 'report', capabilityId: 'system.report', params: {}, dependsOn: [], summary: 'Report' }] });
const response = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }));

function selector(options: {
  accounts?: ProviderAccount[];
  defaultId?: string;
  policy?: MorpheusPlannerRoutingPolicy;
  recordUsage?: (accountId: string, modelId: string | undefined, usage: MorpheusPlannerUsage) => Promise<void>;
} = {}) {
  const getAccountRuntimeApiKey = vi.fn(async () => 'synthetic-main-key');
  const selected = createMorpheusPlannerSelector({
    providerService: {
      listAccounts: vi.fn(async () => options.accounts ?? [ACCOUNT]),
      getDefaultAccountId: vi.fn(async () => options.defaultId ?? 'work'),
      getAccountRuntimeApiKey,
    } as never,
    getRoutingPolicy: () => options.policy ?? POLICY,
    recordUsage: options.recordUsage,
  });
  return { selected, getAccountRuntimeApiKey };
}

afterEach(() => vi.unstubAllGlobals());

describe('adaptive same-account provider planning', () => {
  it.each([
    ['Inspect the current folder', 'vendor/efficient'], ['Research the best available approaches', 'vendor/strong'],
  ])('selects the approved model locally for %s', async (objective, modelId) => {
    const fetchImpl = vi.fn(); vi.stubGlobal('fetch', fetchImpl);
    const { selected, getAccountRuntimeApiKey } = selector();
    const result = await selected.select(MORPHEUS_STARTER_AGENT_PROFILES[0], { objective });
    expect(result).toMatchObject({ ok: true, providerAccountId: 'work', modelId });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(getAccountRuntimeApiKey).toHaveBeenCalledExactlyOnceWith('work');
    expect(ACCOUNT.model).toBe('vendor/saved');
  });

  it('uses the saved model for an unset route without inventing efficiency or quality', async () => {
    const { selected } = selector({ policy: { mode: 'adaptive', routes: {} } });
    expect(await selected.select(MORPHEUS_STARTER_AGENT_PROFILES[0], { objective: 'Build a website' })).toMatchObject({
      ok: true, modelId: 'vendor/saved', routingReason: expect.stringContaining('route is unset'),
    });
  });

  it('honors fixed mode and explicit provider/profile model bindings', async () => {
    const fixed = selector({ policy: { ...POLICY, mode: 'fixed' } });
    expect(await fixed.selected.select(MORPHEUS_STARTER_AGENT_PROFILES[0], { objective: 'Build a website' })).toMatchObject({ ok: true, modelId: 'vendor/saved' });
    const adaptive = selector();
    expect(await adaptive.selected.select({ ...MORPHEUS_STARTER_AGENT_PROFILES[0], planner: { kind: 'provider', providerId: 'work', modelId: 'vendor/explicit' } }, { objective: 'Build a website' }))
      .toMatchObject({ ok: true, modelId: 'vendor/explicit' });
  });

  it('does not borrow another account route after the default account changes', async () => {
    const { selected } = selector({ accounts: [{ ...ACCOUNT, id: 'other' }], defaultId: 'other' });
    expect(await selected.select(MORPHEUS_STARTER_AGENT_PROFILES[0], { objective: 'Build a website' }))
      .toMatchObject({ ok: true, providerAccountId: 'other', modelId: 'vendor/saved' });
  });

  it('fails to deterministic on an unavailable adaptive default but retains fixed compatibility fallback', async () => {
    const accounts = [{ ...ACCOUNT, id: 'other' }];
    const adaptive = selector({ accounts });
    expect(await adaptive.selected.select(MORPHEUS_STARTER_AGENT_PROFILES[0], { objective: 'Build a website' })).toMatchObject({
      ok: true, planner: { plannedBy: 'deterministic' }, fallbackReason: expect.stringContaining('default planning account is unavailable'),
    });
    expect(adaptive.getAccountRuntimeApiKey).not.toHaveBeenCalled();
    const fixed = selector({ accounts, policy: { ...POLICY, mode: 'fixed' } });
    expect(await fixed.selected.select(MORPHEUS_STARTER_AGENT_PROFILES[0])).toMatchObject({ ok: true, providerAccountId: 'other' });
  });

  it('repairs one initial malformed typed plan, pins authority and attributes each actual model', async () => {
    const account = { ...ACCOUNT, headers: { ...ACCOUNT.headers } };
    const policy = structuredClone(POLICY);
    const recordUsage = vi.fn(async () => undefined);
    const { selected, getAccountRuntimeApiKey } = selector({ accounts: [account], policy, recordUsage });
    const selection = await selected.select(MORPHEUS_STARTER_AGENT_PROFILES[0], { objective: REQUEST.objective });
    expect(selection.ok).toBe(true); if (!selection.ok) return;
    account.baseUrl = 'https://redirect.example/v1'; account.headers!['x-route'] = 'changed';
    account.model = 'vendor/other'; policy.routes.work.strongModelId = 'vendor/unapproved-later';
    const fetchImpl = vi.fn().mockResolvedValueOnce(response('not json')).mockResolvedValueOnce(response(validPlan));
    vi.stubGlobal('fetch', fetchImpl);
    expect(await selection.planner.plan(REQUEST)).toMatchObject({ ok: true });
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(['https://provider.example/v1/chat/completions', 'https://provider.example/v1/chat/completions']);
    expect(fetchImpl.mock.calls.map(([, init]) => JSON.parse(init.body).model)).toEqual(['vendor/efficient', 'vendor/strong']);
    for (const [, init] of fetchImpl.mock.calls) expect(init.headers).toMatchObject({ authorization: 'Bearer synthetic-main-key', 'x-route': 'original' });
    expect(recordUsage.mock.calls.filter(([, , usage]) => usage.phase === 'started').map(([, model, usage]) => [model, usage.requestNumber, usage.modelId]))
      .toEqual([['vendor/efficient', 1, 'vendor/efficient'], ['vendor/strong', 2, 'vendor/strong']]);
    expect(selection.getCurrentRoute?.()).toMatchObject({ modelId: 'vendor/strong', reason: expect.stringContaining('before execution') });
    expect(getAccountRuntimeApiKey).toHaveBeenCalledOnce();
  });

  it('never restarts the request allowance after a stronger repair', async () => {
    const { selected } = selector();
    const selection = await selected.select(MORPHEUS_STARTER_AGENT_PROFILES[0], { objective: REQUEST.objective });
    if (!selection.ok) throw new Error('Selection failed');
    const fetchImpl = vi.fn().mockResolvedValueOnce(response('not json')).mockImplementation(async () => response(validPlan));
    vi.stubGlobal('fetch', fetchImpl);
    await selection.planner.plan(REQUEST);
    await selection.planner.plan({ ...REQUEST, iteration: 2 });
    await selection.planner.plan({ ...REQUEST, iteration: 3 });
    await expect(selection.planner.plan({ ...REQUEST, iteration: 3 })).rejects.toThrow(/allowance reached/);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('shares the 12,288 reserved output-token cap across a repaired website request', async () => {
    // Select efficient for the original bounded objective; the later website
    // objective still cannot create a fresh allowance on the stronger adapter.
    const { selected } = selector();
    const selection = await selected.select(MORPHEUS_STARTER_AGENT_PROFILES[0], { objective: REQUEST.objective });
    if (!selection.ok) throw new Error('Selection failed');
    const fetchImpl = vi.fn().mockResolvedValueOnce(response('not json')).mockImplementation(async () => response(validPlan));
    vi.stubGlobal('fetch', fetchImpl);
    await selection.planner.plan({ ...REQUEST, objective: 'Build a website' });
    await selection.planner.plan({ ...REQUEST, objective: 'Build a website', iteration: 2 });
    await expect(selection.planner.plan({ ...REQUEST, objective: 'Build a website', iteration: 3 })).rejects.toThrow(/allowance reached/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls.map(([, init]) => JSON.parse(init.body).max_tokens)).toEqual([4096, 4096, 4096]);
    await expect(selection.planner.plan({ ...REQUEST, objectiveRunId: 'other-objective' })).rejects.toThrow(/another objective/);
  });

  it('does not try a second repair when the configured strong model also returns invalid JSON', async () => {
    const { selected } = selector();
    const selection = await selected.select(MORPHEUS_STARTER_AGENT_PROFILES[0], { objective: REQUEST.objective });
    if (!selection.ok) throw new Error('Selection failed');
    const fetchImpl = vi.fn(async () => response('not json')); vi.stubGlobal('fetch', fetchImpl);
    await expect(selection.planner.plan(REQUEST)).rejects.toThrow(/valid JSON/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(selection.getCurrentRoute?.().modelId).toBe('vendor/strong');
  });

  it.each([401, 402, 429, 503])('does not escalate HTTP %s into another model request', async (status) => {
    const { selected } = selector();
    const selection = await selected.select(MORPHEUS_STARTER_AGENT_PROFILES[0], { objective: REQUEST.objective });
    if (!selection.ok) throw new Error('Selection failed');
    const fetchImpl = vi.fn(async () => new Response('', { status })); vi.stubGlobal('fetch', fetchImpl);
    await expect(selection.planner.plan(REQUEST)).rejects.toThrow(`HTTP ${status}`);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(selection.getCurrentRoute?.().modelId).toBe('vendor/efficient');
  });

  it.each([
    ['unknown capability', JSON.stringify({ steps: [{ stepId: 'execute', capabilityId: 'shell.execute', params: {}, dependsOn: [], summary: 'No' }] })],
    ['oversized plan', JSON.stringify({ steps: Array.from({ length: 13 }, (_, i) => ({ stepId: `s-${i}`, capabilityId: 'system.report', params: {}, dependsOn: [], summary: 'Report' })) })],
  ])('does not escalate safety/capability failure: %s', async (_label, content) => {
    const { selected } = selector();
    const selection = await selected.select(MORPHEUS_STARTER_AGENT_PROFILES[0], { objective: REQUEST.objective });
    if (!selection.ok) throw new Error('Selection failed');
    const fetchImpl = vi.fn(async () => response(content)); vi.stubGlobal('fetch', fetchImpl);
    await expect(selection.planner.plan(REQUEST)).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('does not escalate uncertain transport or failed usage persistence', async () => {
    const { selected } = selector();
    const selection = await selected.select(MORPHEUS_STARTER_AGENT_PROFILES[0], { objective: REQUEST.objective });
    if (!selection.ok) throw new Error('Selection failed');
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('network failed')); vi.stubGlobal('fetch', fetchImpl);
    await expect(selection.planner.plan(REQUEST)).rejects.toThrow(/No automatic retry/);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const failedAudit = selector({ recordUsage: vi.fn().mockRejectedValue(new Error('audit failed')) });
    const blocked = await failedAudit.selected.select(MORPHEUS_STARTER_AGENT_PROFILES[0], { objective: REQUEST.objective });
    if (!blocked.ok) throw new Error('Selection failed');
    fetchImpl.mockClear();
    await expect(blocked.planner.plan(REQUEST)).rejects.toThrow('audit failed');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never repairs review or subsequent planning after the initial plan was accepted', async () => {
    const { selected } = selector();
    const selection = await selected.select(MORPHEUS_STARTER_AGENT_PROFILES[0], { objective: REQUEST.objective });
    if (!selection.ok) throw new Error('Selection failed');
    const fetchImpl = vi.fn().mockResolvedValueOnce(response(validPlan)).mockImplementation(async () => response('not json'));
    vi.stubGlobal('fetch', fetchImpl);
    const planned = await selection.planner.plan(REQUEST);
    if (!planned.ok) throw new Error('Plan failed');
    await expect(selection.planner.review!({ objectiveRunId: REQUEST.objectiveRunId!, objective: REQUEST.objective, origin: REQUEST.origin,
      iteration: 1, plan: planned.plan, planStatus: 'completed', stepResults: [], context: [], capabilities: REQUEST.capabilities!,
      limits: { maxIterations: 3, maxStepsPerPlan: 12, maxTotalSteps: 24, maxDurationMs: 900000, providerTimeoutMs: 60000, providerMaxAttempts: 2 },
    })).rejects.toThrow(/valid JSON/);
    await expect(selection.planner.plan({ ...REQUEST, iteration: 2 })).rejects.toThrow(/valid JSON/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls.every(([, init]) => JSON.parse(init.body).model === 'vendor/efficient')).toBe(true);
  });

  it('cancellation before malformed output validation cannot trigger a repair', async () => {
    const { selected } = selector();
    const selection = await selected.select(MORPHEUS_STARTER_AGENT_PROFILES[0], { objective: REQUEST.objective });
    if (!selection.ok) throw new Error('Selection failed');
    const controller = new AbortController();
    const fetchImpl = vi.fn(async () => { controller.abort(); return response('not json'); }); vi.stubGlobal('fetch', fetchImpl);
    await expect(selection.planner.plan({ ...REQUEST, signal: controller.signal })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
