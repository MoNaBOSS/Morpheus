/**
 * Morpheus permission policy engine.
 *
 * Decides, for one resolved step, whether it may run automatically, must be
 * confirmed, or is refused outright.
 *
 * Evaluation order is deliberate and must not be reordered — each rule exists
 * to stop a specific way of widening trust:
 *
 *   1. Audit health      — never execute privileged work that cannot be recorded.
 *   2. Persistent denial — an explicit "never" outranks every allow.
 *   3. Mandatory tier    — high/critical always confirm, whatever the grant says.
 *   4. Privacy-safe read — harmless under every profile.
 *   5. Stored grant      — exact-scope session or persistent allow.
 *   6. Profile default   — Autonomous may auto-run low risk; others prompt.
 *
 * See docs/security/PERMISSION_MODEL.md.
 */
import {
  higherRiskTier,
  isGrantActive,
  type PermissionProfile,
  type PermissionResolution,
  type PermissionScope,
} from '@shared/morpheus/permission-types';
import {
  getMorpheusActionDescriptor,
  requiresMandatoryConfirmation,
} from '@shared/morpheus/actions/registry';

import type { MorpheusGrantStore } from './grant-store';

export type AuditHealth = 'healthy' | 'degraded';

export type PolicyEvaluationInput = {
  scope: PermissionScope;
  auditHealth: AuditHealth;
  now?: Date;
};

export interface MorpheusPolicyEngine {
  evaluate(input: PolicyEvaluationInput): PermissionResolution;
}

export function createMorpheusPolicyEngine(store: MorpheusGrantStore): MorpheusPolicyEngine {
  return {
    evaluate({ scope, auditHealth, now = new Date() }: PolicyEvaluationInput): PermissionResolution {
      const descriptor = getMorpheusActionDescriptor(scope.capabilityId);
      const profile: PermissionProfile = store.getProfile();

      // The descriptor is authoritative so a caller can never DOWNGRADE risk,
      // but a scope claiming a higher tier is honoured. Fails closed both ways.
      const effectiveTier = higherRiskTier(descriptor.riskTier, scope.riskTier);
      const mandatory = requiresMandatoryConfirmation(effectiveTier);

      // 1. Availability is not a reason to execute unaudited privileged work.
      //    Privacy-safe reads stay available so the product degrades rather
      //    than dying, but nothing that writes or launches gets through.
      if (auditHealth === 'degraded' && !descriptor.privacySafe) {
        return { outcome: 'deny', reason: 'audit-degraded' };
      }

      const grant = store.findGrant(scope);

      // 2. An explicit persistent denial cannot be overridden by a later allow.
      if (grant && grant.grantType === 'denied-persistent' && isGrantActive(grant, now)) {
        return { outcome: 'deny', reason: 'persistent-denial' };
      }

      // 3. The mandatory-confirmation floor. Checked BEFORE grants so no grant,
      //    however broad or however it was created, can waive it.
      if (mandatory) {
        return { outcome: 'prompt', reason: 'mandatory-confirmation' };
      }

      // 4. Read-only and identity-free: safe under every profile, including Strict.
      if (descriptor.privacySafe && effectiveTier === 'low') {
        return { outcome: 'allow', reason: 'privacy-safe-auto' };
      }

      // 5. Remembered consent for this exact scope.
      //    Strict deliberately ignores grants for medium and above: its contract
      //    is "writes, launches and external actions ask every time".
      if (grant && isGrantActive(grant, now) && profile !== 'strict') {
        return {
          outcome: 'allow',
          reason: grant.grantType === 'session' ? 'session-grant' : 'persistent-grant',
          grantId: grant.grantId,
        };
      }

      // 6. Profile defaults.
      //    Autonomous widens automatic execution to low risk generally, but
      //    medium risk still needs an explicit trusted scope — that is what
      //    keeps Autonomous from meaning arbitrary shell access.
      if (profile === 'autonomous' && effectiveTier === 'low') {
        return { outcome: 'allow', reason: 'profile-auto' };
      }

      return { outcome: 'prompt', reason: 'prompt-required' };
    },
  };
}
