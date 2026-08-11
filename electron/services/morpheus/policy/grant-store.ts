/**
 * Main-owned permission policy store.
 *
 * The renderer CANNOT write here. It may request an action and answer a prompt;
 * it may not create, modify or delete a grant. `settings.set` is a
 * renderer-reachable host action, so anything kept in the settings store is
 * renderer-writable and therefore not a security boundary — this file is the
 * boundary instead.
 *
 * Session grants live only in memory and die with the process. Persistent
 * grants are written atomically (temp + rename) so a crash mid-write cannot
 * leave a half-parsed policy that silently widens or narrows trust.
 *
 * See docs/security/PERMISSION_MODEL.md.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';

import {
  DEFAULT_PERMISSION_PROFILE,
  MORPHEUS_POLICY_VERSION,
  PERMISSION_PROFILES,
  isGrantActive,
  permissionScopeKey,
  type GrantType,
  type PermissionGrant,
  type PermissionPolicyState,
  type PermissionProfile,
  type PermissionScope,
} from '@shared/morpheus/permission-types';

export type GrantStoreOptions = {
  userDataDir: string;
  now?: () => Date;
  createId?: () => string;
};

export interface MorpheusGrantStore {
  getProfile(): PermissionProfile;
  setProfile(profile: PermissionProfile): void;
  /** Active, non-expired, non-revoked grant matching this exact scope. */
  findGrant(scope: PermissionScope): PermissionGrant | undefined;
  createGrant(scope: PermissionScope, grantType: GrantType, expiresAt?: string): PermissionGrant;
  recordUse(grantId: string): void;
  revoke(grantId: string): boolean;
  /** Revokes every grant bound to one exact Main-resolved resource scope. */
  revokeForResourceScope(resourceScope: string): number;
  revokeAllSession(): number;
  reset(): void;
  listSessionGrants(): PermissionGrant[];
  listPersistentGrants(): PermissionGrant[];
  listDeniedScopes(): PermissionGrant[];
}

function policyPath(userDataDir: string): string {
  return join(userDataDir, 'morpheus', 'policy.json');
}

function emptyState(now: Date): PermissionPolicyState {
  return {
    v: MORPHEUS_POLICY_VERSION,
    profile: DEFAULT_PERMISSION_PROFILE,
    grants: [],
    updatedAt: now.toISOString(),
  };
}

/**
 * Rejects anything that would widen a grant beyond an exact scope. A stored
 * policy is untrusted input too: a hand-edited or corrupted file must not be
 * able to express "allow everything".
 */
function isValidStoredGrant(value: unknown): value is PermissionGrant {
  if (!value || typeof value !== 'object') return false;
  const grant = value as Record<string, unknown>;
  for (const field of ['grantId', 'capabilityId', 'platform', 'resourceScope', 'riskTier', 'originType', 'grantType', 'createdAt']) {
    if (typeof grant[field] !== 'string' || !(grant[field] as string)) return false;
  }
  // No wildcards, ever.
  for (const field of ['capabilityId', 'platform', 'resourceScope']) {
    const raw = grant[field] as string;
    if (raw === '*' || raw.includes('*')) return false;
  }
  const grantType = grant.grantType as string;
  if (grantType !== 'persistent' && grantType !== 'denied-persistent') return false;
  return true;
}

export function createMorpheusGrantStore(options: GrantStoreOptions): MorpheusGrantStore {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => randomUUID());
  const file = policyPath(options.userDataDir);

  let persisted: PermissionPolicyState;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as PermissionPolicyState;
    const profile = PERMISSION_PROFILES.includes(parsed?.profile) ? parsed.profile : DEFAULT_PERMISSION_PROFILE;
    const grants = Array.isArray(parsed?.grants) ? parsed.grants.filter(isValidStoredGrant) : [];
    persisted = { v: MORPHEUS_POLICY_VERSION, profile, grants, updatedAt: parsed?.updatedAt ?? now().toISOString() };
  } catch {
    persisted = emptyState(now());
  }

  // Session grants never touch disk.
  const sessionGrants = new Map<string, PermissionGrant>();

  const flush = (): void => {
    persisted.updatedAt = now().toISOString();
    mkdirSync(dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(persisted, null, 2)}\n`, 'utf8');
    renameSync(temporary, file);
  };

  const activePersistent = (): PermissionGrant[] =>
    persisted.grants.filter((grant) => isGrantActive(grant, now()));

  return {
    getProfile: () => persisted.profile,

    setProfile(profile: PermissionProfile): void {
      if (!PERMISSION_PROFILES.includes(profile)) throw new Error(`Unknown permission profile: ${profile}`);
      persisted.profile = profile;
      flush();
    },

    findGrant(scope: PermissionScope): PermissionGrant | undefined {
      const key = permissionScopeKey(scope);
      const current = now();

      // A persistent denial outranks any allow for the same scope.
      const denial = persisted.grants.find(
        (grant) => grant.grantType === 'denied-persistent'
          && permissionScopeKey(grant) === key
          && isGrantActive(grant, current),
      );
      if (denial) return denial;

      const session = sessionGrants.get(key);
      if (session && isGrantActive(session, current)) return session;

      return persisted.grants.find(
        (grant) => grant.grantType === 'persistent'
          && permissionScopeKey(grant) === key
          && isGrantActive(grant, current),
      );
    },

    createGrant(scope: PermissionScope, grantType: GrantType, expiresAt?: string): PermissionGrant {
      const grant: PermissionGrant = {
        ...scope,
        grantId: createId(),
        grantType,
        createdAt: now().toISOString(),
        expiresAt,
        useCount: 0,
      };

      if (grantType === 'session') {
        sessionGrants.set(permissionScopeKey(scope), grant);
        return grant;
      }

      // Replace any prior grant for the identical scope rather than stacking.
      const key = permissionScopeKey(scope);
      persisted.grants = persisted.grants.filter((existing) => permissionScopeKey(existing) !== key);
      persisted.grants.push(grant);
      flush();
      return grant;
    },

    recordUse(grantId: string): void {
      const stamp = now().toISOString();
      for (const grant of sessionGrants.values()) {
        if (grant.grantId === grantId) {
          grant.lastUsedAt = stamp;
          grant.useCount += 1;
          return;
        }
      }
      const persistedGrant = persisted.grants.find((grant) => grant.grantId === grantId);
      if (persistedGrant) {
        persistedGrant.lastUsedAt = stamp;
        persistedGrant.useCount += 1;
        flush();
      }
    },

    revoke(grantId: string): boolean {
      const stamp = now().toISOString();
      for (const [key, grant] of sessionGrants) {
        if (grant.grantId === grantId) {
          // Removed outright: revocation must take effect on the next
          // execution, with no restart and no lingering match.
          sessionGrants.delete(key);
          return true;
        }
      }
      const grant = persisted.grants.find((candidate) => candidate.grantId === grantId);
      if (!grant) return false;
      grant.revokedAt = stamp;
      persisted.grants = persisted.grants.filter((candidate) => candidate.grantId !== grantId);
      flush();
      return true;
    },

    revokeForResourceScope(resourceScope: string): number {
      let count = 0;
      for (const [key, grant] of sessionGrants) {
        if (grant.resourceScope === resourceScope) {
          sessionGrants.delete(key);
          count += 1;
        }
      }
      const retained = persisted.grants.filter((grant) => {
        if (grant.resourceScope !== resourceScope) return true;
        count += 1;
        return false;
      });
      if (retained.length !== persisted.grants.length) {
        persisted.grants = retained;
        flush();
      }
      return count;
    },

    revokeAllSession(): number {
      const count = sessionGrants.size;
      sessionGrants.clear();
      return count;
    },

    reset(): void {
      sessionGrants.clear();
      persisted = emptyState(now());
      flush();
    },

    listSessionGrants: () => [...sessionGrants.values()].filter((grant) => isGrantActive(grant, now())),
    listPersistentGrants: () => activePersistent().filter((grant) => grant.grantType === 'persistent'),
    listDeniedScopes: () => activePersistent().filter((grant) => grant.grantType === 'denied-persistent'),
  };
}
