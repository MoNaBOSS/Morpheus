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
