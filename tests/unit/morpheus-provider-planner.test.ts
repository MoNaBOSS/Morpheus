import { describe, expect, it, vi } from 'vitest';

import { createMorpheusProviderPlanner } from '@electron/services/morpheus/planning/provider-planner';
import type { ProviderAccount } from '@electron/shared/providers/types';
import type { MorpheusPlanningRequest } from '@shared/morpheus/planner';

const ACCOUNT: ProviderAccount = {
  id: 'openai',
  vendorId: 'openai',
  label: 'OpenAI',
  authMode: 'api_key',
  baseUrl: 'https://api.example.test/v1',
  apiProtocol: 'openai-completions',
  model: 'gpt-test',
  enabled: true,
  isDefault: true,
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
};

const REQUEST: MorpheusPlanningRequest = {
  objective: 'Show system information',
  origin: { type: 'command-bar', commandText: 'Show system information' },
  platform: 'win32',
  filesRoot: 'C:\\Users\\secret-name\\Morpheus Files',
  capabilities: [{
    capabilityId: 'system.report',
    riskTier: 'low',
    description: 'Privacy-safe system report',
    params: [],
  }],
  context: [],
};

describe('real provider planner adapter', () => {
  it.each([
    ['openai-completions', 'max_completion_tokens'],
    ['openai-responses', 'max_output_tokens'],
    ['anthropic-messages', 'max_tokens'],
    ['google-generative-ai', 'maxOutputTokens'],
    ['ollama', 'max_tokens'],
  ] as const)('bounds %s generation without an uncapped compatibility retry', async (protocol, key) => {
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect((body.generationConfig ?? body)[key]).toBe(4_096);
      return new Response('unsupported parameter', { status: 400 });
    });
    const planner = createMorpheusProviderPlanner({ account: { ...ACCOUNT, apiProtocol: protocol }, apiKey: 'key', fetchImpl });
    await expect(planner.plan(REQUEST)).rejects.toMatchObject({ retryable: false });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('reserves allowance even for failed website requests and stops before more paid work', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 503 }));
    const planner = createMorpheusProviderPlanner({ account: ACCOUNT, apiKey: 'key', fetchImpl });
    for (let i = 0; i < 4; i++) await expect(planner.plan({ ...REQUEST, objective: 'Build a website' })).rejects.toThrow(/503/);
    await expect(planner.plan({ ...REQUEST, objective: 'Build a website' })).rejects.toThrow(/allowance reached/);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('rejects oversized input and already cancelled requests without calling the provider', async () => {
    const fetchImpl = vi.fn();
    const planner = createMorpheusProviderPlanner({ account: ACCOUNT, apiKey: 'key', fetchImpl });
    await expect(planner.plan({ ...REQUEST, objective: 'a'.repeat(50_000) })).rejects.toThrow(/context allowance/);
    await expect(planner.plan({ ...REQUEST, signal: AbortSignal.abort() })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never automatically retries ambiguous transport failures', async () => {
    const planner = createMorpheusProviderPlanner({ account: ACCOUNT, apiKey: 'key', fetchImpl: vi.fn().mockRejectedValue(new TypeError('failed')) });
    await expect(planner.plan(REQUEST)).rejects.toMatchObject({ retryable: false });
  });

  it('records only validated numeric usage, not raw provider payloads', async () => {
    const recordUsage = vi.fn(async () => undefined);
    const planner = createMorpheusProviderPlanner({ account: ACCOUNT, apiKey: 'key', recordUsage,
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        usage: { prompt_tokens: 120, completion_tokens: 50, total_tokens: 170, secret: 'never-record' },
        choices: [{ message: { content: JSON.stringify({ steps: [{ stepId: 'report', capabilityId: 'system.report', params: {}, dependsOn: [], summary: 'Report' }] }) } }],
      }))),
    });
    await planner.plan(REQUEST);
    expect(recordUsage).toHaveBeenCalledTimes(2);
    expect(recordUsage).toHaveBeenLastCalledWith({ requestId: expect.any(String), phase: 'completed', requestNumber: 1, inputChars: expect.any(Number), outputTokenLimit: 4096, inputTokens: 120, outputTokens: 50, totalTokens: 170 });
    expect(JSON.stringify(recordUsage.mock.calls)).not.toContain('never-record');
  });

  it('cancels an oversized streamed response instead of buffering it without a limit', async () => {
    const cancel = vi.fn();
    const planner = createMorpheusProviderPlanner({ account: ACCOUNT, apiKey: 'key', fetchImpl: vi.fn(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(65 * 1024)); }, cancel,
    }))) });
    await expect(planner.plan(REQUEST)).rejects.toThrow(/permitted size/);
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('uses Main-held credentials without putting secrets or canonical paths in the prompt', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      expect(JSON.stringify(body)).not.toContain('sk-secret');
      expect(JSON.stringify(body)).not.toContain('secret-name');
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          steps: [{
            stepId: 'report', capabilityId: 'system.report', params: {}, dependsOn: [], summary: 'Report',
          }],
        }) } }],
      }), { status: 200 });
    });
    const planner = createMorpheusProviderPlanner({
      account: ACCOUNT,
      apiKey: 'sk-secret',
      fetchImpl: fetchImpl as typeof fetch,
      createId: () => 'provider-plan-1',
      now: () => new Date('2026-08-11T00:00:00.000Z'),
    });

    const result = await planner.plan(REQUEST);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan).toMatchObject({ planId: 'provider-plan-1', plannedBy: 'provider' });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe('https://api.example.test/v1/chat/completions');
    expect((init?.headers as Record<string, string>).authorization).toBe('Bearer sk-secret');
    expect(init?.redirect).toBe('error');
  });

  it('sends Agent Profile instructions once instead of duplicating them in context', async () => {
    const marker = 'UNIQUE_AGENT_INSTRUCTION_MARKER';
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const serialized = String(init?.body);
      expect(serialized.split(marker)).toHaveLength(2);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          steps: [{
            stepId: 'report', capabilityId: 'system.report', params: {}, dependsOn: [], summary: 'Report',
          }],
        }) } }],
      }), { status: 200 });
    });
    const planner = createMorpheusProviderPlanner({
      account: ACCOUNT,
      apiKey: 'key',
      fetchImpl: fetchImpl as typeof fetch,
      createId: () => 'provider-plan-deduplicated',
    });

    await planner.plan({
      ...REQUEST,
      agent: {
        profileId: 'general',
        name: 'General',
        instructions: marker,
        capabilityIds: ['system.report'],
      },
      context: [{
        contextId: 'workspace:main',
        source: 'workspace',
        text: 'Approved workspace.',
        createdAt: '2026-08-11T00:00:00.000Z',
        sensitivity: 'normal',
      }],
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('rejects provider plans that reference a non-approved application', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        steps: [{
          stepId: 'launch', capabilityId: 'app.launch', params: { applicationKey: 'powershell' },
          dependsOn: [], summary: 'Launch',
        }],
      }) } }],
    }), { status: 200 }));
    const planner = createMorpheusProviderPlanner({ account: ACCOUNT, apiKey: 'key', fetchImpl: fetchImpl as typeof fetch });
    await expect(planner.plan({
      ...REQUEST,
      capabilities: [{
        capabilityId: 'app.launch', riskTier: 'medium', description: 'Approved app',
        params: [{ key: 'applicationKey', kind: 'applicationKey', required: true }],
      }],
    })).rejects.toMatchObject({ code: 'invalid-params' });
  });

  it.each([
    [503, true],
    [429, true],
    [401, false],
    [400, false],
  ])('classifies HTTP %s retryability without reading or exposing response content', async (status, retryable) => {
    const planner = createMorpheusProviderPlanner({
      account: ACCOUNT,
      apiKey: 'key',
      fetchImpl: vi.fn(async () => new Response('secret upstream body', { status })) as typeof fetch,
    });
    await expect(planner.plan(REQUEST)).rejects.toMatchObject({
      name: 'MorpheusProviderRequestError',
      status,
      retryable,
      message: `Planning provider returned HTTP ${status}.`,
    });
  });
});
