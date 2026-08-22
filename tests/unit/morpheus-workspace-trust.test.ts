import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createMorpheusGrantStore, type MorpheusGrantStore } from '@electron/services/morpheus/policy/grant-store';
import { createMorpheusPolicyEngine } from '@electron/services/morpheus/policy/policy-engine';
import { resourceScopeFor } from '@electron/services/morpheus/runtime';
import {
  MORPHEUS_CAPABILITY_GROUPS,
  MORPHEUS_ACTIONS,
  getMorpheusActionDescriptor,
  requiresMandatoryConfirmation,
  type MorpheusActionId,
} from '@shared/morpheus/actions/registry';
import { permissionScopeKey, type PermissionScope } from '@shared/morpheus/permission-types';

const scratch = mkdtempSync(join(tmpdir(), 'morpheus-ws-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const WORKSPACE = 'C:\\Users\\x\\AppData\\Roaming\\Morpheus\\files';

let counter = 0;
let store: MorpheusGrantStore;
beforeEach(() => {
  counter += 1;
  store = createMorpheusGrantStore({ userDataDir: join(scratch, `case-${counter}`) });
  store.setProfile('balanced');
});

function scopeFor(capabilityId: MorpheusActionId, resourceScope = WORKSPACE): PermissionScope {
  const descriptor = getMorpheusActionDescriptor(capabilityId);
  return {
    capabilityId,
    capabilityGroup: descriptor.group,
    platform: 'win32',
    resourceScope,
    riskTier: descriptor.riskTier,
    originType: 'command-bar',
  };
}

function evaluate(capabilityId: MorpheusActionId, resourceScope = WORKSPACE) {
  return createMorpheusPolicyEngine(store).evaluate({
    scope: scopeFor(capabilityId, resourceScope),
    auditHealth: 'healthy',
  });
}

describe('trust is workspace-shaped, not file-by-file', () => {
  it('the grant scope is the workspace root, not the file or its parent folder', () => {
    // Slicing the parent directory would make every subfolder a new boundary,
    // so a user who approved a workspace would be re-prompted the moment work
    // nested one level deeper.
    const nested = resourceScopeFor({
      kind: 'file',
      path: `${WORKSPACE}\\reports\\2026\\q1.md`,
      bytes: 10,
      workspaceRoot: WORKSPACE,
    });
    const shallow = resourceScopeFor({
      kind: 'file',
      path: `${WORKSPACE}\\notes.txt`,
      bytes: 10,
      workspaceRoot: WORKSPACE,
    });
    expect(nested).toBe(WORKSPACE);
    expect(shallow).toBe(WORKSPACE);
    expect(nested).toBe(shallow);
  });

  it('a folder target scopes to the workspace too', () => {
    expect(resourceScopeFor({
      kind: 'folder', path: `${WORKSPACE}\\deep\\nested`, workspaceRoot: WORKSPACE,
    })).toBe(WORKSPACE);
  });
});

describe('one workspace decision covers the routine operations', () => {
  it('approving a write covers every other non-destructive write verb', () => {
    store.createGrant(scopeFor('file.createText'), 'persistent');

    for (const capabilityId of MORPHEUS_CAPABILITY_GROUPS['workspace.write']) {
      expect(evaluate(capabilityId).outcome, capabilityId).toBe('allow');
    }
  });

  it('approving a read covers every other read verb', () => {
    store.createGrant(scopeFor('file.list'), 'persistent');

    for (const capabilityId of MORPHEUS_CAPABILITY_GROUPS['workspace.read']) {
      expect(evaluate(capabilityId).outcome, capabilityId).toBe('allow');
    }
  });

  it('read and write remain SEPARATE decisions', () => {
    // Approving "look at my files" must not silently become "change them".
    store.createGrant(scopeFor('file.list'), 'persistent');
    expect(evaluate('file.readText').outcome).toBe('allow');
    expect(evaluate('file.createText').outcome).toBe('prompt');
  });

  it('a grant does NOT extend to a different workspace', () => {
    store.createGrant(scopeFor('file.createText'), 'persistent');
    expect(evaluate('file.appendText', 'C:\\Somewhere\\Else').outcome).toBe('prompt');
  });

  it('a grant does NOT extend to a different origin', () => {
    store.createGrant(scopeFor('file.createText'), 'persistent');
    const engine = createMorpheusPolicyEngine(store);
    expect(engine.evaluate({
      scope: { ...scopeFor('file.appendText'), originType: 'schedule' },
      auditHealth: 'healthy',
    }).outcome).toBe('prompt');
  });

  it('revoking the workspace grant re-arms every verb in the group', () => {
    store.createGrant(scopeFor('file.createText'), 'persistent');
    expect(evaluate('file.appendText').outcome).toBe('allow');

    const grant = store.listPersistentGrants()[0];
    expect(store.revoke(grant.grantId)).toBe(true);

    for (const capabilityId of MORPHEUS_CAPABILITY_GROUPS['workspace.write']) {
      expect(evaluate(capabilityId).outcome, capabilityId).toBe('prompt');
    }
  });
});

describe('grouping never covers a destructive operation', () => {
  it('file.delete belongs to no group', () => {
    expect(getMorpheusActionDescriptor('file.delete').group).toBeUndefined();
    for (const members of Object.values(MORPHEUS_CAPABILITY_GROUPS)) {
      expect(members).not.toContain('file.delete');
    }
  });

  it('file.delete still confirms with every workspace grant in place', () => {
    store.createGrant(scopeFor('file.createText'), 'persistent');
    store.createGrant(scopeFor('file.list'), 'persistent');
    expect(evaluate('file.delete')).toEqual({ outcome: 'prompt', reason: 'mandatory-confirmation' });
  });

  it('file.delete is critical, so no profile waives it', () => {
    expect(getMorpheusActionDescriptor('file.delete').riskTier).toBe('critical');
    expect(requiresMandatoryConfirmation('critical')).toBe(true);
    for (const profile of ['strict', 'balanced', 'autonomous'] as const) {
      store.setProfile(profile);
      expect(evaluate('file.delete').outcome, profile).toBe('prompt');
    }
  });

  it('every group member is non-destructive by construction', () => {
    // A `critical` capability inside a group would be granted by a workspace
    // decision, which is exactly what the mandatory-confirmation floor forbids.
    for (const [group, members] of Object.entries(MORPHEUS_CAPABILITY_GROUPS)) {
      for (const capabilityId of members) {
        const tier = getMorpheusActionDescriptor(capabilityId).riskTier;
        expect(requiresMandatoryConfirmation(tier), `${group}/${capabilityId}`).toBe(false);
      }
    }
  });

  it('a grouped scope and an ungrouped scope never share a key', () => {
    expect(permissionScopeKey(scopeFor('file.delete')))
      .not.toBe(permissionScopeKey(scopeFor('file.createText')));
  });
});

describe('registry consistency', () => {
  it('every group member exists in the registry', () => {
    for (const members of Object.values(MORPHEUS_CAPABILITY_GROUPS)) {
      for (const capabilityId of members) {
        expect(MORPHEUS_ACTIONS[capabilityId], capabilityId).toBeDefined();
      }
    }
  });

  it('a capability declaring a group is listed in that group', () => {
    for (const action of Object.values(MORPHEUS_ACTIONS)) {
      if (!action.group) continue;
      expect(MORPHEUS_CAPABILITY_GROUPS[action.group], action.id).toContain(action.id);
    }
  });

  it('no capability appears in two groups', () => {
    const seen = new Set<string>();
    for (const members of Object.values(MORPHEUS_CAPABILITY_GROUPS)) {
      for (const capabilityId of members) {
        expect(seen.has(capabilityId), capabilityId).toBe(false);
        seen.add(capabilityId);
      }
    }
  });
});
