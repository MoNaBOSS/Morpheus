import { createHash, randomUUID } from 'node:crypto';

import type { MorpheusActionId } from '@shared/morpheus/actions/registry';
import type { MorpheusMission } from '@shared/morpheus/mission-types';
import {
  MORPHEUS_SYSTEM_VERSION,
  type CreateMorpheusSystemFromMissionResult,
  type MorpheusSystem,
  type MorpheusSystemDraft,
  type MorpheusSystemExecutionResult,
  type MorpheusSystemRun,
  type MorpheusSystemRunStatus,
  type MorpheusSystemsSnapshot,
} from '@shared/morpheus/system-types';
import type { MorpheusWorkflow, WorkflowTriggerType } from '@shared/morpheus/workflow-types';

import type { MorpheusAgentProfileStore } from '../agents/profile-store';
import type { MorpheusAuditSink } from '../audit';
import type { MorpheusObjectiveOrchestrator } from '../core/objective-orchestrator';
import type { MorpheusMissionStore } from '../missions/mission-store';
import type { MorpheusProjectStore } from '../projects/project-store';
import type { MorpheusScheduleStore } from '../schedules/schedule-store';
import type { MorpheusScheduler } from '../schedules/scheduler';
import type { MorpheusWorkspaceStore } from '../workspaces/workspace-store';
import type { MorpheusWorkflowService } from '../workflows/workflow-service';
import type { MorpheusSystemStore } from './system-store';

const MAX_HISTORY = 50;

type Resolution = {
  valid: boolean;
  reason?: string;
  workflow?: MorpheusWorkflow;
};

export interface MorpheusSystemService {
  list(): MorpheusSystemsSnapshot;
  get(systemId: string): MorpheusSystem | undefined;
  save(draft: MorpheusSystemDraft): Promise<MorpheusSystem>;
  remove(systemId: string): Promise<MorpheusSystem | null>;
  createFromMission(missionId: string, name?: string): Promise<CreateMorpheusSystemFromMissionResult>;
  test(systemId: string): Promise<MorpheusSystemExecutionResult>;
  activate(systemId: string): Promise<MorpheusSystemExecutionResult>;
  pause(systemId: string): Promise<MorpheusSystemExecutionResult>;
  run(systemId: string): Promise<MorpheusSystemExecutionResult>;
}

function capabilities(workflow: MorpheusWorkflow): MorpheusActionId[] {
  return [...new Set(workflow.steps.map((step) => step.capabilityId))].sort();
}

function fingerprint(input: {
  workflowId: string;
  workspaceId: string;
  projectId?: string;
  capabilityIds: readonly MorpheusActionId[];
}): string {
  return createHash('sha256').update(JSON.stringify([
    input.workflowId, input.workspaceId, input.projectId ?? null, input.capabilityIds,
  ]), 'utf8').digest('hex').slice(0, 32);
}

function workflowTrigger(workflow: MorpheusWorkflow): WorkflowTriggerType {
  if (workflow.allowedTriggers.includes('manual')) return 'manual';
  const trigger = workflow.allowedTriggers[0];
  if (!trigger) throw new Error('System workflow has no allowed trigger');
  return trigger;
}

function executionStatus(state: string, observationStatus?: string): MorpheusSystemRunStatus {
  if (state === 'complete') return observationStatus === 'partially-completed' ? 'partially-completed' : 'completed';
  if (state === 'cancelled') return 'cancelled';
  if (state === 'needs-clarification' || state === 'degraded') return 'rejected';
  return 'failed';
}

export function createMorpheusSystemService(options: {
  store: MorpheusSystemStore;
  workflows: MorpheusWorkflowService;
  agents: MorpheusAgentProfileStore;
  workspaces: MorpheusWorkspaceStore;
  projects: MorpheusProjectStore;
  schedules: MorpheusScheduleStore;
  scheduler: MorpheusScheduler;
  objectives: MorpheusObjectiveOrchestrator;
  missions: MorpheusMissionStore;
  audit: MorpheusAuditSink;
  auditHealth: () => 'healthy' | 'degraded';
  appVersion: string;
  now?: () => Date;
  createId?: () => string;
  createRunId?: () => string;
}): MorpheusSystemService {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => `system-${randomUUID()}`);
  const createRunId = options.createRunId ?? (() => `system-run-${randomUUID()}`);
  const record = (event: string, subjectId: string, details: Record<string, string | number | boolean> = {}) => (
    options.audit.recordControl({ category: 'system', event, subjectId, details, appVersion: options.appVersion })
  );

  const resolve = (system: MorpheusSystem): Resolution => {
    const workflow = options.workflows.get(system.workflowId);
    if (!workflow?.enabled) return { valid: false, reason: 'The referenced workflow is unavailable.' };
    const agent = options.agents.get(workflow.agentProfileId);
    if (!agent?.enabled || agent.profileId !== system.agentProfileId) {
      return { valid: false, reason: 'The referenced Agent Profile is unavailable or changed.' };
    }
    const workspace = options.workspaces.get(system.workspaceId);
    if (!workspace?.enabled || !workspace.available) return { valid: false, reason: 'The trusted workspace is unavailable.' };
    if (system.projectId) {
      const project = options.projects.get(system.projectId);
      if (!project?.enabled || project.workspaceId !== system.workspaceId) {
        return { valid: false, reason: 'The referenced Project is unavailable or belongs to another workspace.' };
      }
    }
    const currentCapabilities = capabilities(workflow);
    if (JSON.stringify(currentCapabilities) !== JSON.stringify(system.capabilityIds)) {
      return { valid: false, reason: 'The workflow capability boundary changed. Review and save the System again.' };
    }
    for (const scheduleId of system.scheduleIds) {
      const schedule = options.schedules.get(scheduleId);
      if (!schedule || schedule.workflowId !== system.workflowId || schedule.workspaceId !== system.workspaceId) {
        return { valid: false, reason: 'An associated schedule is unavailable or no longer matches this System.' };
      }
    }
    try {
      options.workflows.prepare({
        workflowId: workflow.workflowId,
        trigger: workflowTrigger(workflow),
        workspaceId: system.workspaceId,
        origin: {
          type: 'system', systemId: system.systemId, workflowId: workflow.workflowId,
          agentProfileId: workflow.agentProfileId,
        },
      });
    } catch (error) {
      return { valid: false, reason: error instanceof Error ? error.message : 'The System plan is invalid.' };
    }
    return { valid: true, workflow };
  };

  const project = (system: MorpheusSystem): MorpheusSystem => {
    const resolution = resolve(system);
    return resolution.valid ? { ...system, invalidReason: undefined } : {
      ...system, status: 'invalid', invalidReason: resolution.reason ?? 'A System dependency is invalid.',
    };
  };

  const exactDraftReferences = (draft: MorpheusSystemDraft): { workflow: MorpheusWorkflow; capabilityIds: MorpheusActionId[] } => {
    const workflow = options.workflows.get(draft.workflowId);
    if (!workflow?.enabled) throw new Error('The selected workflow is unavailable.');
    if (!options.agents.get(workflow.agentProfileId)?.enabled) throw new Error('The workflow Agent Profile is unavailable.');
    const workspace = options.workspaces.get(draft.workspaceId);
    if (!workspace?.enabled || !workspace.available) throw new Error('The selected workspace is unavailable.');
    if (draft.projectId) {
      const project = options.projects.get(draft.projectId);
      if (!project?.enabled || project.workspaceId !== draft.workspaceId) {
        throw new Error('The selected Project does not belong to this workspace.');
      }
    }
    for (const scheduleId of draft.scheduleIds) {
      const schedule = options.schedules.get(scheduleId);
      if (!schedule || schedule.workflowId !== workflow.workflowId || schedule.workspaceId !== draft.workspaceId) {
        throw new Error('Every selected schedule must use the same workflow and workspace.');
      }
    }
    return { workflow, capabilityIds: capabilities(workflow) };
  };

  const prepare = (system: MorpheusSystem, workflow: MorpheusWorkflow) => options.workflows.prepare({
    workflowId: workflow.workflowId,
    trigger: workflowTrigger(workflow),
    workspaceId: system.workspaceId,
    origin: {
      type: 'system', systemId: system.systemId, workflowId: workflow.workflowId,
      agentProfileId: workflow.agentProfileId,
    },
  });

  const execute = async (system: MorpheusSystem, workflow: MorpheusWorkflow, kind: MorpheusSystemRun['kind']): Promise<{
    run: MorpheusSystemRun;
    objectiveRunId?: string;
    missionId?: string;
  }> => {
    const startedAt = now().toISOString();
    const plan = prepare(system, workflow);
    let submitted = await options.objectives.submitInternal({
      objective: system.name,
      origin: plan.origin,
      workspaceId: system.workspaceId,
      projectId: system.projectId,
      agentProfileId: workflow.agentProfileId,
      preparedPlan: plan,
    });
    while (!submitted.accepted && submitted.objectiveRunId) {
      await options.objectives.waitForIdle();
      submitted = await options.objectives.submitInternal({
        objective: system.name,
        origin: plan.origin,
        workspaceId: system.workspaceId,
        projectId: system.projectId,
        agentProfileId: workflow.agentProfileId,
        preparedPlan: plan,
      });
    }
    if (!submitted.accepted) {
      const completedAt = now().toISOString();
      return {
        run: {
          runId: createRunId(), kind, status: 'rejected', startedAt, completedAt,
          artifactIds: [], error: submitted.message ?? 'System execution was rejected.',
        },
      };
    }
    const objective = await options.objectives.waitForTerminal(submitted.objectiveRunId);
    const status = executionStatus(objective.state, objective.observations.at(-1)?.status);
    return {
      objectiveRunId: submitted.objectiveRunId,
      missionId: submitted.missionId,
      run: {
        runId: createRunId(), kind, status, startedAt, completedAt: now().toISOString(),
        objectiveRunId: submitted.objectiveRunId,
        ...(submitted.missionId ? { missionId: submitted.missionId } : {}),
        artifactIds: system.outputs.collectArtifacts
          ? objective.artifacts.map((artifact) => artifact.artifactId)
          : [],
        ...(status === 'completed' || status === 'partially-completed' ? {} : {
          error: objective.error?.message ?? objective.clarification ?? 'System execution did not complete.',
        }),
      },
    };
  };

  const appendRun = (system: MorpheusSystem, run: MorpheusSystemRun): readonly MorpheusSystemRun[] => (
    system.outputs.retainHistory ? [...system.runHistory, run].slice(-MAX_HISTORY) : [run]
  );

  const toggleSchedules = (system: MorpheusSystem, enabled: boolean): (() => void) => {
    const previous = system.scheduleIds.flatMap((scheduleId) => {
      const schedule = options.schedules.get(scheduleId);
      return schedule ? [schedule] : [];
    });
    try {
      for (const schedule of previous) {
        options.scheduler.save({
          scheduleId: schedule.scheduleId,
          name: schedule.name,
          workflowId: schedule.workflowId,
          workspaceId: schedule.workspaceId,
          trigger: schedule.trigger,
          enabled,
        });
      }
    } catch (error) {
      for (const schedule of previous) options.schedules.save(schedule);
      throw error;
    }
    return () => {
      for (const schedule of previous) options.schedules.save(schedule);
    };
  };

  const service: MorpheusSystemService = {
    list: () => ({ systems: options.store.list().systems.map(project) }),
    get(systemId) {
      const system = options.store.get(systemId);
      return system ? project(system) : undefined;
    },
    async save(draft) {
      const name = draft.name.trim();
      const description = draft.description.trim();
      if (!name || name.length > 100 || description.length > 500) throw new Error('Invalid System text.');
      if (draft.scheduleIds.length > 32 || new Set(draft.scheduleIds).size !== draft.scheduleIds.length) {
        throw new Error('Invalid System schedules.');
      }
      const existing = draft.systemId ? options.store.get(draft.systemId) : undefined;
      if (existing?.status === 'active') throw new Error('Pause the System before editing it.');
      const { workflow, capabilityIds } = exactDraftReferences(draft);
      const testFingerprint = fingerprint({
        workflowId: workflow.workflowId,
        workspaceId: draft.workspaceId,
        projectId: draft.projectId,
        capabilityIds,
      });
      const unchangedTestBoundary = existing?.testFingerprint === testFingerprint;
      const stamp = now().toISOString();
      const system: MorpheusSystem = {
        v: MORPHEUS_SYSTEM_VERSION,
        systemId: existing?.systemId ?? createId(),
        name,
        description,
        workflowId: workflow.workflowId,
        agentProfileId: workflow.agentProfileId,
        workspaceId: draft.workspaceId,
        ...(draft.projectId ? { projectId: draft.projectId } : {}),
        scheduleIds: [...draft.scheduleIds],
        capabilityIds,
        outputs: structuredClone(draft.outputs),
        status: unchangedTestBoundary && existing
          ? existing.status === 'invalid' ? 'draft' : existing.status
          : 'draft',
        testFingerprint,
        ...(unchangedTestBoundary && existing?.lastTestStatus ? { lastTestStatus: existing.lastTestStatus } : {}),
        ...(unchangedTestBoundary && existing?.lastTestedAt ? { lastTestedAt: existing.lastTestedAt } : {}),
        ...(unchangedTestBoundary && existing?.lastTestObjectiveRunId
          ? { lastTestObjectiveRunId: existing.lastTestObjectiveRunId } : {}),
        ...(unchangedTestBoundary && existing?.lastTestMissionId ? { lastTestMissionId: existing.lastTestMissionId } : {}),
        runHistory: existing?.runHistory ?? [],
        createdAt: existing?.createdAt ?? stamp,
        updatedAt: stamp,
      };
      await record(existing ? 'updated' : 'created', system.systemId, {
        workflowId: system.workflowId,
        workspaceId: system.workspaceId,
        capabilityCount: system.capabilityIds.length,
      });
      return options.store.save(system);
    },
    async remove(systemId) {
      const existing = options.store.get(systemId);
      if (!existing) return null;
      if (existing.status === 'active') throw new Error('Pause the System before removing it.');
      await record('removed', systemId);
      return options.store.remove(systemId);
    },
    async createFromMission(missionId, requestedName) {
      const mission: MorpheusMission | undefined = options.missions.get(missionId);
      if (!mission || mission.status !== 'completed') {
        return { system: null, eligible: false, reason: 'Only a completed reusable Mission can become a System.' };
      }
      if (mission.origin.type !== 'workflow' && mission.origin.type !== 'schedule') {
        return {
          system: null,
          eligible: false,
          reason: 'This Mission has no reusable workflow blueprint. Save an explicit Workflow first.',
        };
      }
      if (!mission.workspaceId) {
        return { system: null, eligible: false, reason: 'This Mission has no exact workspace boundary.' };
      }
      const workflowId = mission.origin.workflowId;
      const workflow = options.workflows.get(workflowId);
      if (!workflow) return { system: null, eligible: false, reason: 'The Mission workflow is unavailable.' };
      const system = await service.save({
        name: (requestedName?.trim() || mission.objective).slice(0, 100),
        description: mission.summary?.slice(0, 500) ?? workflow.description,
        workflowId,
        workspaceId: mission.workspaceId,
        ...(mission.projectId ? { projectId: mission.projectId } : {}),
        scheduleIds: mission.origin.type === 'schedule' ? [mission.origin.scheduleId] : [],
        outputs: {
          collectArtifacts: workflow.outputs.collectArtifacts,
          retainHistory: workflow.outputs.retainHistory,
        },
      });
      await record('created-from-mission', system.systemId, { missionId, workflowId });
      return { system, eligible: true };
    },
    async test(systemId) {
      const system = options.store.get(systemId);
      if (!system) return { system: null, accepted: false, message: 'Unknown System.' };
      if (system.status === 'active') return { system: project(system), accepted: false, message: 'Pause the System before testing it.' };
      if (options.auditHealth() !== 'healthy') {
        return { system: project(system), accepted: false, message: 'Audit is degraded. System testing is blocked.' };
      }
      const resolution = resolve(system);
      if (!resolution.valid || !resolution.workflow) {
        return { system: project(system), accepted: false, message: resolution.reason };
      }
      await record('test-started', systemId, { workflowId: system.workflowId });
      const result = await execute(system, resolution.workflow, 'test');
      const succeeded = result.run.status === 'completed';
      await record(succeeded ? 'test-succeeded' : 'test-failed', systemId, {
        status: result.run.status,
        ...(result.objectiveRunId ? { objectiveRunId: result.objectiveRunId } : {}),
      });
      const updated = options.store.save({
        ...system,
        status: succeeded ? 'tested' : 'draft',
        lastTestStatus: result.run.status,
        lastTestedAt: result.run.completedAt,
        ...(result.objectiveRunId ? { lastTestObjectiveRunId: result.objectiveRunId } : {}),
        ...(result.missionId ? { lastTestMissionId: result.missionId } : {}),
        runHistory: appendRun(system, result.run),
        updatedAt: result.run.completedAt,
      });
      return {
        system: updated,
        accepted: true,
        objectiveRunId: result.objectiveRunId,
        missionId: result.missionId,
        ...(!succeeded ? { message: result.run.error ?? 'System test did not complete successfully.' } : {}),
      };
    },
    async activate(systemId) {
      const system = options.store.get(systemId);
      if (!system) return { system: null, accepted: false, message: 'Unknown System.' };
      if (options.auditHealth() !== 'healthy') {
        return { system: project(system), accepted: false, message: 'Audit is degraded. System activation is blocked.' };
      }
      const resolution = resolve(system);
      if (!resolution.valid) return { system: project(system), accepted: false, message: resolution.reason };
      if (!['tested', 'paused'].includes(system.status) || system.lastTestStatus !== 'completed') {
        return { system: project(system), accepted: false, message: 'A successful System test is required before activation.' };
      }
      await record('activated', systemId, { scheduleCount: system.scheduleIds.length });
      const rollbackSchedules = toggleSchedules(system, true);
      try {
        const updated = options.store.save({ ...system, status: 'active', updatedAt: now().toISOString() });
        return { system: updated, accepted: true };
      } catch (error) {
        rollbackSchedules();
        await record('activation-rolled-back', systemId);
        throw error;
      }
    },
    async pause(systemId) {
      const system = options.store.get(systemId);
      if (!system) return { system: null, accepted: false, message: 'Unknown System.' };
      if (system.status !== 'active') return { system: project(system), accepted: false, message: 'Only an active System can be paused.' };
      await record('paused', systemId, { scheduleCount: system.scheduleIds.length });
      const rollbackSchedules = toggleSchedules(system, false);
      try {
        const updated = options.store.save({ ...system, status: 'paused', updatedAt: now().toISOString() });
        return { system: updated, accepted: true };
      } catch (error) {
        rollbackSchedules();
        await record('pause-rolled-back', systemId);
        throw error;
      }
    },
    async run(systemId) {
      const system = options.store.get(systemId);
      if (!system) return { system: null, accepted: false, message: 'Unknown System.' };
      if (system.status !== 'active') return { system: project(system), accepted: false, message: 'Activate the System before running it.' };
      if (options.auditHealth() !== 'healthy') {
        return { system: project(system), accepted: false, message: 'Audit is degraded. System execution is blocked.' };
      }
      const resolution = resolve(system);
      if (!resolution.valid || !resolution.workflow) {
        return { system: project(system), accepted: false, message: resolution.reason };
      }
      await record('run-started', systemId, { workflowId: system.workflowId });
      const result = await execute(system, resolution.workflow, 'manual');
      await record('run-finished', systemId, {
        status: result.run.status,
        ...(result.objectiveRunId ? { objectiveRunId: result.objectiveRunId } : {}),
      });
      const updated = options.store.save({
        ...system,
        runHistory: appendRun(system, result.run),
        updatedAt: result.run.completedAt,
      });
      return {
        system: updated,
        accepted: Boolean(result.objectiveRunId),
        objectiveRunId: result.objectiveRunId,
        missionId: result.missionId,
        ...(!result.objectiveRunId ? { message: result.run.error ?? 'System execution was rejected.' } : {}),
      };
    },
  };
  return service;
}
