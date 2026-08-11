import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMorpheusObjectiveOrchestrator } from '@electron/services/morpheus/core/objective-orchestrator';
import { createMorpheusObjectiveStore } from '@electron/services/morpheus/core/objective-store';
import { createMorpheusAgentProfileStore } from '@electron/services/morpheus/agents/profile-store';
import type { MorpheusAuditSink } from '@electron/services/morpheus/audit';
import type { MorpheusRuntime } from '@electron/services/morpheus/runtime';
import type { MorpheusPlanner } from '@shared/morpheus/planner';
import type { ExecutionPlan } from '@shared/morpheus/execution-types';
import type { MorpheusObjectiveEvent } from '@shared/morpheus/core/objective-types';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function plan(id: string, capabilityId: 'system.report' | 'system.storage' = 'system.report'): ExecutionPlan {
  return {
    v: 1, planId: id, createdAt: '2026-08-11T00:00:00.000Z', status: 'draft', plannedBy: 'provider',
    origin: { type: 'command-bar', commandText: 'show info' }, objective: 'show info',
    steps: [{
      stepId: 'report', capabilityId, params: {}, summaryKey: 'test', dependsOn: [],
      permission: {
        capabilityId, platform: 'win32', riskTier: 'low',
        resourceScope: 'runtime', mandatoryConfirmation: false,
      },
    }],
  };
}

function setup(planner: MorpheusPlanner, execute?: MorpheusRuntime['executePlan']) {
  const root = mkdtempSync(join(tmpdir(), 'morpheus-orchestrator-'));
  roots.push(root);
  const events: MorpheusObjectiveEvent[] = [];
  const auditEvents: string[] = [];
  const runtime: MorpheusRuntime = {
    registerPlan: vi.fn((value) => value),
    executePlan: execute ?? vi.fn(async ({ planId }) => ({
      planId, status: 'completed' as const,
      steps: [{
        stepId: 'report', status: 'succeeded' as const, durationMs: 3,
        artifact: { kind: 'report' as const, artifactId: `${planId}:report`, createdAt: '2026-08-11T00:00:01.000Z', data: { cpuCount: 8 } },
      }],
    })),
    cancelPlan: vi.fn(async () => ({ accepted: true })),
  } as unknown as MorpheusRuntime;
  const audit = {
    recordControl: vi.fn(async (entry: { event: string }) => { auditEvents.push(entry.event); }),
  } as unknown as MorpheusAuditSink;
  const orchestrator = createMorpheusObjectiveOrchestrator({
    store: createMorpheusObjectiveStore({ userDataDir: root }),
    runtime,
    agents: createMorpheusAgentProfileStore({ userDataDir: root }),
    planners: { select: vi.fn(async () => ({ ok: true as const, planner, providerAccountId: 'provider-1', modelId: 'model-1' })) },
    audit,
    appVersion: '1.0.0',
    workspaces: {
      get: vi.fn(() => ({
        v: 1 as const,
        workspaceId: 'morpheus-files',
        name: 'Morpheus Files',
        rootPath: join(root, 'files'),
        kind: 'managed' as const,
        access: 'read-write' as const,
        enabled: true,
        available: true,
        createdAt: '2026-08-11T00:00:00.000Z',
        updatedAt: '2026-08-11T00:00:00.000Z',
      })),
      resolveRoot: vi.fn(() => join(root, 'files')),
    },
    platform: 'win32',
    createId: (() => { let id = 0; return () => `objective-${++id}`; })(),
    emit: (event) => {
      // Audit completes before every state emission.
      expect(auditEvents.length).toBeGreaterThan(events.length);
      events.push(event);
    },
  });
  return { orchestrator, runtime, events };
}

describe('Main-owned objective orchestration', () => {
  it('plans, executes, observes, replans once, and completes through one pipeline', async () => {
    let reviewCount = 0;
    const planner: MorpheusPlanner = {
      plannerId: 'provider:test', plannedBy: 'provider',
      plan: vi.fn(async () => ({ ok: true, plan: plan('plan-1') })),
      review: vi.fn(async () => {
        reviewCount += 1;
        return reviewCount === 1
          ? { outcome: 'continue' as const, reason: 'verify storage once', plan: plan('plan-2', 'system.storage') }
          : { outcome: 'complete' as const, summary: 'System information verified.' };
      }),
    };
    const { orchestrator, runtime, events } = setup(planner);
    const submitted = await orchestrator.submit({ objective: 'show info', originType: 'command-bar' });
    expect(submitted.accepted).toBe(true);
    await vi.waitFor(() => expect(orchestrator.snapshot().runsById[submitted.objectiveRunId]?.state).toBe('complete'));

    const run = orchestrator.snapshot().runsById[submitted.objectiveRunId];
    expect(run.planIds).toEqual(['plan-1', 'plan-2']);
    expect(run.observations).toHaveLength(2);
    expect(run.artifacts).toHaveLength(2);
    expect(run.summary).toBe('System information verified.');
    expect(runtime.executePlan).toHaveBeenCalledTimes(2);
    expect(runtime.registerPlan).toHaveBeenNthCalledWith(1, expect.objectContaining({
      workspaceId: 'morpheus-files',
    }));
    expect(events.map((event) => event.state)).toEqual(expect.arrayContaining([
      'understanding', 'planning', 'executing', 'observing', 'replanning', 'complete',
    ]));
    orchestrator.dispose();
  });

  it('returns truthful clarification for an unsupported deterministic objective', async () => {
    const planner: MorpheusPlanner = {
      plannerId: 'deterministic-v1', plannedBy: 'deterministic',
      plan: vi.fn(async () => ({
        ok: false as const,
        unsupported: { objective: 'trade crypto', reason: 'not-understood' as const, supportedCapabilities: ['system.report'] },
      })),
    };
    const { orchestrator, runtime } = setup(planner);
    const submitted = await orchestrator.submit({ objective: 'trade crypto', originType: 'quick-command' });
    await vi.waitFor(() => expect(orchestrator.snapshot().runsById[submitted.objectiveRunId]?.state).toBe('needs-clarification'));
    expect(runtime.executePlan).not.toHaveBeenCalled();
    expect(orchestrator.snapshot().runsById[submitted.objectiveRunId]?.clarification).toContain('system.report');
    orchestrator.dispose();
  });

  it('cancels an active plan rather than waiting for it to finish', async () => {
    let finish: ((value: { planId: string; status: 'cancelled'; steps: [] }) => void) | undefined;
    const execute = vi.fn((_payload: { planId: string }) => new Promise<{ planId: string; status: 'cancelled'; steps: [] }>((resolve) => {
      finish = resolve;
    }));
    const planner: MorpheusPlanner = {
      plannerId: 'provider:test', plannedBy: 'provider',
      plan: vi.fn(async () => ({ ok: true, plan: plan('plan-cancel') })),
    };
    const { orchestrator, runtime } = setup(planner, execute as MorpheusRuntime['executePlan']);
    vi.mocked(runtime.cancelPlan).mockImplementation(async ({ planId }) => {
      finish?.({ planId, status: 'cancelled', steps: [] });
      return { accepted: true };
    });
    const submitted = await orchestrator.submit({ objective: 'show info', originType: 'chat' });
    await vi.waitFor(() => expect(runtime.executePlan).toHaveBeenCalled());
    expect(await orchestrator.cancel({ objectiveRunId: submitted.objectiveRunId })).toEqual({ accepted: true });
    expect(orchestrator.snapshot().runsById[submitted.objectiveRunId]?.state).toBe('cancelled');
    expect(runtime.cancelPlan).toHaveBeenCalledWith({ planId: 'plan-cancel' });
    orchestrator.dispose();
  });
});
