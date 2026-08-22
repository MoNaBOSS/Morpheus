import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createMorpheusGrantStore, type MorpheusGrantStore } from '@electron/services/morpheus/policy/grant-store';
import { createMorpheusPolicyEngine } from '@electron/services/morpheus/policy/policy-engine';
import { captureFileName, MORPHEUS_CAPTURE_DIR } from '@electron/services/morpheus/capabilities/win32/screen-capture';
import {
  MORPHEUS_CAPABILITY_GROUPS,
  MORPHEUS_APPLICATIONS,
  getMorpheusActionDescriptor,
  listMorpheusApplicationKeys,
  type MorpheusActionId,
} from '@shared/morpheus/actions/registry';
import type { PermissionScope } from '@shared/morpheus/permission-types';

const scratch = mkdtempSync(join(tmpdir(), 'morpheus-device-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;
let store: MorpheusGrantStore;
beforeEach(() => {
  counter += 1;
  store = createMorpheusGrantStore({ userDataDir: join(scratch, `case-${counter}`) });
  store.setProfile('balanced');
});

function scopeFor(capabilityId: MorpheusActionId, resourceScope: string): PermissionScope {
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

function evaluate(capabilityId: MorpheusActionId, resourceScope: string) {
  return createMorpheusPolicyEngine(store).evaluate({
    scope: scopeFor(capabilityId, resourceScope),
    auditHealth: 'healthy',
  });
}

describe('clipboard read and write are separate trust', () => {
  it('neither belongs to a capability group', () => {
    // Grouping them would let one workspace-shaped decision cover both.
    expect(getMorpheusActionDescriptor('clipboard.readText').group).toBeUndefined();
    expect(getMorpheusActionDescriptor('clipboard.writeText').group).toBeUndefined();
    for (const members of Object.values(MORPHEUS_CAPABILITY_GROUPS)) {
      expect(members).not.toContain('clipboard.readText');
      expect(members).not.toContain('clipboard.writeText');
    }
  });

  it('granting WRITE does not grant READ', () => {
    // The clipboard routinely holds passwords the user copied for an unrelated
    // purpose. "May put text on my clipboard" must never imply "may read it".
    store.createGrant(scopeFor('clipboard.writeText', 'clipboard'), 'persistent');

    expect(evaluate('clipboard.writeText', 'clipboard').outcome).toBe('allow');
    expect(evaluate('clipboard.readText', 'clipboard').outcome).toBe('prompt');
  });

  it('granting READ does not grant WRITE', () => {
    store.createGrant(scopeFor('clipboard.readText', 'clipboard'), 'persistent');
    expect(evaluate('clipboard.readText', 'clipboard').outcome).toBe('allow');
    expect(evaluate('clipboard.writeText', 'clipboard').outcome).toBe('prompt');
  });

  it('both are grantable rather than permanently interrupting', () => {
    for (const capabilityId of ['clipboard.readText', 'clipboard.writeText'] as const) {
      const local = createMorpheusGrantStore({ userDataDir: join(scratch, `grantable-${capabilityId}`) });
      local.createGrant(scopeFor(capabilityId, 'clipboard'), 'session');
      expect(createMorpheusPolicyEngine(local).evaluate({
        scope: scopeFor(capabilityId, 'clipboard'),
        auditHealth: 'healthy',
      }).outcome, capabilityId).toBe('allow');
    }
  });

  it('clipboard read is high risk and asks before first use', () => {
    expect(getMorpheusActionDescriptor('clipboard.readText').riskTier).toBe('high');
    expect(evaluate('clipboard.readText', 'clipboard').outcome).toBe('prompt');
  });
});

describe('notifications run automatically outside Strict', () => {
  it('is low risk', () => {
    expect(getMorpheusActionDescriptor('system.notify').riskTier).toBe('low');
  });

  it('needs no grant under Balanced or Autonomous', () => {
    for (const profile of ['balanced', 'autonomous'] as const) {
      store.setProfile(profile);
      expect(evaluate('system.notify', 'notification'), profile)
        .toEqual({ outcome: 'allow', reason: 'profile-auto' });
    }
  });

  it('STILL asks under Strict', () => {
    // Strict's contract is that anything beyond a privacy-safe read confirms.
    store.setProfile('strict');
    expect(evaluate('system.notify', 'notification').outcome).toBe('prompt');
  });

  it('being low risk does not make anything else automatic', () => {
    store.setProfile('autonomous');
    expect(evaluate('clipboard.readText', 'clipboard').outcome).toBe('prompt');
    expect(evaluate('screen.capture', 'C:\\ws').outcome).toBe('prompt');
    expect(evaluate('file.delete', 'C:\\ws').outcome).toBe('prompt');
  });
});

describe('screen capture', () => {
  it('is high risk, grantable, and in no group', () => {
    const descriptor = getMorpheusActionDescriptor('screen.capture');
    expect(descriptor.riskTier).toBe('high');
    expect(descriptor.group).toBeUndefined();
    for (const members of Object.values(MORPHEUS_CAPABILITY_GROUPS)) {
      expect(members).not.toContain('screen.capture');
    }
  });

  it('asks the first time, then honours a session grant', () => {
    expect(evaluate('screen.capture', 'C:\\ws').outcome).toBe('prompt');
    store.createGrant(scopeFor('screen.capture', 'C:\\ws'), 'session');
    expect(evaluate('screen.capture', 'C:\\ws')).toMatchObject({ outcome: 'allow', reason: 'session-grant' });
  });

  it('honours a persistent grant across the same scope', () => {
    store.createGrant(scopeFor('screen.capture', 'C:\\ws'), 'persistent');
    expect(evaluate('screen.capture', 'C:\\ws')).toMatchObject({ outcome: 'allow', reason: 'persistent-grant' });
  });

  it('is NOT covered by workspace trust', () => {
    // Approving file work in a workspace must not authorise photographing the
    // screen, even though the capture lands in that same workspace.
    store.createGrant(scopeFor('file.createText', 'C:\\ws'), 'persistent');
    store.createGrant(scopeFor('file.list', 'C:\\ws'), 'persistent');
    expect(evaluate('screen.capture', 'C:\\ws').outcome).toBe('prompt');
  });

  it('never runs on an unseen scope even under Autonomous', () => {
    store.setProfile('autonomous');
    expect(evaluate('screen.capture', 'C:\\ws').outcome).toBe('prompt');
  });

  it('is blocked entirely when auditing is degraded', () => {
    // A capture that cannot be recorded must not happen.
    store.createGrant(scopeFor('screen.capture', 'C:\\ws'), 'persistent');
    expect(createMorpheusPolicyEngine(store).evaluate({
      scope: scopeFor('screen.capture', 'C:\\ws'),
      auditHealth: 'degraded',
    })).toEqual({ outcome: 'deny', reason: 'audit-degraded' });
  });

  it('writes into the approved workspace, in a captures subfolder', () => {
    expect(getMorpheusActionDescriptor('screen.capture').rootKey).toBe('morpheusFiles');
    expect(MORPHEUS_CAPTURE_DIR).toBe('captures');
  });

  it('names files from a timestamp, so no caller string reaches a path', () => {
    const name = captureFileName(new Date('2026-08-09T12:34:56.789Z'));
    expect(name).toBe('capture-2026-08-09T12-34-56-789Z.png');
    // No separators, no traversal, no colons that could open an alternate
    // data stream on Windows.
    expect(name).not.toMatch(/[/\\:]/);
  });

  it('takes no parameters at all', () => {
    // Nothing the renderer sends can influence what is captured or where it
    // lands.
    expect(getMorpheusActionDescriptor('screen.capture').params).toEqual([]);
  });
});

describe('approved applications', () => {
  it('every entry is a fixed System32 executable with NO arguments', () => {
    // An argument vector is the difference between "launch an approved
    // application" and "run an arbitrary command".
    for (const key of listMorpheusApplicationKeys()) {
      const entry = MORPHEUS_APPLICATIONS[key];
      expect(entry.args, key).toEqual([]);
      expect(entry.base, key).toBe('systemRoot');
      expect(entry.relativeDir, key).toBe('System32');
      expect(entry.fileName, key).toMatch(/^[A-Za-z0-9_-]+\.exe$/);
      expect(entry.fileName, key).not.toMatch(/[/\\]/);
    }
  });

  it('excludes shells and script hosts', () => {
    const banned = ['cmd.exe', 'powershell.exe', 'pwsh.exe', 'wscript.exe', 'cscript.exe', 'reg.exe'];
    for (const key of listMorpheusApplicationKeys()) {
      expect(banned, key).not.toContain(MORPHEUS_APPLICATIONS[key].fileName.toLowerCase());
    }
  });

  it('a grant for one application does not extend to another', () => {
    store.createGrant(scopeFor('app.launch', 'notepad'), 'persistent');
    expect(evaluate('app.launch', 'notepad').outcome).toBe('allow');
    expect(evaluate('app.launch', 'calculator').outcome).toBe('prompt');
    expect(evaluate('app.launch', 'paint').outcome).toBe('prompt');
  });

  it('app.launch is not in any capability group', () => {
    // Launching is per-application trust; a group would collapse distinct
    // applications onto one decision.
    expect(getMorpheusActionDescriptor('app.launch').group).toBeUndefined();
  });
});
