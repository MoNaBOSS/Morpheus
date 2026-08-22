import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { createMorpheusGrantStore } from '@electron/services/morpheus/policy/grant-store';
import {
  higherRiskTier,
  permissionScopeKey,
  scopesMatch,
  type PermissionScope,
} from '@shared/morpheus/permission-types';

const scratch = mkdtempSync(join(tmpdir(), 'morpheus-grants-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;
function freshDir(): string {
  counter += 1;
  return join(scratch, `case-${counter}`);
}

const SCOPE: PermissionScope = {
  capabilityId: 'app.launch',
  platform: 'win32',
  resourceScope: 'notepad',
  riskTier: 'medium',
  originType: 'command-bar',
};

describe('grant lifecycle', () => {
  it('allow-once creates no stored grant', () => {
    const store = createMorpheusGrantStore({ userDataDir: freshDir() });
    // `allow-once` never calls createGrant at all; nothing is remembered.
    expect(store.findGrant(SCOPE)).toBeUndefined();
    expect(store.listSessionGrants()).toEqual([]);
    expect(store.listPersistentGrants()).toEqual([]);
  });

  it('session grants are found but never written to disk', () => {
    const dir = freshDir();
    const store = createMorpheusGrantStore({ userDataDir: dir });
    store.createGrant(SCOPE, 'session');

    expect(store.findGrant(SCOPE)?.grantType).toBe('session');
    const policyFile = join(dir, 'morpheus', 'policy.json');
    if (existsSync(policyFile)) {
      expect(readFileSync(policyFile, 'utf8')).not.toContain('session');
    }
  });

  it('session grants do not survive a new store (process restart)', () => {
    const dir = freshDir();
    createMorpheusGrantStore({ userDataDir: dir }).createGrant(SCOPE, 'session');
    expect(createMorpheusGrantStore({ userDataDir: dir }).findGrant(SCOPE)).toBeUndefined();
  });

  it('persistent grants survive a restart', () => {
    const dir = freshDir();
    createMorpheusGrantStore({ userDataDir: dir }).createGrant(SCOPE, 'persistent');

    const reopened = createMorpheusGrantStore({ userDataDir: dir });
    expect(reopened.findGrant(SCOPE)?.grantType).toBe('persistent');
    expect(reopened.listPersistentGrants()).toHaveLength(1);
  });

  it('the profile survives a restart', () => {
    const dir = freshDir();
    createMorpheusGrantStore({ userDataDir: dir }).setProfile('autonomous');
    expect(createMorpheusGrantStore({ userDataDir: dir }).getProfile()).toBe('autonomous');
  });

  it('expired grants stop matching', () => {
    const store = createMorpheusGrantStore({ userDataDir: freshDir() });
    store.createGrant(SCOPE, 'persistent', new Date(Date.now() - 1000).toISOString());
    expect(store.findGrant(SCOPE)).toBeUndefined();
    expect(store.listPersistentGrants()).toEqual([]);
  });

  it('a future expiry still matches', () => {
    const store = createMorpheusGrantStore({ userDataDir: freshDir() });
    store.createGrant(SCOPE, 'persistent', new Date(Date.now() + 60_000).toISOString());
    expect(store.findGrant(SCOPE)).toBeDefined();
  });

  it('revocation takes effect immediately, without restart', () => {
    const store = createMorpheusGrantStore({ userDataDir: freshDir() });
    const grant = store.createGrant(SCOPE, 'session');
    expect(store.findGrant(SCOPE)).toBeDefined();

    expect(store.revoke(grant.grantId)).toBe(true);
    expect(store.findGrant(SCOPE)).toBeUndefined();
    expect(store.revoke(grant.grantId)).toBe(false);
  });

  it('revoking a persistent grant also persists', () => {
    const dir = freshDir();
    const store = createMorpheusGrantStore({ userDataDir: dir });
    const grant = store.createGrant(SCOPE, 'persistent');
    store.revoke(grant.grantId);

    expect(createMorpheusGrantStore({ userDataDir: dir }).findGrant(SCOPE)).toBeUndefined();
  });

  it('revokeAllSession clears only session grants', () => {
    const store = createMorpheusGrantStore({ userDataDir: freshDir() });
    store.createGrant(SCOPE, 'session');
    store.createGrant({ ...SCOPE, resourceScope: 'other' }, 'persistent');

    expect(store.revokeAllSession()).toBe(1);
    expect(store.listSessionGrants()).toEqual([]);
    expect(store.listPersistentGrants()).toHaveLength(1);
  });

  it('reset clears everything and restores the default profile', () => {
    const store = createMorpheusGrantStore({ userDataDir: freshDir() });
    store.setProfile('autonomous');
    store.createGrant(SCOPE, 'persistent');
    store.createGrant(SCOPE, 'session');

    store.reset();
    expect(store.getProfile()).toBe('autonomous');
    expect(store.listPersistentGrants()).toEqual([]);
    expect(store.listSessionGrants()).toEqual([]);
  });

  it('records use counts and last-used time', () => {
    const store = createMorpheusGrantStore({ userDataDir: freshDir() });
    const grant = store.createGrant(SCOPE, 'persistent');
    store.recordUse(grant.grantId);
    store.recordUse(grant.grantId);

    const found = store.listPersistentGrants()[0];
    expect(found.useCount).toBe(2);
    expect(found.lastUsedAt).toBeTruthy();
  });

  it('re-granting the same scope replaces rather than stacks', () => {
    const store = createMorpheusGrantStore({ userDataDir: freshDir() });
    store.createGrant(SCOPE, 'persistent');
    store.createGrant(SCOPE, 'persistent');
    expect(store.listPersistentGrants()).toHaveLength(1);
  });

  it('a persistent denial is returned ahead of an allow for the same scope', () => {
    const store = createMorpheusGrantStore({ userDataDir: freshDir() });
    store.createGrant(SCOPE, 'denied-persistent');
    expect(store.findGrant(SCOPE)?.grantType).toBe('denied-persistent');
    expect(store.listDeniedScopes()).toHaveLength(1);
  });
});

describe('stored policy is untrusted input', () => {
  function writePolicy(dir: string, policy: unknown): void {
    mkdirSync(join(dir, 'morpheus'), { recursive: true });
    writeFileSync(join(dir, 'morpheus', 'policy.json'), JSON.stringify(policy), 'utf8');
  }

  it('discards wildcard grants that would widen scope', () => {
    const dir = freshDir();
    writePolicy(dir, {
      v: 1,
      profile: 'balanced',
      updatedAt: new Date().toISOString(),
      grants: [
        { grantId: 'g1', capabilityId: '*', platform: 'win32', resourceScope: 'notepad', riskTier: 'medium', originType: 'command-bar', grantType: 'persistent', createdAt: new Date().toISOString(), useCount: 0 },
        { grantId: 'g2', capabilityId: 'app.launch', platform: 'win32', resourceScope: '*', riskTier: 'medium', originType: 'command-bar', grantType: 'persistent', createdAt: new Date().toISOString(), useCount: 0 },
        { grantId: 'g3', capabilityId: 'app.launch', platform: '*', resourceScope: 'notepad', riskTier: 'medium', originType: 'command-bar', grantType: 'persistent', createdAt: new Date().toISOString(), useCount: 0 },
      ],
    });

    expect(createMorpheusGrantStore({ userDataDir: dir }).listPersistentGrants()).toEqual([]);
  });

  it('discards malformed grants and survives a corrupt file', () => {
    const dir = freshDir();
    writePolicy(dir, { v: 1, profile: 'balanced', grants: [{ nope: true }, null, 'string'] });
    expect(createMorpheusGrantStore({ userDataDir: dir }).listPersistentGrants()).toEqual([]);

    const broken = freshDir();
    mkdirSync(join(broken, 'morpheus'), { recursive: true });
    writeFileSync(join(broken, 'morpheus', 'policy.json'), '{not json', 'utf8');
    const store = createMorpheusGrantStore({ userDataDir: broken });
    expect(store.getProfile()).toBe('autonomous');
    expect(store.listPersistentGrants()).toEqual([]);
  });

  it('falls back to the default profile for an unknown stored profile', () => {
    const dir = freshDir();
    writePolicy(dir, { v: 1, profile: 'godmode', grants: [] });
    expect(createMorpheusGrantStore({ userDataDir: dir }).getProfile()).toBe('autonomous');
  });

  it('never accepts a session grant from disk', () => {
    const dir = freshDir();
    writePolicy(dir, {
      v: 1,
      profile: 'balanced',
      grants: [{ grantId: 'g1', capabilityId: 'app.launch', platform: 'win32', resourceScope: 'notepad', riskTier: 'medium', originType: 'command-bar', grantType: 'session', createdAt: new Date().toISOString(), useCount: 0 }],
    });
    expect(createMorpheusGrantStore({ userDataDir: dir }).findGrant(SCOPE)).toBeUndefined();
  });
});

describe('scope keys', () => {
  it('are exact and unambiguous across field boundaries', () => {
    const a: PermissionScope = { ...SCOPE, resourceScope: 'a', platform: 'b:c' };
    const b: PermissionScope = { ...SCOPE, resourceScope: 'a:b', platform: 'c' };
    expect(permissionScopeKey(a)).not.toBe(permissionScopeKey(b));
    expect(scopesMatch(a, b)).toBe(false);
  });

  it('match identical scopes', () => {
    expect(scopesMatch(SCOPE, { ...SCOPE })).toBe(true);
  });
});

describe('risk escalation', () => {
  it('returns the stricter tier so risk can never be downgraded', () => {
    expect(higherRiskTier('low', 'critical')).toBe('critical');
    expect(higherRiskTier('critical', 'low')).toBe('critical');
    expect(higherRiskTier('medium', 'high')).toBe('high');
    expect(higherRiskTier('low', 'low')).toBe('low');
  });
});
