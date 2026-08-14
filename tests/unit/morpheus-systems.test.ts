import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMorpheusSystemService } from '@electron/services/morpheus/systems/system-service';
import { createMorpheusSystemStore } from '@electron/services/morpheus/systems/system-store';
import type { MorpheusSystemDraft } from '@shared/morpheus/system-types';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function directory(): string {
  const value = mkdtempSync(join(tmpdir(), 'morpheus-systems-'));
  directories.push(value);
  return value;
}

const WORKFLOW = {
  v: 1 as const,
  workflowId: 'weekly-report',
  name: 'Weekly report',
  description: 'Create a privacy-safe system report.',
  agentProfileId: 'general',
  steps: [{
    stepId: 'report', capabilityId: 'system.report' as const, params: {}, dependsOn: [],
    summary: 'Collect system information',
  }],
  allowedTriggers: ['manual', 'schedule'] as const,
  outputs: { collectArtifacts: true, retainHistory: true },
  builtIn: false,
  enabled: true,
  createdAt: '2026-08-14T08:00:00.000Z',
  updatedAt: '2026-08-14T08:00:00.000Z',
};

const DRAFT: MorpheusSystemDraft = {
  name: 'Weekly intelligence',
  description: 'Run the reviewed workflow.',
  workflowId: WORKFLOW.workflowId,
  workspaceId: 'morpheus-files',
  projectId: 'personal',
  scheduleIds: ['schedule-weekly'],
  outputs: { collectArtifacts: true, retainHistory: true },
};

function setup(overrides: {
  objectiveState?: 'complete' | 'error';
  mission?: Record<string, unknown>;
  workflowEnabled?: boolean;
} = {}) {
  let stamp = new Date('2026-08-14T08:00:00.000Z');
  const store = createMorpheusSystemStore({ userDataDir: directory() });
  const schedules = new Map<string, Record<string, unknown>>([[
    'schedule-weekly',
    {
      v: 1, scheduleId: 'schedule-weekly', name: 'Weekly', workflowId: WORKFLOW.workflowId,
      workspaceId: 'morpheus-files', enabled: false, trigger: { type: 'interval', everyMinutes: 60 },
      createdAt: stamp.toISOString(), updatedAt: stamp.toISOString(), lastStatus: 'never',
    },
  ]]);
  const events: string[] = [];
  const workflow = { ...WORKFLOW, enabled: overrides.workflowEnabled ?? true };
  const prepare = vi.fn((input: { origin: unknown; workspaceId: string }) => ({
    v: 1, planId: 'system-plan', createdAt: stamp.toISOString(), origin: input.origin,
    objective: workflow.name, status: 'draft', plannedBy: 'deterministic', workspaceId: input.workspaceId,
    steps: [{
      stepId: 'report', capabilityId: 'system.report', params: {}, summaryKey: 'system.report', dependsOn: [],
      permission: {
        capabilityId: 'system.report', platform: 'win32', riskTier: 'low',
        resourceScope: 'runtime', mandatoryConfirmation: false,
      },
    }],
  }));
  const submitInternal = vi.fn(async () => ({
    objectiveRunId: 'objective-system', missionId: 'mission-system', accepted: true,
  }));
  const waitForTerminal = vi.fn(async () => ({
    state: overrides.objectiveState ?? 'complete',
    observations: [{ status: overrides.objectiveState === 'error' ? 'failed' : 'completed' }],
    artifacts: [{ artifactId: 'system-plan:report' }],
    ...(overrides.objectiveState === 'error' ? { error: { message: 'Real execution failed.' } } : {}),
  }));
  const service = createMorpheusSystemService({
    store,
    workflows: { get: () => workflow, prepare } as never,
    agents: { get: () => ({ profileId: 'general', enabled: true }) } as never,
    workspaces: { get: () => ({ enabled: true, available: true }) } as never,
    projects: { get: () => ({ enabled: true, workspaceId: 'morpheus-files' }) } as never,
    schedules: {
      get: (id: string) => schedules.get(id),
      save: (schedule: Record<string, unknown>) => {
        schedules.set(String(schedule.scheduleId), structuredClone(schedule));
        return schedule;
      },
    } as never,
    scheduler: {
      save: (draft: Record<string, unknown>) => {
        const existing = schedules.get(String(draft.scheduleId)) ?? {};
        const next = { ...existing, ...draft, updatedAt: stamp.toISOString() };
        schedules.set(String(draft.scheduleId), next);
        return next;
      },
    } as never,
    objectives: { submitInternal, waitForTerminal, waitForIdle: vi.fn() } as never,
    missions: { get: () => overrides.mission } as never,
    audit: { recordControl: vi.fn(async (entry: { event: string }) => { events.push(entry.event); }) } as never,
    auditHealth: () => 'healthy',
    appVersion: '1.0.0',
    now: () => new Date(stamp),
    createId: () => 'system-weekly',
    createRunId: () => 'system-run-one',
  });
  return { service, store, schedules, events, prepare, submitInternal, advance: () => { stamp = new Date(stamp.getTime() + 1_000); } };
}

describe('Morpheus Systems', () => {
  it('derives exact boundaries, tests through Objective Core, then activates and pauses schedules', async () => {
    const { service, schedules, events, prepare, submitInternal, advance } = setup();
    const saved = await service.save(DRAFT);
    expect(saved.status).toBe('draft');
    expect(saved.agentProfileId).toBe('general');
    expect(saved.capabilityIds).toEqual(['system.report']);

    expect((await service.activate(saved.systemId)).accepted).toBe(false);
    advance();
    const tested = await service.test(saved.systemId);
    expect(tested.accepted).toBe(true);
    expect(tested.system?.status).toBe('tested');
    expect(tested.system?.lastTestMissionId).toBe('mission-system');
    expect(tested.system?.runHistory[0]?.artifactIds).toEqual(['system-plan:report']);
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({
      origin: { type: 'system', systemId: 'system-weekly', workflowId: 'weekly-report', agentProfileId: 'general' },
    }));
    expect(submitInternal).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'personal', workspaceId: 'morpheus-files', preparedPlan: expect.any(Object),
    }));

    advance();
    expect((await service.activate(saved.systemId)).system?.status).toBe('active');
    expect(schedules.get('schedule-weekly')?.enabled).toBe(true);
    advance();
    expect((await service.pause(saved.systemId)).system?.status).toBe('paused');
    expect(schedules.get('schedule-weekly')?.enabled).toBe(false);
    expect(events).toEqual(['created', 'test-started', 'test-succeeded', 'activated', 'paused']);
  });

  it('does not activate a failed test or create grants', async () => {
    const { service } = setup({ objectiveState: 'error' });
    const saved = await service.save(DRAFT);
    const tested = await service.test(saved.systemId);
    expect(tested.system?.status).toBe('draft');
    expect(tested.system?.lastTestStatus).toBe('failed');
    expect((await service.activate(saved.systemId)).accepted).toBe(false);
  });

  it('projects changed dependencies as invalid without rewriting history', async () => {
    const runtime = setup();
    const saved = await runtime.service.save(DRAFT);
    const invalidRuntime = setup({ workflowEnabled: false });
    // Persist the valid record into the second store to isolate dependency projection.
    invalidRuntime.store.save(saved);
    const projected = invalidRuntime.service.get(saved.systemId);
    expect(projected?.status).toBe('invalid');
    expect(projected?.invalidReason).toMatch(/workflow is unavailable/i);
    expect(invalidRuntime.store.get(saved.systemId)?.status).toBe('draft');
  });

  it('creates only workflow-backed completed Missions as reusable Systems', async () => {
    const eligible = setup({
      mission: {
        missionId: 'mission-workflow', objective: 'Weekly intelligence', status: 'completed',
        origin: { type: 'workflow', workflowId: 'weekly-report', agentProfileId: 'general' },
        workspaceId: 'morpheus-files', projectId: 'personal', summary: 'A real completed run.',
      },
    });
    const created = await eligible.service.createFromMission('mission-workflow');
    expect(created.eligible).toBe(true);
    expect(created.system?.workflowId).toBe('weekly-report');

    const ineligible = setup({
      mission: {
        missionId: 'mission-direct', objective: 'Open Notepad', status: 'completed',
        origin: { type: 'command-bar', commandText: 'Open Notepad' }, workspaceId: 'morpheus-files',
      },
    });
    const rejected = await ineligible.service.createFromMission('mission-direct');
    expect(rejected.eligible).toBe(false);
    expect(rejected.reason).toMatch(/no reusable workflow blueprint/i);
  });
});
