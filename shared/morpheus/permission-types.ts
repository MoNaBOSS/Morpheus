/**
 * Morpheus permission and trust model.
 *
 * "Confirm every execution" trains users to click through prompts; "trust
 * everything" hands a provider unrestricted machine authority. The answer is
 * narrow, remembered, revocable consent graded by risk.
 *
 * Imported by BOTH processes: no `electron`, no `node:*` imports.
 * Canonical prose: docs/security/PERMISSION_MODEL.md
 */

import type { MorpheusActionId, MorpheusRiskTier } from './actions/registry';
import type { ExecutionOriginType } from './execution-types';

export const MORPHEUS_POLICY_VERSION = 1 as const;

export type PermissionProfile = 'strict' | 'balanced' | 'autonomous';

export const PERMISSION_PROFILES: readonly PermissionProfile[] =
  Object.freeze(['strict', 'balanced', 'autonomous']);

export const DEFAULT_PERMISSION_PROFILE: PermissionProfile = 'balanced';

/** What the user chose at a prompt. */
export type PermissionDecisionKind =
  | 'deny'
  | 'deny-always'
  | 'allow-once'
  | 'allow-session'
  | 'allow-always';

export const PERMISSION_DECISION_KINDS: readonly PermissionDecisionKind[] = Object.freeze([
  'deny',
  'deny-always',
  'allow-once',
  'allow-session',
  'allow-always',
]);

export type GrantType = 'session' | 'persistent' | 'denied-persistent';

/**
 * The grant a decision creates, or `null` for a one-time answer.
 *
 * One definition rather than an inline ternary at each call site: a second copy
 * that mapped `allow-always` to a session grant (or worse, the reverse) would
 * silently widen or narrow trust, and the two paths would drift apart.
 */
export function grantTypeForDecision(decision: PermissionDecisionKind): GrantType | null {
  switch (decision) {
    case 'allow-session': return 'session';
    case 'allow-always': return 'persistent';
    case 'deny-always': return 'denied-persistent';
    default: return null;
  }
}

/**
 * The exact scope a grant binds to.
 *
 * Every field participates in matching, by exact equality. There are no
 * wildcards: "always allow every executable" and "always allow arbitrary paths"
 * must be impossible to express.
 */
export type PermissionScope = {
  capabilityId: MorpheusActionId;
  platform: string;
  /** Application key, canonical directory — never a raw user-supplied path. */
  resourceScope: string;
  riskTier: MorpheusRiskTier;
  originType: ExecutionOriginType;
  /** Optional agent or workflow identity; distinct identities do not share trust. */
  agentId?: string;
};

export type PermissionGrant = PermissionScope & {
  grantId: string;
  grantType: GrantType;
  createdAt: string;
  /** ISO timestamp; absent means no expiry. */
  expiresAt?: string;
  lastUsedAt?: string;
  useCount: number;
  revokedAt?: string;
};

export type PermissionPolicyState = {
  v: typeof MORPHEUS_POLICY_VERSION;
  profile: PermissionProfile;
  /** Persistent grants and persistent denials. Session grants live in memory. */
  grants: PermissionGrant[];
  updatedAt: string;
};

/** Why a run was allowed or blocked — surfaced verbatim in the interface. */
export type PermissionResolutionReason =
  | 'privacy-safe-auto'
  | 'profile-auto'
  | 'session-grant'
  | 'persistent-grant'
  | 'prompt-required'
  | 'mandatory-confirmation'
  | 'persistent-denial'
  | 'audit-degraded';

export type PermissionResolution =
  | { outcome: 'allow'; reason: Extract<PermissionResolutionReason, 'privacy-safe-auto' | 'profile-auto' | 'session-grant' | 'persistent-grant'>; grantId?: string }
  | { outcome: 'prompt'; reason: Extract<PermissionResolutionReason, 'prompt-required' | 'mandatory-confirmation'> }
  | { outcome: 'deny'; reason: Extract<PermissionResolutionReason, 'persistent-denial' | 'audit-degraded'> };

/** i18n key for the human-readable explanation of a resolution. */
export function permissionReasonLabelKey(reason: PermissionResolutionReason): string {
  return `morpheus.permission.reasons.${reason}`;
}

export type PermissionCenterSnapshot = {
  profile: PermissionProfile;
  sessionGrants: PermissionGrant[];
  persistentGrants: PermissionGrant[];
  deniedScopes: PermissionGrant[];
  /** True when audit persistence is unhealthy and writes are blocked. */
  auditDegraded: boolean;
};

export type SetPermissionProfilePayload = { profile: PermissionProfile };
export type RevokeGrantPayload = { grantId: string };
export type PermissionAcknowledgement = { ok: boolean };

/**
 * Canonical scope key. Used for exact-match lookup and for audit records.
 *
 * JSON-encoded rather than delimiter-joined: any single separator is ambiguous
 * when it can also occur inside one of the parts, which would let two distinct
 * scopes collide onto one grant.
 */
export function permissionScopeKey(scope: PermissionScope): string {
  return JSON.stringify([
    scope.capabilityId,
    scope.platform,
    scope.resourceScope,
    scope.riskTier,
    scope.originType,
    scope.agentId ?? '',
  ]);
}

export function scopesMatch(a: PermissionScope, b: PermissionScope): boolean {
  return permissionScopeKey(a) === permissionScopeKey(b);
}

const RISK_ORDER: Record<MorpheusRiskTier, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * The stricter of two tiers.
 *
 * The capability descriptor is authoritative — a caller must never be able to
 * *downgrade* risk — but a scope that claims a HIGHER tier is honoured, so the
 * comparison fails closed in both directions.
 */
export function higherRiskTier(a: MorpheusRiskTier, b: MorpheusRiskTier): MorpheusRiskTier {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

export function isGrantExpired(grant: PermissionGrant, now: Date): boolean {
  if (!grant.expiresAt) return false;
  const expiry = Date.parse(grant.expiresAt);
  return Number.isFinite(expiry) && expiry <= now.getTime();
}

export function isGrantActive(grant: PermissionGrant, now: Date): boolean {
  return !grant.revokedAt && !isGrantExpired(grant, now);
}
