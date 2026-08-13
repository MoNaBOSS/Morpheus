import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import {
  MORPHEUS_MEMORY_VERSION,
  isMorpheusMemoryId,
  type MorpheusMemory,
  type MorpheusMemoryDraft,
  type MorpheusMemorySnapshot,
} from '@shared/morpheus/memory-types';

import { readValidatedJson, writeJsonAtomically } from '../storage/atomic-json';

export const MORPHEUS_MEMORY_MAX_ENTRIES = 500;
export const MORPHEUS_MEMORY_MAX_TEXT = 1_000;

type StoredMemory = { v: 1; memories: MorpheusMemory[] };

export interface MorpheusMemoryStore {
  list(projectId?: string): MorpheusMemorySnapshot;
  eligibleForPlanning(projectId?: string, limit?: number): MorpheusMemory[];
  get(memoryId: string): MorpheusMemory | undefined;
  save(draft: MorpheusMemoryDraft): MorpheusMemory;
  remove(memoryId: string): MorpheusMemory | null;
  countForProject(projectId: string): number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateMemory(value: unknown): MorpheusMemory | null {
  if (!isRecord(value) || value.v !== MORPHEUS_MEMORY_VERSION
    || !isMorpheusMemoryId(value.memoryId) || typeof value.title !== 'string'
    || !value.title.trim() || value.title.length > 80 || typeof value.text !== 'string'
    || !value.text.trim() || value.text.length > MORPHEUS_MEMORY_MAX_TEXT
    || !['preference', 'project-context', 'routine', 'decision'].includes(String(value.kind))
    || !['normal', 'sensitive'].includes(String(value.sensitivity))
    || !['allowed', 'local-only'].includes(String(value.providerUse))
    || !['user', 'mission'].includes(String(value.source))
    || (value.projectId !== undefined && typeof value.projectId !== 'string')
    || typeof value.enabled !== 'boolean' || typeof value.createdAt !== 'string'
    || typeof value.updatedAt !== 'string') return null;
  return structuredClone(value) as MorpheusMemory;
}

function validateStored(value: unknown): StoredMemory | null {
  if (!isRecord(value) || value.v !== 1 || !Array.isArray(value.memories)) return null;
  const memories = value.memories.map(validateMemory);
  if (memories.some((memory) => !memory)) return null;
  return { v: 1, memories: (memories as MorpheusMemory[]).slice(0, MORPHEUS_MEMORY_MAX_ENTRIES) };
}

function normalizeDraft(draft: MorpheusMemoryDraft): MorpheusMemoryDraft {
  const title = draft.title.trim();
  const text = draft.text.trim();
  if (!title || title.length > 80) throw new Error('Memory title must be between 1 and 80 characters');
  if (!text || text.length > MORPHEUS_MEMORY_MAX_TEXT) throw new Error('Memory text is outside the allowed size');
  if (!['preference', 'project-context', 'routine', 'decision'].includes(draft.kind)) throw new Error('Invalid memory kind');
  if (!['normal', 'sensitive'].includes(draft.sensitivity)) throw new Error('Invalid memory sensitivity');
  if (!['allowed', 'local-only'].includes(draft.providerUse)) throw new Error('Invalid memory provider policy');
  return { ...draft, title, text };
}

export function createMorpheusMemoryStore(options: {
  userDataDir: string;
  now?: () => Date;
  createId?: () => string;
}): MorpheusMemoryStore {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => `memory-${randomUUID()}`);
  const file = join(options.userDataDir, 'morpheus', 'memory.json');
  const loaded = readValidatedJson(file, validateStored);
  const byId = new Map<string, MorpheusMemory>(
    (loaded?.memories ?? []).map((memory) => [memory.memoryId, structuredClone(memory)]),
  );
  const flush = (): void => writeJsonAtomically(file, {
    v: 1,
    memories: [...byId.values()],
  } satisfies StoredMemory);
  const newestFirst = (items: readonly MorpheusMemory[]): MorpheusMemory[] => (
    [...items].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  );

  return {
    list(projectId) {
      const memories = [...byId.values()].filter((memory) => (
        projectId === undefined || memory.projectId === projectId
      ));
      return { memories: newestFirst(memories).map((memory) => structuredClone(memory)) };
    },
    eligibleForPlanning(projectId, limit = 24) {
      return newestFirst([...byId.values()].filter((memory) => (
        memory.enabled
        && memory.sensitivity === 'normal'
        && memory.providerUse === 'allowed'
        && (memory.projectId === undefined || memory.projectId === projectId)
      ))).slice(0, Math.max(0, Math.min(limit, 24))).map((memory) => structuredClone(memory));
    },
    get(memoryId) {
      const memory = byId.get(memoryId);
      return memory ? structuredClone(memory) : undefined;
    },
    save(input) {
      const draft = normalizeDraft(input);
      const memoryId = draft.memoryId ?? createId();
      if (!isMorpheusMemoryId(memoryId)) throw new Error('Invalid generated memory id');
      const existing = byId.get(memoryId);
      if (!existing && byId.size >= MORPHEUS_MEMORY_MAX_ENTRIES) throw new Error('Memory limit reached');
      const timestamp = now().toISOString();
      const memory: MorpheusMemory = {
        v: MORPHEUS_MEMORY_VERSION,
        memoryId,
        title: draft.title,
        text: draft.text,
        kind: draft.kind,
        sensitivity: draft.sensitivity,
        providerUse: draft.providerUse,
        source: existing?.source ?? 'user',
        ...(draft.projectId ? { projectId: draft.projectId } : {}),
        enabled: draft.enabled,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      byId.set(memoryId, memory);
      try {
        flush();
      } catch (error) {
        if (existing) byId.set(memoryId, existing);
        else byId.delete(memoryId);
        throw error;
      }
      return structuredClone(memory);
    },
    remove(memoryId) {
      const memory = byId.get(memoryId);
      if (!memory) return null;
      byId.delete(memoryId);
      try {
        flush();
      } catch (error) {
        byId.set(memoryId, memory);
        throw error;
      }
      return structuredClone(memory);
    },
    countForProject: (projectId) => [...byId.values()].filter((memory) => memory.projectId === projectId).length,
  };
}
