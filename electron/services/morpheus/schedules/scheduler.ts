import { randomUUID } from 'node:crypto';

import {
  MORPHEUS_SCHEDULE_VERSION,
  type MorpheusSchedule,
  type MorpheusScheduleDraft,
  type MorpheusScheduleRunResult,
  type MorpheusScheduleTrigger,
  type SchedulesSnapshot,
} from '@shared/morpheus/schedule-types';
import { MORPHEUS_DEFAULT_WORKSPACE_ID } from '@shared/morpheus/workspace-types';

import type { MorpheusObjectiveOrchestrator } from '../core/objective-orchestrator';
import type { MorpheusWorkflowService } from '../workflows/workflow-service';
import type { MorpheusScheduleStore } from './schedule-store';

const TICK_MS = 15_000;

export interface MorpheusScheduler {
  list(): SchedulesSnapshot;
  save(draft: MorpheusScheduleDraft): MorpheusSchedule;
  remove(scheduleId: string): boolean;
  runNow(scheduleId: string): Promise<MorpheusScheduleRunResult>;
  tick(): Promise<void>;
  start(): void;
  stop(): void;
}

function nextDaily(localTime: string, now: Date): Date {
  const [hours, minutes] = localTime.split(':').map(Number);
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

export function nextRunFor(trigger: MorpheusScheduleTrigger, now: Date, afterRun = false): string | undefined {
  switch (trigger.type) {
    case 'once': return afterRun ? undefined : new Date(trigger.runAt).toISOString();
    case 'interval': return new Date(now.getTime() + trigger.everyMinutes * 60_000).toISOString();
    case 'daily': return nextDaily(trigger.localTime, now).toISOString();
    case 'app-startup': return undefined;
  }
}

export function createMorpheusScheduler(options: {
  store: MorpheusScheduleStore;
  workflows: MorpheusWorkflowService;
  objectives: MorpheusObjectiveOrchestrator;
  now?: () => Date;
  createId?: () => string;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  recordActivity?: (event: string, subjectId: string, details?: Record<string, string | number | boolean>) => Promise<void>;
}): MorpheusScheduler {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => `schedule-${randomUUID()}`);
  const running = new Set<string>();
  const startupRun = new Set<string>();
  let timer: ReturnType<typeof setInterval> | null = null;

  const persistOutcome = (schedule: MorpheusSchedule, result: MorpheusScheduleRunResult): void => {
    const stamp = now();
    options.store.save({
      ...schedule,
      updatedAt: stamp.toISOString(),
      lastRunAt: stamp.toISOString(),
      lastStatus: result.status,
      lastError: result.error,
      lastObjectiveRunId: result.objectiveRunId,
      lastPlanId: result.planId,
      nextRunAt: nextRunFor(schedule.trigger, stamp, true),
      enabled: schedule.trigger.type === 'once' ? false : schedule.enabled,
    });
  };

  const run = async (scheduleId: string): Promise<MorpheusScheduleRunResult> => {
    const schedule = options.store.get(scheduleId);
    if (!schedule) return { scheduleId, status: 'rejected', error: 'Unknown schedule' };
    if (!schedule.enabled) return { scheduleId, status: 'rejected', error: 'Schedule is disabled' };
    if (running.has(scheduleId)) return { scheduleId, status: 'rejected', error: 'Schedule is already running' };
    running.add(scheduleId);
    await options.recordActivity?.('run-started', scheduleId, { workflowId: schedule.workflowId });
    options.store.save({ ...schedule, lastStatus: 'running', updatedAt: now().toISOString() });
    try {
      const workflow = options.workflows.get(schedule.workflowId);
      if (!workflow) throw new Error('Scheduled workflow is unavailable');
      const trigger = schedule.trigger.type === 'app-startup' ? 'app-startup' as const : 'schedule' as const;
      const plan = options.workflows.prepare({
        workflowId: workflow.workflowId,
        trigger,
        workspaceId: schedule.workspaceId,
        origin: {
          type: 'schedule', scheduleId, workflowId: workflow.workflowId,
          agentProfileId: workflow.agentProfileId,
        },
      });
      let submitted = await options.objectives.submitInternal({
        objective: schedule.name,
        origin: plan.origin,
        workspaceId: schedule.workspaceId,
        agentProfileId: workflow.agentProfileId,
        preparedPlan: plan,
      });
      while (!submitted.accepted && submitted.objectiveRunId) {
        // Scheduled work queues behind the one active sequential objective. It
        // does not race another plan or get silently discarded as "busy".
        await options.objectives.waitForIdle();
        submitted = await options.objectives.submitInternal({
          objective: schedule.name,
          origin: plan.origin,
          workspaceId: schedule.workspaceId,
          agentProfileId: workflow.agentProfileId,
          preparedPlan: plan,
        });
      }
      if (!submitted.accepted) throw new Error(submitted.message ?? 'Scheduled objective was rejected');
      const objective = await options.objectives.waitForTerminal(submitted.objectiveRunId);
      const observationStatus = objective.observations.at(-1)?.status;
      const status = objective.state === 'complete'
        ? observationStatus === 'partially-completed' ? 'partially-completed' as const : 'completed' as const
        : objective.state === 'needs-clarification' ? 'rejected' as const
          : 'failed' as const;
      const result: MorpheusScheduleRunResult = {
        scheduleId,
        objectiveRunId: submitted.objectiveRunId,
        planId: objective.planIds.at(-1) ?? plan.planId,
        status,
        ...(objective.error?.message
          ? { error: objective.error.message }
          : objective.clarification ? { error: objective.clarification } : {}),
      };
      persistOutcome(schedule, result);
      await options.recordActivity?.('run-finished', scheduleId, { workflowId: schedule.workflowId, status });
      return result;
    } catch (error) {
      const result: MorpheusScheduleRunResult = {
        scheduleId, status: 'failed',
        error: error instanceof Error ? error.message : 'Scheduled execution failed',
      };
      persistOutcome(schedule, result);
      await options.recordActivity?.('run-failed', scheduleId, { workflowId: schedule.workflowId, error: result.error ?? 'unknown' });
      return result;
    } finally {
      running.delete(scheduleId);
    }
  };

  const api: MorpheusScheduler = {
    list: () => options.store.list(),
    save(draft) {
      const stamp = now();
      const existing = draft.scheduleId ? options.store.get(draft.scheduleId) : undefined;
      const schedule: MorpheusSchedule = {
        v: MORPHEUS_SCHEDULE_VERSION,
        scheduleId: existing?.scheduleId ?? createId(),
        name: draft.name.trim(), workflowId: draft.workflowId, enabled: draft.enabled,
        workspaceId: draft.workspaceId ?? existing?.workspaceId ?? MORPHEUS_DEFAULT_WORKSPACE_ID,
        trigger: structuredClone(draft.trigger),
        createdAt: existing?.createdAt ?? stamp.toISOString(), updatedAt: stamp.toISOString(),
        nextRunAt: draft.enabled ? nextRunFor(draft.trigger, stamp) : undefined,
        lastRunAt: existing?.lastRunAt, lastStatus: existing?.lastStatus ?? 'never',
        lastError: existing?.lastError,
        ...(existing?.lastObjectiveRunId ? { lastObjectiveRunId: existing.lastObjectiveRunId } : {}),
        ...(existing?.lastPlanId ? { lastPlanId: existing.lastPlanId } : {}),
      };
      return options.store.save(schedule);
    },
    remove: (scheduleId) => options.store.remove(scheduleId),
    runNow: run,
    async tick() {
      const stamp = now().getTime();
      for (const schedule of options.store.list().schedules) {
        if (!schedule.enabled || running.has(schedule.scheduleId)) continue;
        if (schedule.trigger.type === 'app-startup') {
          if (startupRun.has(schedule.scheduleId)) continue;
          startupRun.add(schedule.scheduleId);
          await run(schedule.scheduleId);
        } else if (schedule.nextRunAt && Date.parse(schedule.nextRunAt) <= stamp) {
          await run(schedule.scheduleId);
        }
      }
    },
    start() {
      if (timer) return;
      void api.tick();
      timer = (options.setIntervalFn ?? setInterval)(() => void api.tick(), TICK_MS);
      timer.unref?.();
    },
    stop() {
      if (!timer) return;
      (options.clearIntervalFn ?? clearInterval)(timer);
      timer = null;
    },
  };
  return api;
}
