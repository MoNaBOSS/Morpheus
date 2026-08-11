import { join } from 'node:path';

import type { MorpheusSchedule, SchedulesSnapshot } from '@shared/morpheus/schedule-types';
import {
  MORPHEUS_DEFAULT_WORKSPACE_ID,
  isMorpheusWorkspaceId,
} from '@shared/morpheus/workspace-types';
import { readValidatedJson, writeJsonAtomically } from '../storage/atomic-json';

type StoredSchedules = { v: 1; schedules: MorpheusSchedule[] };

export interface MorpheusScheduleStore {
  list(): SchedulesSnapshot;
  get(scheduleId: string): MorpheusSchedule | undefined;
  save(schedule: MorpheusSchedule): MorpheusSchedule;
  remove(scheduleId: string): boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validIso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function validateMorpheusSchedule(value: unknown): MorpheusSchedule | null {
  if (!isRecord(value) || value.v !== 1) return null;
  if (typeof value.scheduleId !== 'string' || !/^[a-z0-9][a-z0-9-]{1,80}$/.test(value.scheduleId)) return null;
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100) return null;
  if (typeof value.workflowId !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(value.workflowId)) return null;
  const workspaceId = value.workspaceId ?? MORPHEUS_DEFAULT_WORKSPACE_ID;
  if (!isMorpheusWorkspaceId(workspaceId)) return null;
  if (typeof value.enabled !== 'boolean' || !validIso(value.createdAt) || !validIso(value.updatedAt)) return null;
  if (value.nextRunAt !== undefined && !validIso(value.nextRunAt)) return null;
  if (value.lastRunAt !== undefined && !validIso(value.lastRunAt)) return null;
  if (!['never', 'running', 'completed', 'partially-completed', 'failed', 'rejected'].includes(String(value.lastStatus))) return null;
  if (value.lastError !== undefined && (typeof value.lastError !== 'string' || value.lastError.length > 500)) return null;
  if (!isRecord(value.trigger) || !['once', 'interval', 'daily', 'app-startup'].includes(String(value.trigger.type))) return null;
  if (value.trigger.type === 'once' && !validIso(value.trigger.runAt)) return null;
  if (value.trigger.type === 'interval'
    && (typeof value.trigger.everyMinutes !== 'number' || !Number.isInteger(value.trigger.everyMinutes)
      || value.trigger.everyMinutes < 1 || value.trigger.everyMinutes > 43_200)) return null;
  if (value.trigger.type === 'daily'
    && (typeof value.trigger.localTime !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value.trigger.localTime))) return null;
  return { ...value, workspaceId } as MorpheusSchedule;
}

function validateStored(value: unknown): StoredSchedules | null {
  if (!isRecord(value) || value.v !== 1 || !Array.isArray(value.schedules)) return null;
  const schedules = value.schedules.map(validateMorpheusSchedule);
  if (schedules.some((entry) => !entry) || schedules.length > 200) return null;
  return { v: 1, schedules: schedules as MorpheusSchedule[] };
}

export function createMorpheusScheduleStore(options: { userDataDir: string }): MorpheusScheduleStore {
  const file = join(options.userDataDir, 'morpheus', 'schedules.json');
  const byId = new Map<string, MorpheusSchedule>();
  const loaded = readValidatedJson(file, validateStored);
  for (const schedule of loaded?.schedules ?? []) byId.set(schedule.scheduleId, structuredClone(schedule));
  const flush = (): void => writeJsonAtomically(file, { v: 1, schedules: [...byId.values()] });
  return {
    list: () => ({ schedules: [...byId.values()].map((entry) => structuredClone(entry)) }),
    get(scheduleId) {
      const schedule = byId.get(scheduleId);
      return schedule ? structuredClone(schedule) : undefined;
    },
    save(schedule) {
      const valid = validateMorpheusSchedule(schedule);
      if (!valid) throw new Error('Invalid Morpheus schedule');
      byId.set(valid.scheduleId, structuredClone(valid));
      flush();
      return structuredClone(valid);
    },
    remove(scheduleId) {
      const removed = byId.delete(scheduleId);
      if (removed) flush();
      return removed;
    },
  };
}
