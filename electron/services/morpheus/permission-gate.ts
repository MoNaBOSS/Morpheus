/**
 * Decides whether a resolved Morpheus run needs an explicit confirmation.
 *
 * Behind an interface so risk-tiered or policy-backed gates can replace this
 * one without touching the runtime. In Concept Build 0.1 the only shipped
 * implementation always prompts: there is no remembered decision, no
 * pre-granted action, and no risk tier that bypasses the confirmation.
 */
import type { MorpheusActionId, MorpheusRiskTier } from '@shared/morpheus/actions/registry';
import type { MorpheusPermissionDecision, MorpheusResolvedTarget } from '@shared/morpheus/action-types';

export type MorpheusPermissionRequest = {
  runId: string;
  actionId: MorpheusActionId;
  riskTier: MorpheusRiskTier;
  target: MorpheusResolvedTarget;
};

export type MorpheusGateVerdict =
  | { kind: 'prompt' }
  | { kind: 'auto'; decision: MorpheusPermissionDecision };

export interface MorpheusPermissionGate {
  evaluate(request: MorpheusPermissionRequest): MorpheusGateVerdict;
}

export function createAlwaysPromptPermissionGate(): MorpheusPermissionGate {
  return {
    evaluate(): MorpheusGateVerdict {
      return { kind: 'prompt' };
    },
  };
}
