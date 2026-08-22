import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createMorpheusGrantStore, type MorpheusGrantStore } from '@electron/services/morpheus/policy/grant-store';
import { createMorpheusPolicyEngine } from '@electron/services/morpheus/policy/policy-engine';
import {
  executePlan,
  type PlanStepRunner,
  type PrepareResult,
  type RunResult,
} from '@electron/services/morpheus/plan/executor';
import type { TrustBoundary } from '@electron/services/morpheus/plan/trust';
import type { ExecutionPlan, ExecutionStep } from '@shared/morpheus/execution-types';
import type { PermissionDecisionKind, PermissionScope } from '@shared/morpheus/permission-types';

const scratch = mkdtempSync(join(tmpdir(), 'morpheus-exec-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;
function freshStore(): MorpheusGrantStore {
  counter += 1;
  const value = createMorpheusGrantStore({ userDataDir: join(scratch, `case-${counter}`) });
  value.setProfile('balanced');
  return value;
}

const FILES_ROOT = 'C:\\Morpheus\\files';

function writeScope(root = FILES_ROOT): PermissionScope {
  return {
    capabilityId: 'file.createText',
    platform: 'win32',
    resourceScope: root,
    riskTier: 'medium',
    originType: 'command-bar',
  };
}

const READ_SCOPE: PermissionScope = {
  capabilityId: 'system.report',
  platform: 'win32',
  resourceScope: 'runtime',
  riskTier: 'low',
  originType: 'command-bar',
};

function step(stepId: string, dependsOn: string[] = [], write = true): ExecutionStep {
  const scope = write ? writeScope() : READ_SCOPE;
  return {
    stepId,
    capabilityId: scope.capabilityId,
    params: write ? { fileName: `${stepId}.txt`, content: 'x' } : {},
    summaryKey: 'test',
    dependsOn,
    permission: {
      capabilityId: scope.capabilityId,
      platform: 'win32',
      riskTier: scope.riskTier,
      resourceScope: scope.resourceScope,
      mandatoryConfirmation: false,
    },
  };
}

function plan(steps: ExecutionStep[]): ExecutionPlan {
  return {
    v: 1,
    planId: 'plan-1',
    createdAt: '2026-08-09T00:00:00.000Z',
    origin: { type: 'command-bar', commandText: 'test' },
    objective: 'test',
    status: 'draft',
    steps,
    plannedBy: 'deterministic',
  };
}

/**
 * Records what actually ran, which is the only thing worth asserting on.
 *
 * Recording is intrinsic rather than part of an override, so a test that
 * customises an outcome cannot silently stop recording and turn "nothing ran"
 * into a passing assertion.
 */
function makeRunner(options: {
  outcome?: (step: ExecutionStep) => RunResult;
  prepare?: (step: ExecutionStep) => PrepareResult;
} = {}) {
  const ran: string[] = [];
  const prepared: string[] = [];
  const skipped: string[] = [];
  const runner: PlanStepRunner = {
    async prepare(current): Promise<PrepareResult> {
      prepared.push(current.stepId);
      if (options.prepare) return options.prepare(current);
      const scope = current.capabilityId === 'system.report' ? READ_SCOPE : writeScope();
      return { ok: true, prepared: { stepId: current.stepId, scope, handle: null } };
    },
    async run(current): Promise<RunResult> {
      ran.push(current.stepId);
      return options.outcome?.(current) ?? { status: 'succeeded', durationMs: 1 };
    },
    async skip(current) {
      skipped.push(current.stepId);
    },
  };
  return { runner, ran, prepared, skipped };
}

const denyAll = vi.fn(async () => new Map<string, PermissionDecisionKind>());

let store: MorpheusGrantStore;
beforeEach(() => {
  store = freshStore();
  denyAll.mockClear();
});

function run(
  steps: ExecutionStep[],
  options: {
    runner?: ReturnType<typeof makeRunner>;
    consent?: (b: readonly TrustBoundary[]) => Promise<ReadonlyMap<string, PermissionDecisionKind>>;
    auditHealth?: 'healthy' | 'degraded';
    persistDecision?: (scope: PermissionScope, decision: PermissionDecisionKind) => void;
    signal?: { aborted: boolean };
  } = {},
) {
  const harness = options.runner ?? makeRunner();
  return executePlan({
    plan: plan(steps),
    runner: harness.runner,
    policy: createMorpheusPolicyEngine(store),
    auditHealth: options.auditHealth ?? 'healthy',
    requestConsent: options.consent ?? denyAll,
    persistDecision: options.persistDecision,
    signal: options.signal,
  }).then((result) => ({ result, harness }));
}

const allowAll = async (boundaries: readonly TrustBoundary[]) =>
  new Map(boundaries.map((boundary) => [boundary.boundaryId, 'allow-once' as PermissionDecisionKind]));

describe('dependency ordering', () => {
  it('runs steps in dependency order, not declaration order', async () => {
    store.createGrant(writeScope(), 'persistent');
    const { harness } = await run([step('c', ['b']), step('b', ['a']), step('a')]);
    expect(harness.ran).toEqual(['a', 'b', 'c']);
  });

  it('rejects a cyclic plan without running anything', async () => {
    const { result, harness } = await run([step('a', ['b']), step('b', ['a'])]);
    expect(result.status).toBe('rejected');
    expect(result.rejection?.code).toBe('invalid-plan');
    expect(harness.ran).toEqual([]);
    expect(harness.prepared).toEqual([]);
  });

  it('rejects a plan depending on a step that does not exist', async () => {
    const { result, harness } = await run([step('a', ['ghost'])]);
    expect(result.status).toBe('rejected');
    expect(result.rejection?.message).toMatch(/unknown "ghost"/);
    expect(harness.ran).toEqual([]);
  });
});

describe('failure isolation', () => {
  it('marks transitive dependents SKIPPED, not failed — they never ran', async () => {
    store.createGrant(writeScope(), 'persistent');
    const harness = makeRunner({
      outcome: (current) => (current.stepId === 'b'
        ? { status: 'failed', error: { code: 'io', message: 'disk full' }, durationMs: 1 }
        : { status: 'succeeded', durationMs: 1 }),
    });
    const { result } = await run(
      [step('a'), step('b', ['a']), step('c', ['b']), step('d', ['c'])],
      { runner: harness },
    );

    const byId = Object.fromEntries(result.steps.map((entry) => [entry.stepId, entry]));
    expect(byId.a.status).toBe('succeeded');
    expect(byId.b.status).toBe('failed');
    expect(byId.c.status).toBe('skipped');
    expect(byId.c.skippedBecauseOf).toBe('b');
    expect(byId.d.status).toBe('skipped');
    expect(harness.ran).toEqual(['a', 'b']);
  });

  it('lets an independent branch continue past a failure', async () => {
    store.createGrant(writeScope(), 'persistent');
    const harness = makeRunner({
      outcome: (current) => (current.stepId === 'left'
        ? { status: 'failed', error: { code: 'io', message: 'x' }, durationMs: 1 }
        : { status: 'succeeded', durationMs: 1 }),
    });
    const { result } = await run(
      [step('left'), step('leftChild', ['left']), step('right'), step('rightChild', ['right'])],
      { runner: harness },
    );

    expect(harness.ran).toEqual(['left', 'right', 'rightChild']);
    expect(result.status).toBe('partially-completed');
  });

  it('reports failed when nothing succeeded', async () => {
    store.createGrant(writeScope(), 'persistent');
    const harness = makeRunner({
      outcome: () => ({ status: 'failed', error: { code: 'io', message: 'x' }, durationMs: 1 }),
    });
    const { result } = await run([step('a'), step('b')], { runner: harness });
    expect(result.status).toBe('failed');
  });

  it('reports completed when everything succeeded', async () => {
    store.createGrant(writeScope(), 'persistent');
    const { result } = await run([step('a'), step('b', ['a'])]);
    expect(result.status).toBe('completed');
  });
});

describe('consent is requested ONCE for the whole plan', () => {
  it('asks a single time for five steps sharing one boundary', async () => {
    const consent = vi.fn(allowAll);
    const { result, harness } = await run(
      ['a', 'b', 'c', 'd', 'e'].map((id) => step(id)),
      { consent },
    );

    expect(consent).toHaveBeenCalledTimes(1);
    expect(consent.mock.calls[0][0]).toHaveLength(1);
    expect(harness.ran).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(result.status).toBe('completed');
  });

  it('never asks at all when the plan is inside existing trust', async () => {
    store.createGrant(writeScope(), 'persistent');
    const consent = vi.fn(allowAll);
    const { result, harness } = await run([step('a'), step('b'), step('c', [], false)], { consent });

    expect(consent).not.toHaveBeenCalled();
    expect(harness.ran).toEqual(['a', 'b', 'c']);
    expect(result.status).toBe('completed');
  });

  it('prepares every step BEFORE asking, so the user sees the whole plan', async () => {
    const order: string[] = [];
    const harness = makeRunner({
      prepare: (current) => {
        order.push(`prepare:${current.stepId}`);
        return { ok: true, prepared: { stepId: current.stepId, scope: writeScope(), handle: null } };
      },
    });
    await run([step('a'), step('b')], {
      runner: harness,
      consent: async (boundaries) => {
        order.push('ask');
        return allowAll(boundaries);
      },
    });

    expect(order).toEqual(['prepare:a', 'prepare:b', 'ask']);
  });
});

describe('refusal stops the plan', () => {
  it('runs nothing when consent is refused', async () => {
    const { result, harness } = await run([step('a'), step('b')], {
      consent: async (boundaries) => new Map(boundaries.map((b) => [b.boundaryId, 'deny' as PermissionDecisionKind])),
    });

    expect(harness.ran).toEqual([]);
    expect(result.status).toBe('rejected');
  });

  it('treats an unanswered boundary as a refusal, never as authority', async () => {
    const { result, harness } = await run([step('a')], {
      consent: async () => new Map(),
    });
    expect(harness.ran).toEqual([]);
    expect(result.status).toBe('rejected');
    expect(result.steps[0].error?.message).toBe('no-response');
  });

  it('refusing one boundary cancels the plan approved as a unit', async () => {
    const { result, harness } = await run([step('a'), step('b', [], false), step('c')], {
      consent: async (boundaries) => new Map(boundaries.map((b) => [b.boundaryId, 'deny' as PermissionDecisionKind])),
    });
    expect(harness.ran).toEqual([]);
    expect(result.status).toBe('rejected');
  });

  it('does not run when a scope is persistently denied', async () => {
    store.createGrant(writeScope(), 'denied-persistent');
    const consent = vi.fn(allowAll);
    const { result, harness } = await run([step('a')], { consent });

    expect(consent).not.toHaveBeenCalled();
    expect(harness.ran).toEqual([]);
    expect(result.status).toBe('rejected');
  });

  it('does not run any write step under a degraded audit', async () => {
    store.createGrant(writeScope(), 'persistent');
    const { result, harness } = await run([step('a')], { auditHealth: 'degraded' });
    expect(harness.ran).toEqual([]);
    expect(result.rejection?.message).toBe('audit-degraded');
    expect(result.status).toBe('rejected');
  });

  it('rejects the plan when a step cannot be prepared, before anything runs', async () => {
    const harness = makeRunner({
      prepare: (current) => (current.stepId === 'b'
        ? { ok: false, error: { code: 'invalid-params', message: 'bad name' } }
        : { ok: true, prepared: { stepId: current.stepId, scope: writeScope(), handle: null } }),
    });
    const { result } = await run([step('a'), step('b')], { runner: harness });

    expect(harness.ran).toEqual([]);
    expect(result.status).toBe('rejected');
    expect(result.rejection).toEqual({ code: 'invalid-params', message: 'bad name' });
  });
});

describe('remembering a decision', () => {
  it('persists allow-always so the next plan runs uninterrupted', async () => {
    const persistDecision = vi.fn();
    await run([step('a')], {
      persistDecision,
      consent: async (boundaries) => new Map(boundaries.map((b) => [b.boundaryId, 'allow-always' as PermissionDecisionKind])),
    });
    expect(persistDecision).toHaveBeenCalledWith(writeScope(), 'allow-always');
  });

  it('does NOT persist allow-once', async () => {
    const persistDecision = vi.fn();
    await run([step('a')], { persistDecision, consent: allowAll });
    expect(persistDecision).not.toHaveBeenCalled();
  });

  it('persists deny-always so the refusal sticks', async () => {
    const persistDecision = vi.fn();
    await run([step('a')], {
      persistDecision,
      consent: async (boundaries) => new Map(boundaries.map((b) => [b.boundaryId, 'deny-always' as PermissionDecisionKind])),
    });
    expect(persistDecision).toHaveBeenCalledWith(writeScope(), 'deny-always');
  });
});

describe('cancellation', () => {
  it('stops starting new steps once aborted', async () => {
    store.createGrant(writeScope(), 'persistent');
    const signal = { aborted: false };
    const harness = makeRunner({
      outcome: (current) => {
        if (current.stepId === 'a') signal.aborted = true;
        return { status: 'succeeded', durationMs: 1 };
      },
    });
    const { result } = await run([step('a'), step('b'), step('c')], { runner: harness, signal });

    expect(harness.ran).toEqual(['a']);
    expect(result.status).toBe('cancelled');
  });
});

describe('empty plan', () => {
  it('completes without asking anything', async () => {
    const consent = vi.fn(allowAll);
    const { result } = await run([], { consent });
    expect(result.status).toBe('completed');
    expect(consent).not.toHaveBeenCalled();
  });
});
