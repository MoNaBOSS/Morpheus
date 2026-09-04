import type { MorpheusAgentProfile } from '@shared/morpheus/agent-profile-types';
import { createDeterministicMorpheusPlanner } from '@shared/morpheus/interpreter/deterministic-planner';
import type { MorpheusPlanner } from '@shared/morpheus/planner';
import type { ProviderAccount } from '../../../shared/providers/types';
import type { ProviderService } from '../../providers/provider-service';

import {
  createMorpheusProviderPlanner,
  isProviderPlannerProtocolSupported,
  type MorpheusPlannerUsage,
} from './provider-planner';

export type MorpheusPlannerSelection =
  | {
      ok: true;
      planner: MorpheusPlanner;
      providerAccountId?: string;
      modelId?: string;
      fallbackReason?: string;
    }
  | { ok: false; reason: string };

export interface MorpheusPlannerSelector {
  select(agent: MorpheusAgentProfile): Promise<MorpheusPlannerSelection>;
}

async function usableApiKey(service: ProviderService, account: ProviderAccount): Promise<string | null> {
  if (account.authMode === 'local') return null;
  return service.getAccountRuntimeApiKey(account.id);
}

async function providerSelection(
  service: ProviderService,
  account: ProviderAccount,
  modelId?: string,
  recordUsage?: (accountId: string, modelId: string | undefined, usage: MorpheusPlannerUsage) => Promise<void>,
): Promise<MorpheusPlannerSelection> {
  if (!account.enabled) return { ok: false, reason: `Provider ${account.label} is disabled.` };
  if (!isProviderPlannerProtocolSupported(account.apiProtocol, account.vendorId)) {
    return { ok: false, reason: `Provider ${account.label} uses a protocol Morpheus planning does not support yet.` };
  }
  if (account.authMode === 'oauth_browser') {
    return { ok: false, reason: `Provider ${account.label} uses an OpenClaw OAuth session that is not available to the Morpheus planner adapter.` };
  }
  const apiKey = await usableApiKey(service, account);
  if (account.authMode !== 'local' && !apiKey) {
    return { ok: false, reason: `Provider ${account.label} has no API key configured.` };
  }
  try {
    return {
      ok: true,
      planner: createMorpheusProviderPlanner({ account, apiKey, modelId,
        recordUsage: recordUsage ? (usage) => recordUsage(account.id, modelId ?? account.model, usage) : undefined }),
      providerAccountId: account.id,
      modelId: modelId ?? account.model,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export function createMorpheusPlannerSelector(options: {
  providerService: ProviderService;
  deterministic?: MorpheusPlanner;
  recordUsage?: (accountId: string, modelId: string | undefined, usage: MorpheusPlannerUsage) => Promise<void>;
}): MorpheusPlannerSelector {
  const deterministic = options.deterministic ?? createDeterministicMorpheusPlanner();
  return {
    async select(agent) {
      if (agent.planner.kind === 'deterministic') return { ok: true, planner: deterministic };
      if (agent.planner.kind === 'openclaw') {
        return { ok: false, reason: 'This Agent Profile requests the OpenClaw planner adapter, which is not configured for Morpheus Core.' };
      }

      const accounts = (await options.providerService.listAccounts()).filter((account) => account.enabled);
      if (agent.planner.kind === 'provider') {
        const binding = agent.planner;
        const account = accounts.find((entry) => entry.id === binding.providerId);
        if (!account) return { ok: false, reason: `Configured provider ${binding.providerId} is unavailable.` };
        return providerSelection(options.providerService, account, binding.modelId, options.recordUsage);
      }

      const defaultId = await options.providerService.getDefaultAccountId();
      const ordered = [...accounts].sort((a, b) => (
        Number(b.id === defaultId || b.isDefault) - Number(a.id === defaultId || a.isDefault)
      ));
      const failures: string[] = [];
      for (const account of ordered) {
        const selection = await providerSelection(options.providerService, account, undefined, options.recordUsage);
        if (selection.ok) return selection;
        failures.push(selection.reason);
      }
      return {
        ok: true,
        planner: deterministic,
        fallbackReason: failures[0] ?? 'No configured planning provider; using the deterministic offline interpreter.',
      };
    },
  };
}
