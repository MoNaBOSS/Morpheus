import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMorpheusRuntime,
  type MorpheusPlanConsentRequest,
  type MorpheusRuntime,
} from '@electron/services/morpheus/runtime';
import { createMorpheusCapabilityRegistry } from '@electron/services/morpheus/capability-registry';
import { createMorpheusGrantStore, type MorpheusGrantStore } from '@electron/services/morpheus/policy/grant-store';
import { createMorpheusPolicyEngine } from '@electron/services/morpheus/policy/policy-engine';
import { createPolicyPermissionGate } from '@electron/services/morpheus/policy/permission-gate';
import type { MorpheusAuditSink } from '@electron/services/morpheus/audit';
import type { MorpheusRootProvider } from '@electron/services/morpheus/roots';
import type { MorpheusActionEvent, MorpheusAuditEntry } from '@shared/morpheus/action-types';
import type { ExecutionPlan, ExecutionStep } from '@shared/morpheus/execution-types';
import type { PermissionScope } from '@shared/morpheus/permission-types';
import { getMorpheusActionDescriptor } from '@shared/morpheus/actions/registry';

const scratch = mkdtempSync(join(tmpdir(), 'morpheus-rt-plan-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const FILES_ROOT = 'C:\\Morpheus\\files';

/** Executions actually performed, in order. The only trustworthy assertion. */
let executed: string[] = [];

function registryWithFakeCapability(fail = new Set<string>()) {
  const registry = createMorpheusCapabilityRegistry();
  registry.register({
    actionId: 'file.createText',
    platform: 'win32',
    async resolve(params) {
      const fileName = String((params as { fileName: string }).fileName);
      return {
        target: { kind: 'file', path: `${FILES_ROOT}\\${fileName}`, bytes: 1, workspaceRoot: FILES_ROOT },
        execute: async () => {
          executed.push(fileName);
          if (fail.has(fileName)) throw new Error(`boom: ${fileName}`);
          return { kind: 'file', path: `${FILES_ROOT}\\${fileName}`, bytes: 1 };
        },
      };
    },
  });
  return registry;
}

let counter = 0;
let store: MorpheusGrantStore;
let events: MorpheusActionEvent[] = [];
let audited: MorpheusAuditEntry[] = [];
let consentRequests: MorpheusPlanConsentRequest[] = [];

function makeRuntime(options: {
  fail?: Set<string>;
  autoDecide?: (request: MorpheusPlanConsentRequest, runtime: () => MorpheusRuntime) => void;
} = {}): MorpheusRuntime {
  counter += 1;
  store = createMorpheusGrantStore({ userDataDir: join(scratch, `case-${counter}`) });
  const engine = createMorpheusPolicyEngine(store);

  const audit: MorpheusAuditSink = {
    record: async (entry) => { audited.push(entry); },
    recordControl: async () => undefined,
    recent: async () => ({ entries: [], truncated: false }),
    health: () => 'healthy',
    dispose: () => undefined,
  } as unknown as MorpheusAuditSink;

  const roots: MorpheusRootProvider = { resolve: () => FILES_ROOT } as unknown as MorpheusRootProvider;

  let created: MorpheusRuntime;
  created = createMorpheusRuntime({
    registry: registryWithFakeCapability(options.fail),
    roots,
    audit,
    gate: createPolicyPermissionGate(engine, store),
    grants: store,
    appVersion: '0.5.0',
    platform: 'win32',
    emit: (event) => { events.push(event); },
    emitPlanConsent: (request) => {
      consentRequests.push(request);
      options.autoDecide?.(request, () => created);
    },
    permissionTimeoutMs: 50,
  });
  return created;
}

function step(stepId: string, dependsOn: string[] = []): ExecutionStep {
  return {
    stepId,
    capabilityId: 'file.createText',
    params: { fileName: `${stepId}.txt`, content: 'x' },
    summaryKey: 'test',
    dependsOn,
    permission: {
      capabilityId: 'file.createText',
      platform: 'win32',
      riskTier: 'medium',
      resourceScope: FILES_ROOT,
      mandatoryConfirmation: false,
    },
  };
}

function plan(steps: ExecutionStep[], planId = 'plan-1'): ExecutionPlan {
  return {
    v: 1,
    planId,
    createdAt: '2026-08-09T00:00:00.000Z',
    origin: { type: 'command-bar', commandText: 'test' },
    objective: 'test objective',
    status: 'draft',
    steps,
    plannedBy: 'deterministic',
  };
}

/**
 * Trust as the runtime derives it.
 *
 * `file.createText` is a grouped capability, so its grant binds to the
 * workspace group rather than the single verb — one decision covers the whole
 * enumerated bundle for this exact root.
 */
const GRANT_SCOPE: PermissionScope = {
  capabilityId: 'file.createText',
  capabilityGroup: getMorpheusActionDescriptor('file.createText').group,
  platform: 'win32',
  resourceScope: FILES_ROOT,
  riskTier: 'medium',
  originType: 'command-bar',
};

beforeEach(() => {
  executed = [];
  events = [];
  audited = [];
  consentRequests = [];
});

describe('runtime plan execution', () => {
  it('keeps plans sequential across independent entry points', async () => {
    const runtime = makeRuntime();
    runtime.registerPlan(plan([step('first')], 'plan-first'));
    runtime.registerPlan(plan([step('second')], 'plan-second'));

    const firstExecution = runtime.executePlan({ planId: 'plan-first' });
    await vi.waitFor(() => expect(consentRequests).toHaveLength(1));

    const second = await runtime.executePlan({ planId: 'plan-second' });
    expect(second.status).toBe('rejected');
    expect(second.rejection?.code).toBe('rate-limited');

    await runtime.respondPlanPermission({
      planId: 'plan-first',
      decisions: Object.fromEntries(consentRequests[0].boundaries.map((boundary) => [boundary.boundaryId, 'deny'])),
    });
    await firstExecution;
    expect(executed).toEqual([]);
    runtime.dispose();
  });

  it('executes a multi-step plan in dependency order', async () => {
    const runtime = makeRuntime();
    store.createGrant(GRANT_SCOPE, 'persistent');
    runtime.registerPlan(plan([step('c', ['b']), step('b', ['a']), step('a')]));

    const result = await runtime.executePlan({ planId: 'plan-1' });

    expect(result.rejection).toBeUndefined();
    expect(result.status).toBe('completed');
    expect(executed).toEqual(['a.txt', 'b.txt', 'c.txt']);
    expect(result.steps.every((entry) => entry.artifact?.kind === 'file')).toBe(true);
    expect(consentRequests).toEqual([]);
    runtime.dispose();
  });

  it('asks ONCE for a plan whose steps share a boundary, then executes all of them', async () => {
    const runtime = makeRuntime({
      autoDecide: (request, getRuntime) => {
        void getRuntime().respondPlanPermission({
          planId: request.planId,
          decisions: Object.fromEntries(request.boundaries.map((b) => [b.boundaryId, 'allow-once'])),
        });
      },
    });
    runtime.registerPlan(plan([step('a'), step('b'), step('c')]));

    const result = await runtime.executePlan({ planId: 'plan-1' });

    expect(consentRequests).toHaveLength(1);
    expect(consentRequests[0].boundaries).toHaveLength(1);
    expect(consentRequests[0].objective).toBe('test objective');
    expect(result.status).toBe('completed');
    expect(executed).toEqual(['a.txt', 'b.txt', 'c.txt']);
    runtime.dispose();
  });

  it('remembers allow-always so the NEXT plan runs with no prompt', async () => {
    const runtime = makeRuntime({
      autoDecide: (request, getRuntime) => {
        void getRuntime().respondPlanPermission({
          planId: request.planId,
          decisions: Object.fromEntries(request.boundaries.map((b) => [b.boundaryId, 'allow-always'])),
        });
      },
    });

    runtime.registerPlan(plan([step('a')], 'plan-1'));
    await runtime.executePlan({ planId: 'plan-1' });
    expect(consentRequests).toHaveLength(1);

    runtime.registerPlan(plan([step('b')], 'plan-2'));
    const second = await runtime.executePlan({ planId: 'plan-2' });

    expect(consentRequests).toHaveLength(1);
    expect(second.status).toBe('completed');
    expect(executed).toEqual(['a.txt', 'b.txt']);
    runtime.dispose();
  });

  it('executes nothing when consent is refused', async () => {
    const runtime = makeRuntime({
      autoDecide: (request, getRuntime) => {
        void getRuntime().respondPlanPermission({
          planId: request.planId,
          decisions: Object.fromEntries(request.boundaries.map((b) => [b.boundaryId, 'deny'])),
        });
      },
    });
    runtime.registerPlan(plan([step('a'), step('b')]));

    const result = await runtime.executePlan({ planId: 'plan-1' });

    expect(executed).toEqual([]);
    expect(result.status).toBe('rejected');
    runtime.dispose();
  });

  it('executes nothing when consent times out', async () => {
    // An unanswered prompt must never become silent authority.
    const runtime = makeRuntime();
    runtime.registerPlan(plan([step('a')]));

    const result = await runtime.executePlan({ planId: 'plan-1' });

    expect(executed).toEqual([]);
    expect(result.status).toBe('rejected');
    runtime.dispose();
  });

  it('cancels an active plan immediately while it is awaiting consent', async () => {
    const runtime = makeRuntime();
    runtime.registerPlan(plan([step('a'), step('b')]));

    const execution = runtime.executePlan({ planId: 'plan-1' });
    await vi.waitFor(() => expect(consentRequests).toHaveLength(1));
    expect(await runtime.cancelPlan({ planId: 'plan-1' })).toEqual({ accepted: true });

    const result = await execution;
    expect(result.status).toBe('cancelled');
    expect(result.steps.every((entry) => entry.status === 'cancelled')).toBe(true);
    expect(executed).toEqual([]);
    expect(await runtime.cancelPlan({ planId: 'plan-1' })).toEqual({ accepted: false });
    runtime.dispose();
  });

  it('skips dependents of a failed step but keeps an independent branch', async () => {
    const runtime = makeRuntime({ fail: new Set(['left.txt']) });
    store.createGrant(GRANT_SCOPE, 'persistent');
    runtime.registerPlan(plan([
      step('left'), step('leftChild', ['left']), step('right'), step('rightChild', ['right']),
    ]));

    const result = await runtime.executePlan({ planId: 'plan-1' });

    expect(executed).toEqual(['left.txt', 'right.txt', 'rightChild.txt']);
    expect(result.status).toBe('partially-completed');
    const byId = Object.fromEntries(result.steps.map((entry) => [entry.stepId, entry.status]));
    expect(byId.leftChild).toBe('skipped');
    runtime.dispose();
  });

  it('refuses a plan id it never issued', async () => {
    const runtime = makeRuntime();
    const result = await runtime.executePlan({ planId: 'forged-by-renderer' });

    expect(result.status).toBe('rejected');
    expect(result.rejection?.message).toMatch(/Unknown or expired plan/);
    expect(executed).toEqual([]);
    runtime.dispose();
  });

  it('refuses to execute the same plan twice', async () => {
    const runtime = makeRuntime();
    store.createGrant(GRANT_SCOPE, 'persistent');
    runtime.registerPlan(plan([step('a')]));

    expect((await runtime.executePlan({ planId: 'plan-1' })).status).toBe('completed');
    expect((await runtime.executePlan({ planId: 'plan-1' })).status).toBe('rejected');
    expect(executed).toEqual(['a.txt']);
    runtime.dispose();
  });

  it('audits every step of a plan, before the events reach the renderer', async () => {
    const runtime = makeRuntime();
    store.createGrant(GRANT_SCOPE, 'persistent');
    runtime.registerPlan(plan([step('a'), step('b')]));

    await runtime.executePlan({ planId: 'plan-1' });

    const phases = audited.filter((entry) => entry.actionId === 'file.createText').map((entry) => entry.phase);
    expect(phases).toEqual(['requested', 'running', 'succeeded', 'requested', 'running', 'succeeded']);
    // Same count and same order on the event side: nothing was emitted unrecorded.
    expect(events.map((event) => event.phase)).toEqual(phases);
    runtime.dispose();
  });

  it('never persists file content in the audit', async () => {
    const runtime = makeRuntime();
    store.createGrant(GRANT_SCOPE, 'persistent');
    const secret = plan([{ ...step('a'), params: { fileName: 'a.txt', content: 'TOP-SECRET' } }]);
    runtime.registerPlan(secret);

    await runtime.executePlan({ planId: 'plan-1' });

    expect(JSON.stringify(audited)).not.toContain('TOP-SECRET');
    runtime.dispose();
  });

  it('ignores a response for a plan that is not awaiting consent', async () => {
    const runtime = makeRuntime();
    expect(await runtime.respondPlanPermission({ planId: 'nope', decisions: {} }))
      .toEqual({ accepted: false });
    runtime.dispose();
  });

  it('ignores a repeated response, so a race cannot re-decide', async () => {
    const seen: boolean[] = [];
    const runtime = makeRuntime({
      autoDecide: (request, getRuntime) => {
        const decisions = Object.fromEntries(request.boundaries.map((b) => [b.boundaryId, 'allow-once']));
        void getRuntime().respondPlanPermission({ planId: request.planId, decisions })
          .then((first) => seen.push(first.accepted));
        void getRuntime().respondPlanPermission({ planId: request.planId, decisions })
          .then((second) => seen.push(second.accepted));
      },
    });
    runtime.registerPlan(plan([step('a')]));

    await runtime.executePlan({ planId: 'plan-1' });

    expect(seen).toEqual([true, false]);
    expect(executed).toEqual(['a.txt']);
    runtime.dispose();
  });

  it('does not execute a plan when the audit is degraded', async () => {
    counter += 1;
    store = createMorpheusGrantStore({ userDataDir: join(scratch, `degraded-${counter}`) });
    store.createGrant(GRANT_SCOPE, 'persistent');
    const engine = createMorpheusPolicyEngine(store);
    const emitPlanConsent = vi.fn();

    const runtime = createMorpheusRuntime({
      registry: registryWithFakeCapability(),
      roots: { resolve: () => FILES_ROOT } as unknown as MorpheusRootProvider,
      audit: {
        record: async (entry: MorpheusAuditEntry) => { audited.push(entry); },
        recordControl: async () => undefined,
        recent: async () => ({ entries: [], truncated: false }),
      } as unknown as MorpheusAuditSink,
      gate: createPolicyPermissionGate(engine, store),
      grants: store,
      auditHealth: () => 'degraded',
      appVersion: '0.5.0',
      platform: 'win32',
      emit: (event) => { events.push(event); },
      emitPlanConsent,
      permissionTimeoutMs: 50,
    });

    runtime.registerPlan(plan([step('a')]));
    const result = await runtime.executePlan({ planId: 'plan-1' });

    expect(result.status).toBe('rejected');
    expect(executed).toEqual([]);
    expect(emitPlanConsent).not.toHaveBeenCalled();
    runtime.dispose();
  });
});

describe('audit evidence for refusals', () => {
  it('records a denied phase when consent is refused', async () => {
    // A refusal is exactly what an audit trail exists for. Under the plan path
    // a refused step never reaches execution, so without an explicit record it
    // would leave no evidence at all.
    const runtime = makeRuntime({
      autoDecide: (request, getRuntime) => {
        void getRuntime().respondPlanPermission({
          planId: request.planId,
          decisions: Object.fromEntries(request.boundaries.map((b) => [b.boundaryId, 'deny'])),
        });
      },
    });
    runtime.registerPlan(plan([step('a'), step('b')]));

    await runtime.executePlan({ planId: 'plan-1' });

    const denied = audited.filter((entry) => entry.phase === 'denied');
    expect(denied).toHaveLength(2);
    expect(denied[0].decision).toBe('denied');
    expect(events.filter((event) => event.phase === 'denied')).toHaveLength(2);
    expect(executed).toEqual([]);
    runtime.dispose();
  });

  it('records a denied phase when policy refuses before any prompt', async () => {
    const runtime = makeRuntime();
    store.createGrant(GRANT_SCOPE, 'denied-persistent');
    runtime.registerPlan(plan([step('a')]));

    await runtime.executePlan({ planId: 'plan-1' });

    expect(audited.filter((entry) => entry.phase === 'denied')).toHaveLength(1);
    expect(consentRequests).toEqual([]);
    runtime.dispose();
  });
});

describe('the consent request is recorded but is not a run', () => {
  it('audits awaiting-permission without emitting a phantom run event', async () => {
    // Emitting these as run events would fabricate pending runs in the
    // interface and open the per-run dialog on top of the plan's own.
    const runtime = makeRuntime({
      autoDecide: (request, getRuntime) => {
        void getRuntime().respondPlanPermission({
          planId: request.planId,
          decisions: Object.fromEntries(request.boundaries.map((b) => [b.boundaryId, 'allow-once'])),
        });
      },
    });
    runtime.registerPlan(plan([step('a'), step('b')]));

    await runtime.executePlan({ planId: 'plan-1' });

    expect(audited.filter((entry) => entry.phase === 'awaiting-permission')).toHaveLength(2);
    expect(events.filter((event) => event.phase === 'awaiting-permission')).toHaveLength(0);
    expect(executed).toEqual(['a.txt', 'b.txt']);
    runtime.dispose();
  });
});
