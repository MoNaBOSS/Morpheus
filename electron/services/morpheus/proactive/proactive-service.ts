import { createHash, randomUUID } from 'node:crypto';

import type { MorpheusMissionStore } from '../missions/mission-store';
import type { MorpheusGoalStore } from '../goals/goal-store';
import type { MorpheusScheduleStore } from '../schedules/schedule-store';
import type { MorpheusObjectiveOrchestrator } from '../core/objective-orchestrator';
import type { MorpheusAuditSink } from '../audit';
import type {
  CreateMorpheusReminderPayload,
  MorpheusAttentionItem,
  MorpheusProactiveSettings,
  MorpheusProactiveSettingsPatch,
  MorpheusProactiveSnapshot,
} from '@shared/morpheus/proactive-types';
import type { SubmitMorpheusObjectiveResult } from '@shared/morpheus/core/objective-types';
import type { ExecutionPlan } from '@shared/morpheus/execution-types';
import { MORPHEUS_PLAN_VERSION } from '@shared/morpheus/execution-types';
import { getMorpheusActionDescriptor, requiresMandatoryConfirmation } from '@shared/morpheus/actions/registry';

import type { MorpheusProactiveStore } from './proactive-store';

const TICK_MS = 60_000;

export interface MorpheusProactiveService {
  snapshot(): MorpheusProactiveSnapshot;
  refresh(): Promise<MorpheusProactiveSnapshot>;
  updateSettings(patch: MorpheusProactiveSettingsPatch): Promise<MorpheusProactiveSettings>;
  createReminder(payload: CreateMorpheusReminderPayload): Promise<MorpheusAttentionItem>;
  dismiss(attentionId: string): Promise<MorpheusAttentionItem>;
  snooze(attentionId: string, until: string): Promise<MorpheusAttentionItem>;
  removeReminder(attentionId: string): Promise<MorpheusAttentionItem | null>;
  act(attentionId: string): Promise<SubmitMorpheusObjectiveResult>;
  tick(): Promise<void>;
  start(): void;
  stop(): void;
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 24);
}

function insideQuietHours(settings: MorpheusProactiveSettings, now: Date): boolean {
  if (!settings.quietHoursEnabled) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const parse = (value: string): number => {
    const [hours, mins] = value.split(':').map(Number);
    return hours * 60 + mins;
  };
  const start = parse(settings.quietHoursStart);
  const end = parse(settings.quietHoursEnd);
  return start === end || (start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end);
}

export function createMorpheusProactiveService(options: {
  store: MorpheusProactiveStore;
  missions: MorpheusMissionStore;
  goals: MorpheusGoalStore;
  schedules: MorpheusScheduleStore;
  objectives: MorpheusObjectiveOrchestrator;
  audit: MorpheusAuditSink;
  appVersion: string;
  now?: () => Date;
  createId?: () => string;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}): MorpheusProactiveService {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => `attention-${randomUUID()}`);
  let timer: ReturnType<typeof setInterval> | null = null;
  let ticking = false;

  const record = (event: string, subjectId?: string, details: Record<string, string | number | boolean> = {}) => (
    options.audit.recordControl({ category: 'proactive', event, subjectId, details, appVersion: options.appVersion })
  );
  const snapshot = (): MorpheusProactiveSnapshot => ({
    settings: options.store.settings(), items: options.store.list(), generatedAt: now().toISOString(),
  });

  const upsertFact = async (fact: Parameters<MorpheusProactiveStore['upsertFact']>[0]): Promise<void> => {
    if (options.store.findByFingerprint(fact.sourceFingerprint)) return;
    const attentionId = createId();
    await record('attention-created', attentionId, {
      sourceType: fact.sourceType,
      sourceId: fact.sourceId,
      presentationKey: fact.presentationKey,
      severity: fact.severity,
    });
    options.store.upsertFact(fact, attentionId);
  };

  const reopenSnoozed = async (): Promise<void> => {
    const stamp = now();
    for (const item of options.store.list()) {
      if (item.status !== 'snoozed' || !item.snoozedUntil
        || Date.parse(item.snoozedUntil) > stamp.getTime()) continue;
      await record('attention-reopened', item.attentionId);
      options.store.reopen(item.attentionId);
    }
  };

  const refreshFacts = async (): Promise<void> => {
    const settings = options.store.settings();
    if (!settings.enabled) return;
    await reopenSnoozed();

    if (settings.categories.mission) {
      const missions = options.missions.snapshot();
      for (const missionId of missions.missionOrder) {
        const mission = missions.missionsById[missionId];
        if (!mission || !['failed', 'needs-input'].includes(mission.status)) continue;
        await upsertFact({
          sourceType: 'mission', sourceId: missionId,
          sourceFingerprint: `mission:${missionId}:${mission.status}:${mission.updatedAt}`,
          presentationKey: mission.status === 'needs-input' ? 'mission-needs-input' : 'mission-failed',
          title: mission.status === 'needs-input' ? 'A Mission needs your input' : 'A Mission needs attention',
          detail: mission.error?.message ?? mission.summary ?? mission.objective,
          severity: mission.status === 'failed' ? 'attention' : 'info',
          suggestedObjective: mission.objective,
        });
      }
    }

    if (settings.categories.goal) {
      const today = new Date(now());
      today.setHours(0, 0, 0, 0);
      for (const goal of options.goals.list().goals) {
        if (goal.status !== 'active' || !goal.targetDate) continue;
        const due = Date.parse(`${goal.targetDate}T00:00:00`);
        if (due > today.getTime() + 3 * 24 * 60 * 60_000) continue;
        const overdue = due < today.getTime();
        await upsertFact({
          sourceType: 'goal', sourceId: goal.goalId,
          sourceFingerprint: `goal:${goal.goalId}:${goal.targetDate}:${goal.status}`,
          presentationKey: overdue ? 'goal-overdue' : 'goal-due',
          title: overdue ? 'A Goal is overdue' : 'A Goal milestone is approaching',
          detail: goal.nextAction || goal.objective,
          severity: overdue ? 'urgent' : 'attention', dueAt: new Date(due).toISOString(),
          suggestedObjective: goal.nextAction || undefined,
        });
      }
    }

    if (settings.categories.schedule) {
      for (const schedule of options.schedules.list().schedules) {
        if (!['failed', 'rejected'].includes(schedule.lastStatus) || !schedule.lastRunAt) continue;
        await upsertFact({
          sourceType: 'schedule', sourceId: schedule.scheduleId,
          sourceFingerprint: `schedule:${schedule.scheduleId}:${schedule.lastRunAt}:${schedule.lastStatus}`,
          presentationKey: 'schedule-failed',
          title: 'A scheduled System needs attention',
          detail: schedule.lastError ?? schedule.name,
          severity: 'attention',
        });
      }
    }

    if (settings.categories.routine) {
      const completed = options.missions.snapshot().missionOrder
        .map((id) => options.missions.get(id))
        .filter((mission) => mission?.status === 'completed');
      const groups = new Map<string, typeof completed>();
      for (const mission of completed) {
        if (!mission) continue;
        const key = mission.objective.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
        groups.set(key, [...(groups.get(key) ?? []), mission]);
      }
      for (const [key, missions] of groups) {
        if (missions.length < 3) continue;
        const latest = missions[0];
        if (!latest) continue;
        await upsertFact({
          sourceType: 'routine', sourceId: fingerprint(key),
          sourceFingerprint: `routine:${fingerprint(key)}`,
          presentationKey: 'routine-candidate',
          title: 'This repeated work could become a System',
          detail: `Completed ${missions.length} times: ${latest.objective}`,
          severity: 'info', suggestedObjective: latest.objective,
        });
      }
    }
  };

  const notificationPlan = (item: MorpheusAttentionItem): ExecutionPlan => {
    const descriptor = getMorpheusActionDescriptor('system.notify');
    const origin = { type: 'proactive' as const, attentionId: item.attentionId };
    return {
      v: MORPHEUS_PLAN_VERSION, planId: `plan-${randomUUID()}`, createdAt: now().toISOString(),
      origin, objective: item.title, status: 'draft', plannedBy: 'deterministic',
      steps: [{
        stepId: 'notify-attention', capabilityId: 'system.notify',
        params: { title: 'Morpheus', body: item.detail },
        summaryKey: 'morpheus.plan.steps.systemNotify', dependsOn: [],
        permission: {
          capabilityId: 'system.notify', platform: process.platform,
          riskTier: descriptor.riskTier, resourceScope: 'notification',
          mandatoryConfirmation: requiresMandatoryConfirmation(descriptor.riskTier),
        },
      }],
    };
  };

  const service: MorpheusProactiveService = {
    snapshot,
    async refresh() {
      await refreshFacts();
      return snapshot();
    },
    async updateSettings(patch) {
      await record('settings-updated', undefined, {
        enabled: patch.enabled ?? options.store.settings().enabled,
        notificationsEnabled: patch.notificationsEnabled ?? options.store.settings().notificationsEnabled,
      });
      return options.store.updateSettings(patch);
    },
    async createReminder(payload) {
      const attentionId = createId();
      await record('reminder-created', attentionId, { dueAt: payload.dueAt });
      return options.store.createReminder(payload, attentionId);
    },
    async dismiss(attentionId) {
      if (!options.store.get(attentionId)) throw new Error('Unknown attention item');
      await record('attention-dismissed', attentionId);
      return options.store.dismiss(attentionId);
    },
    async snooze(attentionId, until) {
      if (!options.store.get(attentionId)) throw new Error('Unknown attention item');
      await record('attention-snoozed', attentionId, { until });
      return options.store.snooze(attentionId, until);
    },
    async removeReminder(attentionId) {
      const existing = options.store.get(attentionId);
      if (!existing) return null;
      if (existing.sourceType !== 'reminder') throw new Error('Only explicit reminders can be removed');
      await record('reminder-removed', attentionId);
      return options.store.removeReminder(attentionId);
    },
    async act(attentionId) {
      const item = options.store.get(attentionId);
      if (!item || item.status === 'dismissed') {
        return { objectiveRunId: '', accepted: false, message: 'This attention item is unavailable.' };
      }
      if (!item.suggestedObjective) {
        return { objectiveRunId: '', accepted: false, message: 'This item has no executable follow-up.' };
      }
      await record('attention-action-requested', attentionId, { sourceType: item.sourceType });
      let result: SubmitMorpheusObjectiveResult;
      if (item.sourceType === 'goal') {
        const goal = options.goals.get(item.sourceId);
        result = goal ? await options.objectives.submitInternal({
          objective: goal.nextAction, origin: { type: 'goal', goalId: goal.goalId, agentProfileId: goal.agentProfileId },
          workspaceId: goal.workspaceId, projectId: goal.projectId,
          agentProfileId: goal.agentProfileId, goalId: goal.goalId,
        }) : { objectiveRunId: '', accepted: false, message: 'The Goal is unavailable.' };
      } else {
        const mission = item.sourceType === 'mission' ? options.missions.get(item.sourceId) : undefined;
        result = await options.objectives.submitInternal({
          objective: item.suggestedObjective,
          origin: { type: 'proactive', attentionId },
          workspaceId: mission?.workspaceId,
          projectId: mission?.projectId,
          agentProfileId: mission?.agentProfileId,
          missionId: mission?.missionId,
          goalId: mission?.goalId,
        });
      }
      if (result.accepted) {
        await record('attention-acted', attentionId, {
          sourceType: item.sourceType,
          objectiveRunId: result.objectiveRunId,
        });
        if (item.sourceType === 'goal') {
          await options.audit.recordControl({
            category: 'goal', event: 'continuation-started', subjectId: item.sourceId,
            details: { objectiveRunId: result.objectiveRunId }, appVersion: options.appVersion,
          });
          options.goals.markContinued(item.sourceId, result.objectiveRunId, result.missionId);
        }
        options.store.markActed(attentionId);
      }
      return result;
    },
    async tick() {
      if (ticking) return;
      ticking = true;
      try {
        await refreshFacts();
        const settings = options.store.settings();
        if (!settings.enabled || !settings.notificationsEnabled || insideQuietHours(settings, now())) return;
        const stamp = now().getTime();
        const item = options.store.list().find((candidate) => candidate.status === 'open'
          && !candidate.lastNotifiedAt
          && (!candidate.dueAt || Date.parse(candidate.dueAt) <= stamp)
          && candidate.severity !== 'info');
        if (!item) return;
        const plan = notificationPlan(item);
        const submitted = await options.objectives.submitInternal({
          objective: `Notify me: ${item.title}`,
          origin: plan.origin,
          preparedPlan: plan,
        });
        if (!submitted.accepted) return;
        const run = await options.objectives.waitForTerminal(submitted.objectiveRunId);
        if (run.state === 'complete') {
          options.store.markNotified(item.attentionId);
          await record('notification-delivered', item.attentionId);
        }
      } finally {
        ticking = false;
      }
    },
    start() {
      if (timer) return;
      void service.tick();
      timer = (options.setIntervalFn ?? setInterval)(() => void service.tick(), TICK_MS);
      timer.unref?.();
    },
    stop() {
      if (!timer) return;
      (options.clearIntervalFn ?? clearInterval)(timer);
      timer = null;
    },
  };
  return service;
}

export { insideQuietHours as isInsideMorpheusQuietHours };
