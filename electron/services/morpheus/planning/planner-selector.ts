import type { MorpheusAgentProfile } from '@shared/morpheus/agent-profile-types';
import { createDeterministicMorpheusPlanner } from '@shared/morpheus/interpreter/deterministic-planner';
import type { MorpheusPlanner } from '@shared/morpheus/planner';
import { MorpheusProviderPlanError } from '@shared/morpheus/provider-plan';
import {
  classifyMorpheusPlanningComplexity,
  normalizeMorpheusPlannerRoutingPolicy,
  type MorpheusPlannerAccountRoutes,
  type MorpheusPlannerRoutingPolicy,
  type MorpheusPlanningRoutingContext,
} from '@shared/morpheus/planner-routing';
import type { ProviderAccount } from '../../../shared/providers/types';
import type { ProviderService } from '../../providers/provider-service';
import type { ManagedRuntimeBridge } from '../managed/runtime-bridge';
import { createMorpheusManagedPlanner } from './managed-planner';

import {
  createMorpheusProviderPlanner,
  createMorpheusPlannerRequestBudget,
  isProviderPlannerProtocolSupported,
  resolveMorpheusPlannerModelId,
  type MorpheusPlannerUsage,
} from './provider-planner';

export type MorpheusPlannerSelection =
  | {
      ok: true;
      planner: MorpheusPlanner;
      providerAccountId?: string;
      modelId?: string;
      fallbackReason?: string;
      routingReason?: string;
      /** Repair can change the requested model before any tool is executed. */
      getCurrentRoute?: () => { modelId: string; reason: string };
    }
  | { ok: false; reason: string };

export interface MorpheusPlannerSelector {
  select(agent: MorpheusAgentProfile, context?: MorpheusPlanningRoutingContext): Promise<MorpheusPlannerSelection>;
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
  adaptive?: { routes?: MorpheusPlannerAccountRoutes; context?: MorpheusPlanningRoutingContext },
): Promise<MorpheusPlannerSelection> {
  // Pin metadata before asynchronous credential acquisition; later account or
  // policy edits cannot redirect an already admitted objective's authority.
  account = { ...account, headers: { ...account.headers } };
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
    const savedModel = resolveMorpheusPlannerModelId(account, modelId);
    const accountId = account.id;
    const complexity = adaptive?.context ? classifyMorpheusPlanningComplexity(adaptive.context) : 'routine';
    const role = complexity === 'complex' ? 'strong' : 'efficient';
    const approvedRoleModel = role === 'strong' ? adaptive?.routes?.strongModelId : adaptive?.routes?.efficientModelId;
    const selectedModel = adaptive && approvedRoleModel ? resolveMorpheusPlannerModelId(account, approvedRoleModel) : savedModel;
    const budget = createMorpheusPlannerRequestBudget();
    const createPlanner = (requestedModel: string): MorpheusPlanner => createMorpheusProviderPlanner({
      account, apiKey, modelId: requestedModel, requestBudget: budget,
      recordUsage: recordUsage ? (usage) => recordUsage(accountId, usage.modelId, usage) : undefined,
    });
    let activeModel = selectedModel;
    let activePlanner = createPlanner(selectedModel);
    let reason = adaptive
      ? `${complexity === 'complex' ? 'Complex' : 'Routine'} planning uses ${approvedRoleModel ? `the approved ${role} model` : 'the saved account model because that route is unset'}.`
      : 'Using the saved or explicitly selected model.';
    const strongerModel = adaptive?.routes?.strongModelId
      ? resolveMorpheusPlannerModelId(account, adaptive.routes.strongModelId) : undefined;
    let initialPlanComplete = false;
    let repairAttempted = false;
    const repairableCodes = new Set([
      'invalid-json', 'invalid-shape', 'unknown-field', 'invalid-step-id', 'invalid-dependency', 'invalid-graph',
    ]);
    const planner: MorpheusPlanner = !adaptive ? activePlanner : {
      plannerId: `provider:${accountId}:adaptive`, plannedBy: 'provider',
      async plan(request) {
        try {
          const result = await activePlanner.plan(request);
          initialPlanComplete = true;
          return result;
        } catch (error) {
          // Repair invalid typed JSON only, before the initial plan reaches Core.
          // No transport/auth/payment/rate-limit/audit/cancellation/capability
          // failure or executed work can switch models or repeat native effects.
          if (initialPlanComplete || repairAttempted || (request.iteration ?? 1) !== 1
            || request.signal?.aborted || !strongerModel || strongerModel === activeModel
            || !(error instanceof MorpheusProviderPlanError) || !repairableCodes.has(error.code)) throw error;
          repairAttempted = true;
          activeModel = strongerModel;
          activePlanner = createPlanner(strongerModel);
          reason = 'The initial typed plan failed validation; one approved stronger-model repair was requested before execution.';
          const result = await activePlanner.plan(request);
          initialPlanComplete = true;
          return result;
        }
      },
      review: (request) => activePlanner.review!(request),
    };
    return {
      ok: true,
      planner,
      providerAccountId: accountId,
      modelId: selectedModel,
      routingReason: reason,
      getCurrentRoute: () => ({ modelId: activeModel, reason }),
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export function createMorpheusPlannerSelector(options: {
  providerService: ProviderService;
  getManagedRuntime?: () => ManagedRuntimeBridge | null;
  deterministic?: MorpheusPlanner;
  recordUsage?: (accountId: string, modelId: string | undefined, usage: MorpheusPlannerUsage) => Promise<void>;
  getRoutingPolicy?: () => MorpheusPlannerRoutingPolicy | Promise<MorpheusPlannerRoutingPolicy>;
}): MorpheusPlannerSelector {
  const deterministic = options.deterministic ?? createDeterministicMorpheusPlanner();
  return {
    async select(agent, context) {
      if (agent.planner.kind === 'deterministic') return { ok: true, planner: deterministic };
      if (agent.planner.kind === 'openclaw') {
        return { ok: false, reason: 'This Agent Profile requests the OpenClaw planner adapter, which is not configured for Morpheus Core.' };
      }

      const managed = options.getManagedRuntime?.();
      if (managed) return { ok: true, planner: createMorpheusManagedPlanner({ runtime: managed,
        recordUsage: options.recordUsage ? (usage) => options.recordUsage!('managed', undefined, usage) : undefined }) };

      const accounts = (await options.providerService.listAccounts()).filter((account) => account.enabled);
      if (agent.planner.kind === 'provider') {
        const binding = agent.planner;
        const account = accounts.find((entry) => entry.id === binding.providerId);
        if (!account) return { ok: false, reason: `Configured provider ${binding.providerId} is unavailable.` };
        return providerSelection(options.providerService, account, binding.modelId, options.recordUsage);
      }

      const defaultId = await options.providerService.getDefaultAccountId();
      const policy = normalizeMorpheusPlannerRoutingPolicy(await options.getRoutingPolicy?.());
      const ordered = [...accounts].sort((a, b) => (
        Number(b.id === defaultId || b.isDefault) - Number(a.id === defaultId || a.isDefault)
      ));
      const failures: string[] = [];
      const defaultAccount = defaultId ? accounts.find((account) => account.id === defaultId) : ordered[0];
      const candidates = policy.mode === 'fixed' ? ordered : defaultAccount ? [defaultAccount] : [];
      for (const account of candidates) {
        const selection = await providerSelection(options.providerService, account, undefined, options.recordUsage,
          policy.mode === 'adaptive' ? { routes: policy.routes[account.id], context } : undefined);
        if (selection.ok) return selection;
        failures.push(selection.reason);
      }
      return {
        ok: true,
        planner: deterministic,
        fallbackReason: failures[0] ?? (policy.mode === 'adaptive' && defaultId
          ? 'The saved default planning account is unavailable; using the deterministic offline interpreter.'
          : 'No configured planning provider; using the deterministic offline interpreter.'),
      };
    },
  };
}
