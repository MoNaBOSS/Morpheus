import { describe, expect, it, vi } from 'vitest';

import { createMorpheusPlannerSelector } from '@electron/services/morpheus/planning/planner-selector';
import type { ProviderAccount } from '@electron/shared/providers/types';
import { MORPHEUS_STARTER_AGENT_PROFILES } from '@shared/morpheus/agents/registry';

const LOCAL: ProviderAccount = {
  id: 'ollama', vendorId: 'ollama', label: 'Ollama', authMode: 'local',
  baseUrl: 'http://127.0.0.1:11434/v1', apiProtocol: 'ollama', model: 'qwen3:latest',
  enabled: true, isDefault: true,
  createdAt: '2026-08-11T00:00:00.000Z', updatedAt: '2026-08-11T00:00:00.000Z',
};

describe('planner selection', () => {
  it('routes the saved default OpenRouter account with its canonical runtime model normalized', async () => {
    const getAccountRuntimeApiKey = vi.fn(async () => 'synthetic-main-owned-key');
    const selector = createMorpheusPlannerSelector({ providerService: {
      listAccounts: vi.fn(async () => [{
        ...LOCAL, id: 'openrouter-work', vendorId: 'openrouter', authMode: 'api_key',
        baseUrl: 'https://openrouter.ai/api/v1', apiProtocol: 'openai-completions',
        model: 'openrouter/openai/gpt-test',
      }]),
      getDefaultAccountId: vi.fn(async () => 'openrouter-work'),
      getAccountRuntimeApiKey,
    } as never });
    expect(await selector.select(MORPHEUS_STARTER_AGENT_PROFILES[0])).toMatchObject({
      ok: true, providerAccountId: 'openrouter-work', modelId: 'openai/gpt-test',
    });
    expect(getAccountRuntimeApiKey).toHaveBeenCalledExactlyOnceWith('openrouter-work');
  });

  it('reports the resolved model rather than an account-prefixed alias', async () => {
    const selector = createMorpheusPlannerSelector({ providerService: {
      listAccounts: vi.fn(async () => [{ ...LOCAL, model: 'ollama/qwen3:latest' }]),
      getDefaultAccountId: vi.fn(async () => 'ollama'),
    } as never });
    expect(await selector.select(MORPHEUS_STARTER_AGENT_PROFILES[0])).toMatchObject({ ok: true, modelId: 'qwen3:latest' });
  });
  it('prefers a configured real local provider for auto Agent Profiles', async () => {
    const selector = createMorpheusPlannerSelector({
      providerService: {
        listAccounts: vi.fn(async () => [LOCAL]),
        getDefaultAccountId: vi.fn(async () => 'ollama'),
      } as never,
    });
    const selected = await selector.select(MORPHEUS_STARTER_AGENT_PROFILES[0]);
    expect(selected.ok).toBe(true);
    if (selected.ok) {
      expect(selected.planner.plannedBy).toBe('provider');
      expect(selected.providerAccountId).toBe('ollama');
    }
  });

  it('labels the deterministic fallback honestly when no provider exists', async () => {
    const selector = createMorpheusPlannerSelector({
      providerService: {
        listAccounts: vi.fn(async () => []),
        getDefaultAccountId: vi.fn(async () => undefined),
      } as never,
    });
    const selected = await selector.select(MORPHEUS_STARTER_AGENT_PROFILES[0]);
    expect(selected.ok).toBe(true);
    if (selected.ok) {
      expect(selected.planner.plannedBy).toBe('deterministic');
      expect(selected.fallbackReason).toMatch(/No configured planning provider/);
    }
  });

  it('does not pretend an OpenClaw planner binding is implemented', async () => {
    const selector = createMorpheusPlannerSelector({ providerService: {} as never });
    const selected = await selector.select({
      ...MORPHEUS_STARTER_AGENT_PROFILES[0],
      planner: { kind: 'openclaw', agentId: 'main' },
    });
    expect(selected).toMatchObject({ ok: false, reason: expect.stringContaining('not configured') });
  });
});
