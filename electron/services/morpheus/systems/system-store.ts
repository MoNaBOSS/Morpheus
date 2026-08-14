import { join } from 'node:path';

import { isMorpheusActionId } from '@shared/morpheus/actions/registry';
import { isMorpheusProjectId } from '@shared/morpheus/project-types';
import {
  MORPHEUS_SYSTEM_VERSION,
  isMorpheusSystemId,
  type MorpheusSystem,
  type MorpheusSystemRun,
  type MorpheusSystemsSnapshot,
} from '@shared/morpheus/system-types';
import { isMorpheusWorkspaceId } from '@shared/morpheus/workspace-types';

import { readValidatedJson, writeJsonAtomically } from '../storage/atomic-json';

const MAX_SYSTEMS = 100;
const MAX_HISTORY = 50;
const MAX_SCHEDULES = 32;
const STATUSES = ['draft', 'tested', 'active', 'paused', 'invalid'] as const;
const RUN_KINDS = ['test', 'manual'] as const;
const RUN_STATUSES = ['completed', 'partially-completed', 'failed', 'rejected', 'cancelled'] as const;

type StoredSystems = { v: 1; systems: MorpheusSystem[] };

export interface MorpheusSystemStore {
  list(): MorpheusSystemsSnapshot;
  get(systemId: string): MorpheusSystem | undefined;
  save(system: MorpheusSystem): MorpheusSystem;
  remove(systemId: string): MorpheusSystem | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validIso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validLogicalId(value: unknown, max = 100): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]+$/i.test(value) && value.length <= max;
}

function validArtifactId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9:_-]{0,139}$/i.test(value);
}

function validateRun(value: unknown): MorpheusSystemRun | null {
  if (!isRecord(value)
    || !validLogicalId(value.runId, 120)
    || !RUN_KINDS.includes(value.kind as typeof RUN_KINDS[number])
    || !RUN_STATUSES.includes(value.status as typeof RUN_STATUSES[number])
    || !validIso(value.startedAt)
    || !validIso(value.completedAt)
    || !Array.isArray(value.artifactIds)
    || value.artifactIds.length > 100
    || value.artifactIds.some((id) => !validArtifactId(id))) return null;
  for (const key of ['objectiveRunId', 'missionId'] as const) {
    if (value[key] !== undefined && !validLogicalId(value[key], 120)) return null;
  }
  if (value.error !== undefined && (typeof value.error !== 'string' || value.error.length > 500)) return null;
  return structuredClone(value) as MorpheusSystemRun;
}

export function validateMorpheusSystem(value: unknown): MorpheusSystem | null {
  if (!isRecord(value)
    || value.v !== MORPHEUS_SYSTEM_VERSION
    || !isMorpheusSystemId(value.systemId)
    || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100
    || typeof value.description !== 'string' || value.description.length > 500
    || !validLogicalId(value.workflowId, 64)
    || !validLogicalId(value.agentProfileId, 64)
    || !isMorpheusWorkspaceId(value.workspaceId)
    || (value.projectId !== undefined && !isMorpheusProjectId(value.projectId))
    || !Array.isArray(value.scheduleIds) || value.scheduleIds.length > MAX_SCHEDULES
    || value.scheduleIds.some((id) => !validLogicalId(id, 100))
    || new Set(value.scheduleIds).size !== value.scheduleIds.length
    || !Array.isArray(value.capabilityIds) || value.capabilityIds.length < 1
    || value.capabilityIds.some((id) => !isMorpheusActionId(id))
    || new Set(value.capabilityIds).size !== value.capabilityIds.length
    || !isRecord(value.outputs)
    || typeof value.outputs.collectArtifacts !== 'boolean'
    || typeof value.outputs.retainHistory !== 'boolean'
    || !STATUSES.includes(value.status as typeof STATUSES[number])
    || typeof value.testFingerprint !== 'string' || !/^[a-f0-9]{32}$/.test(value.testFingerprint)
    || !Array.isArray(value.runHistory) || value.runHistory.length > MAX_HISTORY
    || !validIso(value.createdAt) || !validIso(value.updatedAt)) return null;
  for (const key of ['lastTestedAt'] as const) {
    if (value[key] !== undefined && !validIso(value[key])) return null;
  }
  for (const key of ['lastTestObjectiveRunId', 'lastTestMissionId'] as const) {
    if (value[key] !== undefined && !validLogicalId(value[key], 120)) return null;
  }
  if (value.lastTestStatus !== undefined
    && !RUN_STATUSES.includes(value.lastTestStatus as typeof RUN_STATUSES[number])) return null;
  if (value.invalidReason !== undefined
    && (typeof value.invalidReason !== 'string' || value.invalidReason.length > 500)) return null;
  const history = value.runHistory.map(validateRun);
  if (history.some((entry) => !entry)) return null;
  return { ...(structuredClone(value) as MorpheusSystem), runHistory: history as MorpheusSystemRun[] };
}

function validateStored(value: unknown): StoredSystems | null {
  if (!isRecord(value) || value.v !== 1 || !Array.isArray(value.systems)) return null;
  const systems = value.systems.map(validateMorpheusSystem);
  if (systems.some((system) => !system) || systems.length > MAX_SYSTEMS) return null;
  return { v: 1, systems: systems as MorpheusSystem[] };
}

export function createMorpheusSystemStore(options: { userDataDir: string }): MorpheusSystemStore {
  const file = join(options.userDataDir, 'morpheus', 'systems.json');
  const loaded = readValidatedJson(file, validateStored);
  const byId = new Map<string, MorpheusSystem>();
  for (const system of loaded?.systems ?? []) byId.set(system.systemId, structuredClone(system));

  const flush = (): void => writeJsonAtomically(file, { v: 1, systems: [...byId.values()] } satisfies StoredSystems);
  return {
    list: () => ({
      systems: [...byId.values()]
        .sort((a, b) => {
          const rank = { active: 0, tested: 1, paused: 2, draft: 3, invalid: 4 } as const;
          return rank[a.status] - rank[b.status] || b.updatedAt.localeCompare(a.updatedAt);
        })
        .map((system) => structuredClone(system)),
    }),
    get(systemId) {
      const system = byId.get(systemId);
      return system ? structuredClone(system) : undefined;
    },
    save(system) {
      const valid = validateMorpheusSystem(system);
      if (!valid) throw new Error('Invalid Morpheus System');
      const existing = byId.get(valid.systemId);
      if (!existing && byId.size >= MAX_SYSTEMS) throw new Error('System limit reached');
      byId.set(valid.systemId, structuredClone(valid));
      try { flush(); } catch (error) {
        if (existing) byId.set(existing.systemId, existing); else byId.delete(valid.systemId);
        throw error;
      }
      return structuredClone(valid);
    },
    remove(systemId) {
      const existing = byId.get(systemId);
      if (!existing) return null;
      byId.delete(systemId);
      try { flush(); } catch (error) { byId.set(systemId, existing); throw error; }
      return structuredClone(existing);
    },
  };
}
