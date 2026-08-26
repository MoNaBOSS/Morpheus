import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMorpheusObjectiveOrchestrator } from '@electron/services/morpheus/core/objective-orchestrator';
import { createMorpheusObjectiveStore } from '@electron/services/morpheus/core/objective-store';
import { createMorpheusMissionStore } from '@electron/services/morpheus/missions/mission-store';
import { createMorpheusAgentProfileStore } from '@electron/services/morpheus/agents/profile-store';
import { createMorpheusMemoryStore } from '@electron/services/morpheus/memory/memory-store';
import type { MorpheusAuditSink } from '@electron/services/morpheus/audit';
import type { MorpheusRuntime } from '@electron/services/morpheus/runtime';
import type { MorpheusPlanner } from '@shared/morpheus/planner';
import type { ExecutionPlan } from '@shared/morpheus/execution-types';
import type { MorpheusObjectiveEvent } from '@shared/morpheus/core/objective-types';
import { DEFAULT_OBJECTIVE_LIMITS, type MorpheusObjectiveLimits } from '@shared/morpheus/core/objective-types';

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

function setup(
  planner: MorpheusPlanner,
  execute?: MorpheusRuntime['executePlan'],
  isRuntimePaused?: () => boolean,
  configuration: {
    now?: () => Date;
    limits?: MorpheusObjectiveLimits;
  } = {},
) {
  const root = mkdtempSync(join(tmpdir(), 'morpheus-orchestrator-'));
  roots.push(root);
  const events: MorpheusObjectiveEvent[] = [];
  const auditEvents: string[] = [];
  const agents = createMorpheusAgentProfileStore({ userDataDir: root });
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
  const memory = createMorpheusMemoryStore({ userDataDir: root });
  const orchestrator = createMorpheusObjectiveOrchestrator({
    store: createMorpheusObjectiveStore({ userDataDir: root }),
    runtime,
    agents,
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
    missions: createMorpheusMissionStore({ userDataDir: root }),
    memory,
    platform: 'win32',
    isRuntimePaused,
    now: configuration.now,
    limits: configuration.limits,
    createId: (() => { let id = 0; return () => `objective-${++id}`; })(),
    emit: (event) => {
      // Audit completes before every state emission.
      expect(auditEvents.length).toBeGreaterThan(events.length);
      events.push(event);
    },
  });
  return { orchestrator, runtime, events, memory, auditEvents, agents };
}

describe('Main-owned objective orchestration', () => {
  it('rejects new objectives while paused without creating a run or calling a planner', async () => {
    const planner: MorpheusPlanner = {
      plannerId: 'provider:test', plannedBy: 'provider',
      plan: vi.fn(async () => ({ ok: true, plan: plan('plan-paused') })),
    };
    const { orchestrator, runtime } = setup(planner, undefined, () => true);
    await expect(orchestrator.submit({ objective: 'show info', originType: 'command-bar' }))
      .resolves.toMatchObject({ accepted: false, message: expect.stringContaining('paused') });
    expect(planner.plan).not.toHaveBeenCalled();
    expect(runtime.executePlan).not.toHaveBeenCalled();
    expect(orchestrator.snapshot().runOrder).toEqual([]);
    orchestrator.dispose();
  });

  it('plans, executes, observes, replans once, and completes through one pipeline', async () => {
    const planner: MorpheusPlanner = {
      plannerId: 'provider:test', plannedBy: 'provider',
      plan: vi.fn(async () => ({ ok: true, plan: plan('plan-1') })),
      review: vi.fn(async () => ({
        outcome: 'continue' as const,
        reason: 'verify storage once',
        plan: plan('plan-2', 'system.storage'),
      })),
    };
    const execute = vi.fn(async ({ planId }: { planId: string }) => ({
      planId,
      status: planId === 'plan-1' ? 'partially-completed' as const : 'completed' as const,
      steps: [{
        stepId: 'report',
        status: planId === 'plan-1' ? 'failed' as const : 'succeeded' as const,
        durationMs: 1,
        ...(planId === 'plan-1' ? { error: { code: 'temporary', message: 'Retry with storage report.' } } : {}),
      }],
    }));
    const { orchestrator, runtime, events } = setup(planner, execute as MorpheusRuntime['executePlan']);
    const submitted = await orchestrator.submit({ objective: 'Conduct a platform readiness analysis', originType: 'command-bar' });
    expect(submitted.accepted).toBe(true);
    await vi.waitFor(() => expect(orchestrator.snapshot().runsById[submitted.objectiveRunId]?.state).toBe('complete'));

    const run = orchestrator.snapshot().runsById[submitted.objectiveRunId];
    expect(run.planIds).toEqual(['plan-1', 'plan-2']);
    expect(run.observations).toHaveLength(2);
    expect(run.artifacts).toHaveLength(0);
    expect(run.summary).toBe('Completed 1 step.');
    expect(runtime.executePlan).toHaveBeenCalledTimes(2);
    expect(planner.review).toHaveBeenCalledTimes(1);
    expect(runtime.registerPlan).toHaveBeenNthCalledWith(1, expect.objectContaining({
      workspaceId: 'morpheus-files',
    }));
    expect(events.map((event) => event.state)).toEqual(expect.arrayContaining([
      'understanding', 'planning', 'executing', 'observing', 'replanning', 'complete',
    ]));
    orchestrator.dispose();
  });

  it('skips redundant provider review after a conclusive completed plan and records safe stage timings', async () => {
    let clock = Date.parse('2026-08-11T00:00:00.000Z');
    const now = vi.fn(() => new Date((clock += 10)));
    const planner: MorpheusPlanner = {
      plannerId: 'provider:fast',
      plannedBy: 'provider',
      plan: vi.fn(async () => ({ ok: true, plan: plan('plan-fast') })),
      review: vi.fn(async () => ({ outcome: 'complete' as const, summary: 'Redundant review.' })),
    };
    const { orchestrator } = setup(planner, undefined, undefined, { now });
    const submitted = await orchestrator.submit({
      objective: 'Conduct a platform readiness analysis',
      originType: 'command-bar',
    });
    const terminal = await orchestrator.waitForTerminal(submitted.objectiveRunId);

    expect(terminal.state).toBe('complete');
    expect(planner.review).not.toHaveBeenCalled();
    expect(terminal.timings).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'planning', outcome: 'completed', plannerId: 'provider:fast' }),
      expect.objectContaining({ stage: 'execution', outcome: 'completed', planId: 'plan-fast' }),
    ]));
    expect(terminal.timings?.some((timing) => timing.stage === 'review')).toBe(false);
    orchestrator.dispose();
  });

  it('reports a provider timeout as an error rather than a user cancellation', async () => {
    const planner: MorpheusPlanner = {
      plannerId: 'provider:slow',
      plannedBy: 'provider',
      plan: vi.fn((request) => new Promise((_resolve, reject) => {
        request.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      })),
    };
    const { orchestrator, agents } = setup(planner, undefined, undefined, {
      limits: { ...DEFAULT_OBJECTIVE_LIMITS, providerTimeoutMs: 5 },
    });
    const general = agents.get('general');
    expect(general).toBeDefined();
    agents.save({
      ...general!,
      planner: { kind: 'provider', providerId: 'provider-1', modelId: 'model-1' },
      updatedAt: '2026-08-11T00:00:00.000Z',
    });
    const submitted = await orchestrator.submit({
      objective: 'Conduct an extended platform readiness analysis',
      originType: 'command-bar',
      agentProfileId: 'general',
    });
    const terminal = await orchestrator.waitForTerminal(submitted.objectiveRunId, 1_000);

    expect(terminal.state).toBe('error');
    expect(terminal.error).toMatchObject({ code: 'provider-timeout' });
    expect(terminal.timings).toContainEqual(expect.objectContaining({
      stage: 'planning',
      outcome: 'timed-out',
      plannerId: 'provider:slow',
    }));
    orchestrator.dispose();
  });

  it('routes a known capability before provider selection and still executes through the plan runtime', async () => {
    const planner: MorpheusPlanner = {
      plannerId: 'provider:must-not-run', plannedBy: 'provider', plan: vi.fn(),
    };
    const execute = vi.fn(async ({ planId }: { planId: string }) => ({
      planId,
      status: 'completed' as const,
      steps: [{ stepId: 'step-1', status: 'succeeded' as const, durationMs: 1 }],
    }));
    const { orchestrator, runtime } = setup(planner, execute as MorpheusRuntime['executePlan']);
    const submitted = await orchestrator.submit({ objective: 'Show system information', originType: 'quick-command' });
    const terminal = await orchestrator.waitForTerminal(submitted.objectiveRunId);

    expect(terminal.state).toBe('complete');
    expect(terminal.route).toMatchObject({ kind: 'direct-capability', plannerId: 'deterministic-v1' });
    expect(planner.plan).not.toHaveBeenCalled();
    expect(runtime.executePlan).toHaveBeenCalledTimes(1);
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

  it('runs a Main-compiled workflow plan through objective history without invoking a planner', async () => {
    const planner: MorpheusPlanner = {
      plannerId: 'provider:must-not-run',
      plannedBy: 'provider',
      plan: vi.fn(),
    };
    const { orchestrator, runtime } = setup(planner);
    const workflowPlan = plan('workflow-plan');
    const submitted = await orchestrator.submitInternal({
      objective: 'System brief',
      origin: { type: 'workflow', workflowId: 'system-brief', agentProfileId: 'general' },
      workspaceId: 'morpheus-files',
      agentProfileId: 'general',
      preparedPlan: workflowPlan,
    });
    const terminal = await orchestrator.waitForTerminal(submitted.objectiveRunId);

    expect(terminal.state).toBe('complete');
    expect(terminal.plannerId).toBe('workflow-compiler-v1');
    expect(planner.plan).not.toHaveBeenCalled();
    expect(runtime.registerPlan).toHaveBeenCalledWith(expect.objectContaining({
      planId: 'workflow-plan',
      workspaceId: 'morpheus-files',
      origin: { type: 'workflow', workflowId: 'system-brief', agentProfileId: 'general' },
    }));
    await expect(orchestrator.waitForIdle()).resolves.toBeUndefined();
    orchestrator.dispose();
  });

  it('captures an explicit stable preference only after truthful completion', async () => {
    const planner: MorpheusPlanner = {
      plannerId: 'provider:test', plannedBy: 'provider',
      plan: vi.fn(async () => ({ ok: true, plan: plan('plan-memory') })),
    };
    const { orchestrator, memory, auditEvents } = setup(planner);
    const submitted = await orchestrator.submit({
      objective: 'Review system readiness and remember that I prefer concise progress updates.',
      originType: 'command-bar',
    });
    const terminal = await orchestrator.waitForTerminal(submitted.objectiveRunId);

    expect(terminal.state).toBe('complete');
    expect(terminal.memoryUpdate).toMatchObject({ status: 'saved', title: 'User preference' });
    expect(memory.list().memories).toHaveLength(1);
    expect(memory.list().memories[0]).toMatchObject({
      text: 'The user prefers concise progress updates.',
      source: 'mission',
      sourceId: terminal.missionId,
    });
    expect(auditEvents).toContain('captured-from-mission');
    orchestrator.dispose();
  });

  it('rejects secret-like memory without persisting it', async () => {
    const planner: MorpheusPlanner = {
      plannerId: 'provider:test', plannedBy: 'provider',
      plan: vi.fn(async () => ({ ok: true, plan: plan('plan-secret-memory') })),
    };
    const { orchestrator, memory, auditEvents } = setup(planner);
    const submitted = await orchestrator.submit({
      objective: 'Review system readiness and remember that my API key is sk-abcdefghijklmnop.',
      originType: 'command-bar',
    });
    const terminal = await orchestrator.waitForTerminal(submitted.objectiveRunId);

    expect(terminal.state).toBe('complete');
    expect(terminal.memoryUpdate).toEqual({ status: 'rejected', reason: 'sensitive-content' });
    expect(memory.list().memories).toEqual([]);
    expect(auditEvents).toContain('candidate-rejected');
    orchestrator.dispose();
  });
});
