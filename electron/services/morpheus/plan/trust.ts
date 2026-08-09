/**
 * Plan-level trust evaluation — the "ask once" half of the permission model.
 *
 * 0.1.1 evaluated one capability at a time and prompted per run. Five steps
 * writing into the same approved folder produced five dialogs. That is the
 * supervise-every-tool-call experience Morpheus explicitly rejects, and it is
 * also a security failure in its own right: people stop reading prompts they
 * see constantly.
 *
 * This module evaluates the WHOLE plan before anything runs, then reduces the
 * result to the set of trust boundaries that are genuinely new. A plan that
 * stays inside already-granted scopes produces zero prompts.
 *
 * What it does NOT do is weaken the floor. Every step is still evaluated by the
 * same policy engine, in the same order, against the same grants — this layer
 * only decides how the results are *presented* and *batched*. A `critical` step
 * still confirms; a persistent denial still rejects the plan.
 *
 * See docs/security/PERMISSION_MODEL.md and docs/architecture/MORPHEUS_0.5_ARCHITECTURE.md.
 */
import {
  permissionScopeKey,
  type PermissionScope,
} from '@shared/morpheus/permission-types';
import { requiresMandatoryConfirmation } from '@shared/morpheus/actions/registry';

import type { AuditHealth, MorpheusPolicyEngine } from '../policy/policy-engine';

/**
 * One distinct trust boundary the user is asked about, covering every step that
 * shares it. This is the deduplication that makes Balanced feel convenient.
 */
export type TrustBoundary = {
  /** Stable identity: the exact scope key. Two steps sharing it share a prompt. */
  boundaryId: string;
  scope: PermissionScope;
  /** Steps this single approval covers. */
  stepIds: readonly string[];
  /**
   * The concrete targets Main resolved, deduplicated.
   *
   * Distinct from `scope.resourceScope` on purpose: the scope is what a
   * remembered grant binds to (a folder, an application key), while these are
   * what will actually happen NOW (a specific file, a specific executable).
   * Showing only the scope would hide the filename; showing only the target
   * would misstate what "always allow" would cover.
   */
  targets: readonly string[];
  /** True when no grant may waive the confirmation, whatever the user picks. */
  mandatoryConfirmation: boolean;
};

export type DeniedStep = {
  stepId: string;
  scope: PermissionScope;
  reason: string;
};

export type PlanTrustAssessment = {
  /**
   * `ready`         — nothing to ask; execute immediately.
   * `needs-consent` — one batched request, then execute the approved plan.
   * `rejected`      — at least one step can never run; the plan does not start.
   */
  outcome: 'ready' | 'needs-consent' | 'rejected';
  /** Steps already covered by profile or existing grant. */
  autoAllowed: readonly string[];
  /** Deduplicated boundaries requiring consent, in first-appearance order. */
  consentRequired: readonly TrustBoundary[];
  /** Steps refused outright, with the policy reason. */
  denied: readonly DeniedStep[];
};

export type EvaluatePlanTrustInput = {
  /** Scopes resolved by Main from real targets — never renderer-supplied. */
  scopesByStep: ReadonlyMap<string, PermissionScope>;
  /** Execution order, so boundaries are presented in the order they arise. */
  order: readonly string[];
  /** Concrete resolved target per step, for disclosure in the prompt. */
  targetsByStep?: ReadonlyMap<string, string>;
  policy: MorpheusPolicyEngine;
  auditHealth: AuditHealth;
  now?: Date;
};

/**
 * Partitions a plan's steps into auto-allowed, needing consent, and denied.
 *
 * A denial anywhere rejects the whole plan rather than silently executing the
 * remainder. Partial execution of a plan the user approved as a unit would
 * leave the machine in a state nobody asked for, and the user would have to
 * reconstruct what did and did not happen.
 */
export function evaluatePlanTrust(input: EvaluatePlanTrustInput): PlanTrustAssessment {
  const { scopesByStep, order, policy, auditHealth, targetsByStep, now = new Date() } = input;

  const autoAllowed: string[] = [];
  const denied: DeniedStep[] = [];
  const boundaries = new Map<string, { scope: PermissionScope; stepIds: string[]; targets: Set<string> }>();

  for (const stepId of order) {
    const scope = scopesByStep.get(stepId);
    if (!scope) {
      // A step with no resolved scope must never fall through to execution.
      denied.push({
        stepId,
        scope: { capabilityId: 'system.report', platform: 'unknown', resourceScope: '', riskTier: 'critical', originType: 'command-bar' },
        reason: 'unresolved-scope',
      });
      continue;
    }

    const resolution = policy.evaluate({ scope, auditHealth, now });

    if (resolution.outcome === 'allow') {
      autoAllowed.push(stepId);
      continue;
    }
    if (resolution.outcome === 'deny') {
      denied.push({ stepId, scope, reason: resolution.reason });
      continue;
    }

    const boundaryId = permissionScopeKey(scope);
    const target = targetsByStep?.get(stepId);
    const existing = boundaries.get(boundaryId);
    if (existing) {
      existing.stepIds.push(stepId);
      if (target) existing.targets.add(target);
    } else {
      boundaries.set(boundaryId, {
        scope,
        stepIds: [stepId],
        targets: new Set(target ? [target] : []),
      });
    }
  }

  const consentRequired: TrustBoundary[] = [...boundaries.entries()].map(([boundaryId, entry]) => ({
    boundaryId,
    scope: entry.scope,
    stepIds: entry.stepIds,
    targets: [...entry.targets],
    mandatoryConfirmation: requiresMandatoryConfirmation(entry.scope.riskTier),
  }));

  const outcome = denied.length > 0
    ? 'rejected'
    : consentRequired.length > 0 ? 'needs-consent' : 'ready';

  return { outcome, autoAllowed, consentRequired, denied };
}

/**
 * Whether a decision may be remembered for a boundary.
 *
 * A mandatory-confirmation boundary accepts a one-time allow but never a
 * session or persistent grant: recording trust for it would let the NEXT
 * occurrence run without asking, which is exactly what `critical` forbids.
 */
export function permittedDecisionsFor(boundary: TrustBoundary): readonly string[] {
  return boundary.mandatoryConfirmation
    ? ['deny', 'deny-always', 'allow-once']
    : ['deny', 'deny-always', 'allow-once', 'allow-session', 'allow-always'];
}
