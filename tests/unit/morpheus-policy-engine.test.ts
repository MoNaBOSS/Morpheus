import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createMorpheusGrantStore, type MorpheusGrantStore } from '@electron/services/morpheus/policy/grant-store';
import { createMorpheusPolicyEngine } from '@electron/services/morpheus/policy/policy-engine';
import type { PermissionScope } from '@shared/morpheus/permission-types';
import {
  MORPHEUS_MANDATORY_CONFIRMATION_TIERS,
  requiresMandatoryConfirmation,
} from '@shared/morpheus/actions/registry';

const scratch = mkdtempSync(join(tmpdir(), 'morpheus-policy-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;
function freshStore(): MorpheusGrantStore {
  counter += 1;
  return createMorpheusGrantStore({ userDataDir: join(scratch, `case-${counter}`) });
}

const LOW: PermissionScope = {
  capabilityId: 'system.report',
  platform: 'win32',
  resourceScope: 'runtime',
  riskTier: 'low',
  originType: 'command-bar',
};

const MEDIUM_APP: PermissionScope = {
  capabilityId: 'app.launch',
  platform: 'win32',
  resourceScope: 'notepad',
  riskTier: 'medium',
  originType: 'command-bar',
};

const MEDIUM_FILE: PermissionScope = {
  capabilityId: 'file.createText',
  platform: 'win32',
  resourceScope: 'C:\\morpheus\\files',
  riskTier: 'medium',
  originType: 'command-bar',
};

let store: MorpheusGrantStore;
beforeEach(() => {
  store = freshStore();
});

function evaluate(scope: PermissionScope, auditHealth: 'healthy' | 'degraded' = 'healthy') {
  return createMorpheusPolicyEngine(store).evaluate({ scope, auditHealth });
}

describe('permission profiles', () => {
  it('Strict: privacy-safe reads run automatically', () => {
    store.setProfile('strict');
    expect(evaluate(LOW)).toEqual({ outcome: 'allow', reason: 'privacy-safe-auto' });
  });

  it('Strict: writes and launches ask every time, even with a grant', () => {
    store.setProfile('strict');
    store.createGrant(MEDIUM_APP, 'persistent');
    store.createGrant(MEDIUM_FILE, 'session');

    expect(evaluate(MEDIUM_APP).outcome).toBe('prompt');
    expect(evaluate(MEDIUM_FILE).outcome).toBe('prompt');
  });

  it('Autonomous is the fresh private-alpha default profile', () => {
    expect(store.getProfile()).toBe('autonomous');
  });

  it('Balanced: privacy-safe reads auto, medium asks the first time', () => {
    store.setProfile('balanced');
    expect(evaluate(LOW)).toEqual({ outcome: 'allow', reason: 'privacy-safe-auto' });
    expect(evaluate(MEDIUM_APP)).toEqual({ outcome: 'prompt', reason: 'prompt-required' });
  });

  it('Balanced: a matching grant executes without another prompt', () => {
    store.setProfile('balanced');
    const grant = store.createGrant(MEDIUM_APP, 'session');
    expect(evaluate(MEDIUM_APP)).toEqual({
      outcome: 'allow', reason: 'session-grant', grantId: grant.grantId,
    });
  });

  it('Autonomous: explicitly enumerated reversible work runs on first use', () => {
    store.setProfile('autonomous');
    expect(evaluate(LOW).outcome).toBe('allow');
    expect(evaluate(MEDIUM_APP)).toEqual({ outcome: 'allow', reason: 'profile-auto' });
    expect(evaluate(MEDIUM_FILE)).toEqual({ outcome: 'allow', reason: 'profile-auto' });
  });

  it('Autonomous still prompts for sensitive capabilities absent from the reviewed allow-list', () => {
    store.setProfile('autonomous');
    expect(evaluate({
      capabilityId: 'clipboard.readText', platform: 'win32', resourceScope: 'runtime',
      riskTier: 'high', originType: 'command-bar',
    })).toEqual({ outcome: 'prompt', reason: 'prompt-required' });
    expect(evaluate({
      capabilityId: 'screen.capture', platform: 'win32', resourceScope: 'C:\\morpheus\\files',
      riskTier: 'high', originType: 'command-bar',
    })).toEqual({ outcome: 'prompt', reason: 'prompt-required' });
  });

  it('rejects an unknown profile', () => {
    expect(() => store.setProfile('yolo' as never)).toThrow(/Unknown permission profile/);
  });
});

describe('mandatory confirmation floor', () => {
  const CRITICAL: PermissionScope = { ...MEDIUM_APP, riskTier: 'critical' };

  it('critical cannot be bypassed by a persistent grant under any profile', () => {
    for (const profile of ['strict', 'balanced', 'autonomous'] as const) {
      const local = freshStore();
      local.setProfile(profile);
      local.createGrant(CRITICAL, 'persistent');
      const engine = createMorpheusPolicyEngine(local);

      expect(engine.evaluate({ scope: CRITICAL, auditHealth: 'healthy' }))
        .toEqual({ outcome: 'prompt', reason: 'mandatory-confirmation' });
    }
  });

  it('is evaluated before grants so no grant can waive it', () => {
    store.setProfile('autonomous');
    store.createGrant(CRITICAL, 'session');
    expect(evaluate(CRITICAL).reason).toBe('mandatory-confirmation');
  });

  it('critical is the ONLY unwaivable tier', () => {
    // Guards the 0.5 narrowing in both directions: widening this list again
    // would reintroduce prompt fatigue, and emptying it would remove the floor.
    expect([...MORPHEUS_MANDATORY_CONFIRMATION_TIERS]).toEqual(['critical']);
    expect(requiresMandatoryConfirmation('critical')).toBe(true);
    for (const tier of ['low', 'medium', 'high'] as const) {
      expect(requiresMandatoryConfirmation(tier)).toBe(false);
    }
  });
});

describe('high risk is grantable, never silently automatic', () => {
  const HIGH: PermissionScope = { ...MEDIUM_APP, riskTier: 'high' };

  it('prompts the first time a scope is seen, under every profile', () => {
    for (const profile of ['strict', 'balanced', 'autonomous'] as const) {
      const local = freshStore();
      local.setProfile(profile);
      expect(createMorpheusPolicyEngine(local).evaluate({ scope: HIGH, auditHealth: 'healthy' }).outcome)
        .toBe('prompt');
    }
  });

  it('honours a grant afterwards, so it does not interrupt repeatedly', () => {
    for (const profile of ['balanced', 'autonomous'] as const) {
      const local = freshStore();
      local.setProfile(profile);
      local.createGrant(HIGH, 'persistent');
      expect(createMorpheusPolicyEngine(local).evaluate({ scope: HIGH, auditHealth: 'healthy' }))
        .toMatchObject({ outcome: 'allow', reason: 'persistent-grant' });
    }
  });

  it('Strict still ignores the grant and asks every time', () => {
    store.setProfile('strict');
    store.createGrant(HIGH, 'persistent');
    expect(evaluate(HIGH).outcome).toBe('prompt');
  });

  it('a grant for a different resource does not carry over', () => {
    store.setProfile('balanced');
    store.createGrant(HIGH, 'persistent');
    expect(evaluate({ ...HIGH, resourceScope: 'calculator' }).outcome).toBe('prompt');
  });

  it('never runs under a degraded audit', () => {
    store.createGrant(HIGH, 'persistent');
    expect(evaluate(HIGH, 'degraded')).toEqual({ outcome: 'deny', reason: 'audit-degraded' });
  });
});

describe('grant scope matching', () => {
  it('a different resource is a different scope and prompts again', () => {
    store.setProfile('balanced');
    store.createGrant(MEDIUM_APP, 'persistent');
    expect(evaluate({ ...MEDIUM_APP, resourceScope: 'calculator' }).outcome).toBe('prompt');
  });

  it('a different capability does not inherit trust', () => {
    store.setProfile('balanced');
    store.createGrant(MEDIUM_APP, 'persistent');
    expect(evaluate({ ...MEDIUM_FILE }).outcome).toBe('prompt');
  });

  it('a different platform does not inherit trust', () => {
    store.setProfile('balanced');
    store.createGrant(MEDIUM_APP, 'persistent');
    expect(evaluate({ ...MEDIUM_APP, platform: 'linux' }).outcome).toBe('prompt');
  });

  it('a different origin does not inherit trust', () => {
    store.setProfile('balanced');
    store.createGrant(MEDIUM_APP, 'persistent');
    expect(evaluate({ ...MEDIUM_APP, originType: 'schedule' }).outcome).toBe('prompt');
  });

  it('a different agent identity does not inherit trust', () => {
    store.setProfile('balanced');
    store.createGrant({ ...MEDIUM_APP, agentId: 'agent-a' }, 'persistent');
    expect(evaluate({ ...MEDIUM_APP, agentId: 'agent-b' }).outcome).toBe('prompt');
    expect(evaluate({ ...MEDIUM_APP, agentId: 'agent-a' }).outcome).toBe('allow');
  });

  it('a different risk tier does not inherit trust', () => {
    store.setProfile('balanced');
    store.createGrant(MEDIUM_APP, 'persistent');
    expect(evaluate({ ...MEDIUM_APP, riskTier: 'low' }).outcome).not.toBe('allow');
  });
});

describe('denials', () => {
  it('a persistent denial outranks a later allow for the same scope', () => {
    store.createGrant(MEDIUM_APP, 'denied-persistent');
    expect(evaluate(MEDIUM_APP)).toEqual({ outcome: 'deny', reason: 'persistent-denial' });

    // Even after granting, the denial for the identical scope replaces it and
    // the newest record wins — never a silent upgrade to allow.
    store.createGrant(MEDIUM_APP, 'denied-persistent');
    expect(evaluate(MEDIUM_APP).outcome).toBe('deny');
  });
});

describe('audit-degraded mode', () => {
  it('blocks write and launch actions when auditing is unhealthy', () => {
    store.createGrant(MEDIUM_APP, 'persistent');
    expect(evaluate(MEDIUM_APP, 'degraded')).toEqual({ outcome: 'deny', reason: 'audit-degraded' });
    expect(evaluate(MEDIUM_FILE, 'degraded')).toEqual({ outcome: 'deny', reason: 'audit-degraded' });
  });

  it('still permits explicitly safe read-only operations', () => {
    expect(evaluate(LOW, 'degraded')).toEqual({ outcome: 'allow', reason: 'privacy-safe-auto' });
  });

  it('outranks even a persistent grant', () => {
    store.setProfile('autonomous');
    store.createGrant(MEDIUM_APP, 'persistent');
    expect(evaluate(MEDIUM_APP, 'degraded').reason).toBe('audit-degraded');
  });
});
