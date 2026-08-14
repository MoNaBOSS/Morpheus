import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  submitObjective: vi.fn(),
  objectiveSnapshot: vi.fn(),
  cancelObjective: vi.fn(),
  correctObjective: vi.fn(),
  onObjective: vi.fn(),
}));

vi.mock('@/lib/host-api', () => ({
  hostApi: {
    morpheus: {
      submitObjective: mocks.submitObjective,
      objectiveSnapshot: mocks.objectiveSnapshot,
      cancelObjective: mocks.cancelObjective,
      correctObjective: mocks.correctObjective,
    },
  },
}));

vi.mock('@/lib/host-events', () => ({
  hostEvents: {
    onMorpheusObjectiveEvent: mocks.onObjective,
    onMorpheusPlanConsent: vi.fn(() => vi.fn()),
  },
}));

import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { useMorpheusExecutionContextStore } from '@/stores/morpheus-execution-context';
import { useMorpheusActionsStore } from '@/stores/morpheus-actions';
import type { MorpheusObjectiveEvent, MorpheusObjectiveRun } from '@shared/morpheus/core/objective-types';
import type { ExecutionPlan } from '@shared/morpheus/execution-types';

const PLAN: ExecutionPlan = {
  v: 1,
  planId: 'plan-1',
  createdAt: '2026-08-11T00:00:00.000Z',
  origin: { type: 'voice', commandText: 'Show system information' },
  objective: 'Show system information',
  status: 'draft',
  plannedBy: 'provider',
  steps: [{
    stepId: 'report',
    capabilityId: 'system.report',
    params: {},
    summaryKey: 'morpheus.actions.systemReport.label',
    permission: {
      capabilityId: 'system.report', platform: 'win32', riskTier: 'low',
      resourceScope: 'privacy-safe-system-report', mandatoryConfirmation: false,
    },
    dependsOn: [],
  }],
};

function run(overrides: Partial<MorpheusObjectiveRun> = {}): MorpheusObjectiveRun {
  return {
    v: 1,
    objectiveRunId: 'objective-1',
    objective: 'Show system information',
    origin: PLAN.origin,
    state: 'planning',
    createdAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:01.000Z',
    iteration: 1,
    corrections: [],
    planIds: [],
    observations: [],
    artifacts: [],
    ...overrides,
  };
}

function event(runValue: MorpheusObjectiveRun, plan?: ExecutionPlan): MorpheusObjectiveEvent {
  return {
    v: 1,
    seq: 1,
    ts: runValue.updatedAt,
    objectiveRunId: runValue.objectiveRunId,
    state: runValue.state,
    run: runValue,
    plan,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.submitObjective.mockResolvedValue({ objectiveRunId: 'objective-1', accepted: true });
  mocks.cancelObjective.mockResolvedValue({ accepted: true });
  mocks.correctObjective.mockResolvedValue({ accepted: true });
  useMorpheusCommandStore.setState({
    input: '', plan: null, unsupported: null, interpreting: false, executing: false,
    planResult: null, consent: null, artifacts: [], objectiveRun: null,
    objectiveHistory: null,
  });
  useMorpheusExecutionContextStore.setState({
    selectedAgentProfileId: null,
    selectedProjectId: 'personal',
  });
  useMorpheusActionsStore.setState({
    supportedActions: { 'system.report': true, 'file.createText': true, 'file.delete': false },
  });
});

describe('unified Morpheus objective store', () => {
  it('routes typed, Quick Command and voice objectives through Main submitObjective', async () => {
    await expect(useMorpheusCommandStore.getState().runObjective('  Show system information  ', 'voice'))
      .resolves.toBe(true);
    expect(mocks.submitObjective).toHaveBeenCalledWith({
      objective: 'Show system information',
      originType: 'voice',
      workspaceId: 'morpheus-files',
      projectId: 'personal',
    });
    expect(useMorpheusCommandStore.getState().input).toBe('');
  });

  it('carries only logical workspace and Agent Profile context into Main', async () => {
    useMorpheusExecutionContextStore.setState({ selectedAgentProfileId: 'developer' });
    await useMorpheusCommandStore.getState().runObjective('Open the project', 'chat');
    expect(mocks.submitObjective).toHaveBeenCalledWith({
      objective: 'Open the project',
      originType: 'chat',
      workspaceId: 'morpheus-files',
      agentProfileId: 'developer',
      projectId: 'personal',
    });
  });

  it('projects real objective events and Main-authored plans into the Command Center', () => {
    let handler: ((value: MorpheusObjectiveEvent) => void) | undefined;
    mocks.onObjective.mockImplementation((next) => {
      handler = next;
      return vi.fn();
    });
    useMorpheusCommandStore.getState().subscribeObjectives();
    handler?.(event(run({ state: 'executing', planIds: ['plan-1'] }), PLAN));

    const state = useMorpheusCommandStore.getState();
    expect(state.plan).toEqual(PLAN);
    expect(state.executing).toBe(true);
    expect(state.interpreting).toBe(false);
    expect(state.objectiveRun?.state).toBe('executing');
  });

  it('projects observed step status and Main-derived artifact lineage', () => {
    let handler: ((value: MorpheusObjectiveEvent) => void) | undefined;
    mocks.onObjective.mockImplementation((next) => { handler = next; return vi.fn(); });
    useMorpheusCommandStore.getState().subscribeObjectives();
    const artifact = {
      kind: 'report' as const,
      artifactId: 'artifact-1',
      createdAt: '2026-08-11T00:00:02.000Z',
      data: { platform: 'win32' },
    };
    handler?.(event(run({
      state: 'complete',
      summary: 'System information reported.',
      planIds: ['plan-1'],
      artifacts: [artifact],
      observations: [{
        iteration: 1,
        planId: 'plan-1',
        status: 'completed',
        observedAt: '2026-08-11T00:00:02.000Z',
        steps: [{
          stepId: 'report', capabilityId: 'system.report', status: 'succeeded',
          durationMs: 12, artifactIds: ['artifact-1'],
        }],
      }],
    }), PLAN));

    const state = useMorpheusCommandStore.getState();
    expect(state.planResult).toMatchObject({
      planId: 'plan-1',
      status: 'completed',
      steps: [{ stepId: 'report', status: 'succeeded', artifact }],
    });
    expect(state.artifacts).toContainEqual(artifact);
    expect(state.executing).toBe(false);
  });

  it('cancels and corrects only by the active Main objective id', async () => {
    useMorpheusCommandStore.setState({ objectiveRun: run({ state: 'executing' }) });
    await useMorpheusCommandStore.getState().cancelObjective();
    await useMorpheusCommandStore.getState().correctObjective('Use Calculator instead');
    expect(mocks.cancelObjective).toHaveBeenCalledWith({ objectiveRunId: 'objective-1' });
    expect(mocks.correctObjective).toHaveBeenCalledWith({
      objectiveRunId: 'objective-1',
      correction: 'Use Calculator instead',
    });
  });

  it('keeps truthful capability guidance and clears stale consent when an objective terminates', () => {
    let handler: ((value: MorpheusObjectiveEvent) => void) | undefined;
    mocks.onObjective.mockImplementation((next) => { handler = next; return vi.fn(); });
    useMorpheusCommandStore.setState({ consent: {
      v: 1,
      planId: 'plan-1',
      objective: 'Do something unsupported',
      boundaries: [],
      requestedAt: '2026-08-11T00:00:01.000Z',
    } });
    useMorpheusCommandStore.getState().subscribeObjectives();
    handler?.(event(run({
      objective: 'Do something unsupported',
      state: 'needs-clarification',
      clarification: 'A configured reasoning provider is required.',
    })));

    const state = useMorpheusCommandStore.getState();
    expect(state.consent).toBeNull();
    expect(state.unsupported?.supportedCapabilities).toEqual(['file.createText', 'system.report']);
  });
});
