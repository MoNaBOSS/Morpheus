/**
 * Policy-backed permission gate.
 *
 * Adapts the risk-based policy engine to the gate interface the run
 * orchestrator already consumes, so the runtime keeps one narrow contract
 * ("may this run proceed?") while the decision logic lives in one auditable
 * place.
 *
 * Replaces the always-prompt gate from 0.1. Confirming every execution is not
 * an acceptable sole mode — it trains users to click through prompts.
 */
import type {
  PermissionResolution,
  PermissionScope,
} from '@shared/morpheus/permission-types';

import type { MorpheusGrantStore } from './grant-store';
import type { AuditHealth, MorpheusPolicyEngine } from './policy-engine';

export type MorpheusGateRequest = {
  scope: PermissionScope;
  auditHealth: AuditHealth;
};

export interface MorpheusPermissionGate {
  evaluate(request: MorpheusGateRequest): PermissionResolution;
  /** Marks a grant as used, for the Permission Center's last-used column. */
  recordGrantUse(grantId: string): void;
}

export function createPolicyPermissionGate(
  engine: MorpheusPolicyEngine,
  store: MorpheusGrantStore,
): MorpheusPermissionGate {
  return {
    evaluate: (request) => engine.evaluate(request),
    recordGrantUse: (grantId) => store.recordUse(grantId),
  };
}
