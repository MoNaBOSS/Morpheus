import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import {
  MORPHEUS_PROACTIVE_VERSION,
  isMorpheusAttentionId,
  type CreateMorpheusReminderPayload,
  type MorpheusAttentionItem,
  type MorpheusProactiveSettings,
  type MorpheusProactiveSettingsPatch,
} from '@shared/morpheus/proactive-types';

import { readValidatedJson, writeJsonAtomically } from '../storage/atomic-json';

const MAX_ITEMS = 250;
const SOURCES = ['mission', 'goal', 'schedule', 'routine', 'reminder'] as const;
const SEVERITIES = ['info', 'attention', 'urgent'] as const;
const STATUSES = ['open', 'snoozed', 'dismissed', 'acted'] as const;
const PRESENTATION_KEYS = [
  'mission-needs-input', 'mission-failed', 'goal-overdue', 'goal-due',
  'schedule-failed', 'routine-candidate', 'reminder',
] as const;
const LOCAL_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const DEFAULT_SETTINGS: MorpheusProactiveSettings = Object.freeze({
  v: MORPHEUS_PROACTIVE_VERSION,
  enabled: true,
  notificationsEnabled: false,
  quietHoursEnabled: true,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  categories: Object.freeze({ mission: true, goal: true, schedule: true, routine: true, reminder: true }),
});

type StoredProactive = { v: 1; settings: MorpheusProactiveSettings; items: MorpheusAttentionItem[] };

export type MorpheusAttentionFact = Pick<
  MorpheusAttentionItem,
  'sourceType' | 'sourceId' | 'sourceFingerprint' | 'title' | 'detail' | 'severity'
  | 'presentationKey'
> & Pick<Partial<MorpheusAttentionItem>, 'dueAt' | 'suggestedObjective'>;

export interface MorpheusProactiveStore {
  settings(): MorpheusProactiveSettings;
  updateSettings(patch: MorpheusProactiveSettingsPatch): MorpheusProactiveSettings;
  list(): readonly MorpheusAttentionItem[];
  get(attentionId: string): MorpheusAttentionItem | undefined;
  findByFingerprint(sourceFingerprint: string): MorpheusAttentionItem | undefined;
  upsertFact(fact: MorpheusAttentionFact, attentionId?: string): MorpheusAttentionItem;
  createReminder(payload: CreateMorpheusReminderPayload, attentionId?: string): MorpheusAttentionItem;
  dismiss(attentionId: string): MorpheusAttentionItem;
  snooze(attentionId: string, until: string): MorpheusAttentionItem;
  markActed(attentionId: string): MorpheusAttentionItem;
  markNotified(attentionId: string): MorpheusAttentionItem;
  reopen(attentionId: string): MorpheusAttentionItem;
  reopenDue(now: Date): void;
  removeReminder(attentionId: string): MorpheusAttentionItem | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validIso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validateSettings(value: unknown): MorpheusProactiveSettings | null {
  if (!isRecord(value) || value.v !== MORPHEUS_PROACTIVE_VERSION
    || typeof value.enabled !== 'boolean' || typeof value.notificationsEnabled !== 'boolean'
    || typeof value.quietHoursEnabled !== 'boolean'
    || typeof value.quietHoursStart !== 'string' || !LOCAL_TIME_PATTERN.test(value.quietHoursStart)
    || typeof value.quietHoursEnd !== 'string' || !LOCAL_TIME_PATTERN.test(value.quietHoursEnd)
    || !isRecord(value.categories)) return null;
  const inputCategories = value.categories;
  const categories: MorpheusProactiveSettings['categories'] = {
    mission: inputCategories.mission as boolean,
    goal: inputCategories.goal as boolean,
    schedule: inputCategories.schedule as boolean,
    routine: inputCategories.routine as boolean,
    reminder: inputCategories.reminder as boolean,
  };
  if (Object.values(categories).some((enabled) => typeof enabled !== 'boolean')) return null;
  return { ...(structuredClone(value) as MorpheusProactiveSettings), categories };
}

export function validateMorpheusAttentionItem(value: unknown): MorpheusAttentionItem | null {
  if (!isRecord(value) || value.v !== MORPHEUS_PROACTIVE_VERSION || !isMorpheusAttentionId(value.attentionId)
    || !SOURCES.includes(value.sourceType as typeof SOURCES[number])
    || typeof value.sourceId !== 'string' || value.sourceId.length > 160
    || typeof value.sourceFingerprint !== 'string' || !value.sourceFingerprint || value.sourceFingerprint.length > 300
    || !PRESENTATION_KEYS.includes(value.presentationKey as typeof PRESENTATION_KEYS[number])
    || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 160
    || typeof value.detail !== 'string' || value.detail.length > 600
    || !SEVERITIES.includes(value.severity as typeof SEVERITIES[number])
    || !STATUSES.includes(value.status as typeof STATUSES[number])
    || !validIso(value.createdAt) || !validIso(value.updatedAt)) return null;
  for (const key of ['dueAt', 'snoozedUntil', 'lastNotifiedAt'] as const) {
    if (value[key] !== undefined && !validIso(value[key])) return null;
  }
  if (value.suggestedObjective !== undefined
    && (typeof value.suggestedObjective !== 'string' || value.suggestedObjective.length > 2_000)) return null;
  return structuredClone(value) as MorpheusAttentionItem;
}

function validateStored(value: unknown): StoredProactive | null {
  if (!isRecord(value) || value.v !== 1 || !Array.isArray(value.items)) return null;
  const settings = validateSettings(value.settings);
  const items = value.items.map(validateMorpheusAttentionItem);
  if (!settings || items.some((item) => !item) || items.length > MAX_ITEMS) return null;
  return { v: 1, settings, items: items as MorpheusAttentionItem[] };
}

export function createMorpheusProactiveStore(options: {
  userDataDir: string;
  now?: () => Date;
  createId?: () => string;
}): MorpheusProactiveStore {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => `attention-${randomUUID()}`);
  const file = join(options.userDataDir, 'morpheus', 'proactive.json');
  const loaded = readValidatedJson(file, validateStored);
  let settings = structuredClone(loaded?.settings ?? DEFAULT_SETTINGS);
  const byId = new Map<string, MorpheusAttentionItem>();
  for (const item of loaded?.items ?? []) byId.set(item.attentionId, structuredClone(item));

  const ordered = (): MorpheusAttentionItem[] => [...byId.values()]
    .sort((a, b) => {
      const rank = { urgent: 0, attention: 1, info: 2 } as const;
      return rank[a.severity] - rank[b.severity]
        || (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999')
        || b.updatedAt.localeCompare(a.updatedAt);
    });
  const flush = (): void => {
    const retained = ordered().slice(0, MAX_ITEMS);
    byId.clear();
    for (const item of retained) byId.set(item.attentionId, item);
    writeJsonAtomically(file, { v: 1, settings, items: retained } satisfies StoredProactive);
  };
  const mutate = (attentionId: string, patch: Partial<MorpheusAttentionItem>): MorpheusAttentionItem => {
    const existing = byId.get(attentionId);
    if (!existing) throw new Error('Unknown attention item');
    const item = { ...existing, ...patch, updatedAt: now().toISOString() };
    if (!validateMorpheusAttentionItem(item)) throw new Error('Invalid attention item update');
    byId.set(attentionId, item);
    try { flush(); } catch (error) { byId.set(attentionId, existing); throw error; }
    return structuredClone(item);
  };

  return {
    settings: () => structuredClone(settings),
    updateSettings(patch) {
      const next = validateSettings({
        ...settings, ...patch, v: MORPHEUS_PROACTIVE_VERSION,
        categories: { ...settings.categories, ...patch.categories },
      });
      if (!next) throw new Error('Invalid proactive settings');
      const previous = settings;
      settings = next;
      try { flush(); } catch (error) { settings = previous; throw error; }
      return structuredClone(settings);
    },
    list: () => ordered().map((item) => structuredClone(item)),
    get(attentionId) {
      const item = byId.get(attentionId);
      return item ? structuredClone(item) : undefined;
    },
    findByFingerprint(sourceFingerprint) {
      const item = [...byId.values()].find((candidate) => candidate.sourceFingerprint === sourceFingerprint);
      return item ? structuredClone(item) : undefined;
    },
    upsertFact(fact, requestedAttentionId) {
      const existing = [...byId.values()].find((item) => item.sourceFingerprint === fact.sourceFingerprint);
      if (existing) return structuredClone(existing);
      const stamp = now().toISOString();
      const attentionId = requestedAttentionId ?? createId();
      if (!isMorpheusAttentionId(attentionId) || byId.has(attentionId)) throw new Error('Invalid attention fact id');
      const item: MorpheusAttentionItem = {
        v: MORPHEUS_PROACTIVE_VERSION, attentionId, ...fact,
        status: 'open', createdAt: stamp, updatedAt: stamp,
      };
      if (!validateMorpheusAttentionItem(item)) throw new Error('Invalid attention fact');
      byId.set(attentionId, item);
      try { flush(); } catch (error) { byId.delete(attentionId); throw error; }
      return structuredClone(item);
    },
    createReminder(payload, requestedAttentionId) {
      const stamp = now().toISOString();
      const attentionId = requestedAttentionId ?? createId();
      if (!isMorpheusAttentionId(attentionId) || byId.has(attentionId)) throw new Error('Invalid reminder id');
      const item: MorpheusAttentionItem = {
        v: MORPHEUS_PROACTIVE_VERSION, attentionId, sourceType: 'reminder', sourceId: attentionId,
        sourceFingerprint: `reminder:${attentionId}`, presentationKey: 'reminder',
        title: payload.title.trim(), detail: payload.detail.trim(),
        severity: 'attention', status: 'open', createdAt: stamp, updatedAt: stamp,
        dueAt: payload.dueAt,
        ...(payload.suggestedObjective?.trim() ? { suggestedObjective: payload.suggestedObjective.trim() } : {}),
      };
      if (!validateMorpheusAttentionItem(item)) throw new Error('Invalid reminder');
      byId.set(attentionId, item);
      try { flush(); } catch (error) { byId.delete(attentionId); throw error; }
      return structuredClone(item);
    },
    dismiss: (attentionId) => mutate(attentionId, { status: 'dismissed', snoozedUntil: undefined }),
    snooze: (attentionId, until) => mutate(attentionId, { status: 'snoozed', snoozedUntil: until }),
    markActed: (attentionId) => mutate(attentionId, { status: 'acted', snoozedUntil: undefined }),
    markNotified: (attentionId) => mutate(attentionId, { lastNotifiedAt: now().toISOString() }),
    reopen: (attentionId) => mutate(attentionId, { status: 'open', snoozedUntil: undefined }),
    reopenDue(stamp) {
      let changed = false;
      for (const [id, item] of byId) {
        if (item.status !== 'snoozed' || !item.snoozedUntil || Date.parse(item.snoozedUntil) > stamp.getTime()) continue;
        byId.set(id, { ...item, status: 'open', snoozedUntil: undefined, updatedAt: stamp.toISOString() });
        changed = true;
      }
      if (changed) flush();
    },
    removeReminder(attentionId) {
      const existing = byId.get(attentionId);
      if (!existing) return null;
      if (existing.sourceType !== 'reminder') throw new Error('Only explicit reminders can be removed');
      byId.delete(attentionId);
      try { flush(); } catch (error) { byId.set(attentionId, existing); throw error; }
      return structuredClone(existing);
    },
  };
}
