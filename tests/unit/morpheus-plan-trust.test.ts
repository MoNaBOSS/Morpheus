import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createMorpheusGrantStore, type MorpheusGrantStore } from '@electron/services/morpheus/policy/grant-store';
import { createMorpheusPolicyEngine } from '@electron/services/morpheus/policy/policy-engine';
import { evaluatePlanTrust, permittedDecisionsFor } from '@electron/services/morpheus/plan/trust';
import type { PermissionScope } from '@shared/morpheus/permission-types';

const scratch = mkdtempSync(join(tmpdir(), 'morpheus-trust-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;
function freshStore(): MorpheusGrantStore {
  counter += 1;
  return createMorpheusGrantStore({ userDataDir: join(scratch, `case-${counter}`) });
}

const FILES_ROOT = 'C:\\Users\\x\\AppData\\Roaming\\Morpheus\\files';

function fileScope(root = FILES_ROOT): PermissionScope {
  return {
    capabilityId: 'file.createText',
    platform: 'win32',
    resourceScope: root,
    riskTier: 'medium',
    originType: 'command-bar',
  };
}

const APP_SCOPE: PermissionScope = {
  capabilityId: 'app.launch',
  platform: 'win32',
  resourceScope: 'notepad',
  riskTier: 'medium',
  originType: 'command-bar',
};

const REPORT_SCOPE: PermissionScope = {
  capabilityId: 'system.report',
  platform: 'win32',
  resourceScope: 'runtime',
  riskTier: 'low',
  originType: 'command-bar',
};

let store: MorpheusGrantStore;
beforeEach(() => {
  store = freshStore();
});

function assess(
  entries: Array<[string, PermissionScope]>,
  auditHealth: 'healthy' | 'degraded' = 'healthy',
) {
  return evaluatePlanTrust({
    scopesByStep: new Map(entries),
    order: entries.map(([stepId]) => stepId),
    policy: createMorpheusPolicyEngine(store),
    auditHealth,
  });
}

describe('deduplication — the reason Balanced feels convenient', () => {
  it('five writes into the same folder ask ONCE, not five times', () => {
    const result = assess([
      ['s1', fileScope()], ['s2', fileScope()], ['s3', fileScope()],
      ['s4', fileScope()], ['s5', fileScope()],
    ]);

    expect(result.outcome).toBe('needs-consent');
    expect(result.consentRequired).toHaveLength(1);
    expect(result.consentRequired[0].stepIds).toEqual(['s1', 's2', 's3', 's4', 's5']);
  });

  it('does NOT merge different resources — a second folder is a second boundary', () => {
    const result = assess([
      ['s1', fileScope()],
      ['s2', fileScope('C:\\Users\\x\\Documents\\Other')],
    ]);
    expect(result.consentRequired).toHaveLength(2);
  });

  it('does NOT merge different capabilities on the same resource', () => {
    const result = assess([
      ['s1', { ...APP_SCOPE, resourceScope: 'shared' }],
      ['s2', { ...fileScope(), resourceScope: 'shared' }],
    ]);
    expect(result.consentRequired).toHaveLength(2);
  });

  it('does NOT merge across origins — a scheduled job is not a typed command', () => {
    const result = assess([
      ['s1', fileScope()],
      ['s2', { ...fileScope(), originType: 'schedule' }],
    ]);
    expect(result.consentRequired).toHaveLength(2);
  });

  it('presents boundaries in execution order', () => {
    const result = assess([
      ['s1', APP_SCOPE],
      ['s2', fileScope()],
      ['s3', APP_SCOPE],
    ]);
    expect(result.consentRequired.map((boundary) => boundary.scope.capabilityId))
      .toEqual(['app.launch', 'file.createText']);
    expect(result.consentRequired[0].stepIds).toEqual(['s1', 's3']);
  });
});

describe('a plan inside existing trust runs with zero interruption', () => {
  it('is ready when every scope is already granted', () => {
    store.createGrant(fileScope(), 'persistent');
    store.createGrant(APP_SCOPE, 'persistent');

    const result = assess([['s1', fileScope()], ['s2', APP_SCOPE], ['s3', REPORT_SCOPE]]);
    expect(result.outcome).toBe('ready');
    expect(result.consentRequired).toEqual([]);
    expect(result.autoAllowed).toEqual(['s1', 's2', 's3']);
  });

  it('privacy-safe reads never contribute a boundary', () => {
    const result = assess([['s1', REPORT_SCOPE], ['s2', REPORT_SCOPE]]);
    expect(result.outcome).toBe('ready');
    expect(result.autoAllowed).toEqual(['s1', 's2']);
  });

  it('asks only for the genuinely new boundary in a mixed plan', () => {
    store.createGrant(APP_SCOPE, 'persistent');

    const result = assess([['s1', REPORT_SCOPE], ['s2', APP_SCOPE], ['s3', fileScope()]]);
    expect(result.outcome).toBe('needs-consent');
    expect(result.autoAllowed).toEqual(['s1', 's2']);
    expect(result.consentRequired).toHaveLength(1);
    expect(result.consentRequired[0].scope.capabilityId).toBe('file.createText');
  });
});

describe('the floor is not weakened by batching', () => {
  it('a denial rejects the whole plan rather than running the rest', () => {
    // Partial execution of a plan approved as a unit would leave the machine in
    // a state nobody asked for.
    store.createGrant(fileScope(), 'denied-persistent');

    const result = assess([['s1', REPORT_SCOPE], ['s2', fileScope()], ['s3', APP_SCOPE]]);
    expect(result.outcome).toBe('rejected');
    expect(result.denied).toEqual([
      { stepId: 's2', scope: fileScope(), reason: 'persistent-denial' },
    ]);
  });

  it('a degraded audit rejects every non-read step', () => {
    store.createGrant(fileScope(), 'persistent');
    const result = assess([['s1', REPORT_SCOPE], ['s2', fileScope()]], 'degraded');
    expect(result.outcome).toBe('rejected');
    expect(result.denied.map((entry) => entry.reason)).toEqual(['audit-degraded']);
  });

  it('critical still confirms even batched with already-trusted work', () => {
    store.createGrant(APP_SCOPE, 'persistent');
    const critical: PermissionScope = { ...APP_SCOPE, resourceScope: 'wallet', riskTier: 'critical' };

    const result = assess([['s1', APP_SCOPE], ['s2', critical]]);
    expect(result.outcome).toBe('needs-consent');
    expect(result.consentRequired).toHaveLength(1);
    expect(result.consentRequired[0].mandatoryConfirmation).toBe(true);
  });

  it('a granted critical scope STILL confirms — batching cannot launder a grant', () => {
    const critical: PermissionScope = { ...APP_SCOPE, riskTier: 'critical' };
    store.createGrant(critical, 'persistent');

    const result = assess([['s1', critical]]);
    expect(result.outcome).toBe('needs-consent');
    expect(result.consentRequired[0].mandatoryConfirmation).toBe(true);
  });

  it('a step with no resolved scope is denied, never executed', () => {
    const result = evaluatePlanTrust({
      scopesByStep: new Map([['s1', APP_SCOPE]]),
      order: ['s1', 's2-unresolved'],
      policy: createMorpheusPolicyEngine(store),
      auditHealth: 'healthy',
    });
    expect(result.outcome).toBe('rejected');
    expect(result.denied.map((entry) => entry.reason)).toEqual(['unresolved-scope']);
  });

  it('Strict asks for every write even when granted', () => {
    store.setProfile('strict');
    store.createGrant(fileScope(), 'persistent');
    expect(assess([['s1', fileScope()]]).outcome).toBe('needs-consent');
  });
});

describe('permittedDecisionsFor', () => {
  it('offers remembering for an ordinary boundary', () => {
    const decisions = permittedDecisionsFor({
      boundaryId: 'b', scope: fileScope(), stepIds: ['s1'], mandatoryConfirmation: false,
    });
    expect(decisions).toContain('allow-session');
    expect(decisions).toContain('allow-always');
  });

  it('refuses to remember a mandatory-confirmation boundary', () => {
    // Recording trust here would let the NEXT occurrence run without asking,
    // which is exactly what `critical` forbids.
    const decisions = permittedDecisionsFor({
      boundaryId: 'b',
      scope: { ...fileScope(), riskTier: 'critical' },
      stepIds: ['s1'],
      mandatoryConfirmation: true,
    });
    expect(decisions).toEqual(['deny', 'deny-always', 'allow-once']);
  });
});
