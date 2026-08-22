import { createHash, randomUUID } from 'node:crypto';

import {
  MORPHEUS_SCHEDULE_VERSION,
  type MorpheusSchedule,
  type MorpheusScheduleDraft,
  type MorpheusReminderDraft,
  type MorpheusReminderResult,
  type MorpheusScheduleRunResult,
  type MorpheusScheduleTrigger,
  type SchedulesSnapshot,
} from '@shared/morpheus/schedule-types';
import { MORPHEUS_WORKFLOW_VERSION, type MorpheusWorkflow } from '@shared/morpheus/workflow-types';
import { MORPHEUS_DEFAULT_WORKSPACE_ID } from '@shared/morpheus/workspace-types';

import type { MorpheusObjectiveOrchestrator } from '../core/objective-orchestrator';
import type { MorpheusWorkflowService } from '../workflows/workflow-service';
import type { MorpheusScheduleStore } from './schedule-store';

const TICK_MS = 15_000;

export interface MorpheusScheduler {
  list(): SchedulesSnapshot;
  save(draft: MorpheusScheduleDraft): MorpheusSchedule;
  createReminder(draft: MorpheusReminderDraft): MorpheusReminderResult;
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
  isRuntimePaused?: () => boolean;
}): MorpheusScheduler {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => `schedule-${randomUUID()}`);
  const running = new Set<string>();
  const startupRun = new Set<string>();
  let timer: ReturnType<typeof setInterval> | null = null;

  const saveSchedule = (
    draft: MorpheusScheduleDraft,
    managedKind?: MorpheusSchedule['managedKind'],
  ): MorpheusSchedule => {
    const stamp = now();
    const existing = draft.scheduleId ? options.store.get(draft.scheduleId) : undefined;
    if (existing?.managedKind === 'reminder'
      && managedKind === undefined
      && draft.workflowId !== existing.workflowId) {
      throw new Error('A managed reminder workflow cannot be replaced');
    }
    const effectiveManagedKind = managedKind ?? existing?.managedKind;
    const schedule: MorpheusSchedule = {
      v: MORPHEUS_SCHEDULE_VERSION,
      scheduleId: existing?.scheduleId ?? createId(),
      name: draft.name.trim(), workflowId: draft.workflowId, enabled: draft.enabled,
      ...(effectiveManagedKind ? { managedKind: effectiveManagedKind } : {}),
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
  };

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
    if (options.isRuntimePaused?.()) return { scheduleId, status: 'rejected', error: 'Morpheus is paused' };
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
    save: saveSchedule,
    createReminder(draft) {
      const title = draft.title.trim();
      const body = draft.body.trim();
      const runAt = new Date(draft.runAt);
      const stamp = now();
      if (!title || title.length > 100 || !body || body.length > 512) {
        throw new Error('Reminder title or message is invalid');
      }
      if (!Number.isFinite(runAt.getTime()) || runAt.getTime() <= stamp.getTime()) {
        throw new Error('Reminder time must be in the future');
      }

      const scheduleId = createId();
      const workflowId = `reminder-${createHash('sha256').update(scheduleId).digest('hex').slice(0, 32)}`;
      const timestamp = stamp.toISOString();
      const workflow: MorpheusWorkflow = {
        v: MORPHEUS_WORKFLOW_VERSION,
        workflowId,
        name: title,
        description: 'Morpheus-owned scheduled reminder.',
        agentProfileId: 'general',
        steps: [{
          stepId: 'notify',
          capabilityId: 'system.notify',
          params: { title, body },
          dependsOn: [],
          condition: { type: 'always' },
          summary: 'Deliver the scheduled reminder',
        }],
        allowedTriggers: ['schedule'],
        outputs: { collectArtifacts: true, retainHistory: true },
        builtIn: false,
        enabled: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const trigger: MorpheusScheduleTrigger = draft.repeatDaily
        ? {
            type: 'daily',
            localTime: `${String(runAt.getHours()).padStart(2, '0')}:${String(runAt.getMinutes()).padStart(2, '0')}`,
          }
        : { type: 'once', runAt: runAt.toISOString() };

      options.workflows.save(workflow);
      try {
        const schedule = saveSchedule({
          scheduleId,
          name: title,
          workflowId,
          workspaceId: draft.workspaceId,
          enabled: true,
          trigger,
        }, 'reminder');
        return {
          scheduleId,
          workflowId,
          triggerType: trigger.type,
          ...(schedule.nextRunAt ? { nextRunAt: schedule.nextRunAt } : {}),
        };
      } catch (error) {
        options.workflows.remove(workflowId);
        throw error;
      }
    },
    remove(scheduleId) {
      const existing = options.store.get(scheduleId);
      const removed = options.store.remove(scheduleId);
      if (removed && existing?.managedKind === 'reminder') {
        try { options.workflows.remove(existing.workflowId); } catch { /* A harmless orphan is safer than restoring a removed schedule. */ }
      }
      return removed;
    },
    runNow: run,
    async tick() {
      if (options.isRuntimePaused?.()) return;
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
