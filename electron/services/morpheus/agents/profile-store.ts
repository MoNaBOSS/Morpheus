import { join } from 'node:path';

import {
  MORPHEUS_STARTER_AGENT_PROFILES,
} from '@shared/morpheus/agents/registry';
import type {
  AgentProfilesSnapshot,
  MorpheusAgentProfile,
} from '@shared/morpheus/agent-profile-types';
import {
  getMorpheusActionDescriptor,
  isMorpheusActionId,
  type MorpheusRiskTier,
} from '@shared/morpheus/actions/registry';

import { readValidatedJson, writeJsonAtomically } from '../storage/atomic-json';

type StoredProfiles = { v: 1; profiles: MorpheusAgentProfile[] };

export interface MorpheusAgentProfileStore {
  list(): AgentProfilesSnapshot;
  get(profileId: string): MorpheusAgentProfile | undefined;
  save(profile: MorpheusAgentProfile): MorpheusAgentProfile;
  resetBuiltIns(): AgentProfilesSnapshot;
}

const RISK_ORDER: Record<MorpheusRiskTier, number> = {
  low: 0, medium: 1, high: 2, critical: 3,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateProfile(value: unknown): MorpheusAgentProfile | null {
  if (!isPlainObject(value)) return null;
  if (value.v !== 1 || typeof value.profileId !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(value.profileId)) return null;
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80) return null;
  if (typeof value.description !== 'string' || value.description.length > 300) return null;
  if (typeof value.instructions !== 'string' || value.instructions.length > 8000) return null;
  if (typeof value.enabled !== 'boolean' || typeof value.builtIn !== 'boolean') return null;
  if (typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') return null;
  if (!isPlainObject(value.workspace) || value.workspace.rootKey !== 'morpheusFiles'
    || !['read', 'read-write'].includes(String(value.workspace.access))) return null;
  if (!isPlainObject(value.memory) || !['none', 'session', 'workspace'].includes(String(value.memory.mode))
    || typeof value.memory.maxContextItems !== 'number'
    || value.memory.maxContextItems < 0 || value.memory.maxContextItems > 200) return null;
  if (!isPlainObject(value.planner) || !['deterministic', 'openclaw', 'provider'].includes(String(value.planner.kind))) return null;
  if (value.planner.kind === 'openclaw' && (typeof value.planner.agentId !== 'string' || !value.planner.agentId)) return null;
  if (value.planner.kind === 'provider'
    && (typeof value.planner.providerId !== 'string' || !value.planner.providerId
      || typeof value.planner.modelId !== 'string' || !value.planner.modelId)) return null;
  if (!isPlainObject(value.permissionBoundary)
    || !Array.isArray(value.permissionBoundary.capabilityIds)
    || !['low', 'medium', 'high', 'critical'].includes(String(value.permissionBoundary.maxRiskTier))) return null;

  const maxRisk = value.permissionBoundary.maxRiskTier as MorpheusRiskTier;
  const capabilities = value.permissionBoundary.capabilityIds;
  if (capabilities.length > 64 || capabilities.some((id) => !isMorpheusActionId(id))) return null;
  if (capabilities.some((id) => RISK_ORDER[getMorpheusActionDescriptor(id).riskTier] > RISK_ORDER[maxRisk])) return null;

  return value as MorpheusAgentProfile;
}

function validateStored(value: unknown): StoredProfiles | null {
  if (!isPlainObject(value) || value.v !== 1 || !Array.isArray(value.profiles)) return null;
  const profiles = value.profiles.map(validateProfile);
  if (profiles.some((entry) => !entry)) return null;
  return { v: 1, profiles: profiles as MorpheusAgentProfile[] };
}

function copyProfile(profile: MorpheusAgentProfile): MorpheusAgentProfile {
  return structuredClone(profile);
}

export function createMorpheusAgentProfileStore(options: { userDataDir: string }): MorpheusAgentProfileStore {
  const file = join(options.userDataDir, 'morpheus', 'agent-profiles.json');
  const loaded = readValidatedJson(file, validateStored);
  const byId = new Map<string, MorpheusAgentProfile>();

  for (const starter of MORPHEUS_STARTER_AGENT_PROFILES) byId.set(starter.profileId, copyProfile(starter));
  for (const stored of loaded?.profiles ?? []) {
    const starter = MORPHEUS_STARTER_AGENT_PROFILES.find((item) => item.profileId === stored.profileId);
    byId.set(stored.profileId, {
      ...copyProfile(stored),
      // A profile cannot turn itself from built-in into an unrelated object.
      builtIn: Boolean(starter),
      createdAt: starter?.createdAt ?? stored.createdAt,
    });
  }

  const flush = (): void => writeJsonAtomically(file, { v: 1, profiles: [...byId.values()] });
  const snapshot = (): AgentProfilesSnapshot => ({
    profiles: [...byId.values()].map(({ instructions: _instructions, createdAt: _createdAt, ...summary }) => structuredClone(summary)),
  });

  return {
    list: snapshot,
    get: (profileId) => {
      const profile = byId.get(profileId);
      return profile ? copyProfile(profile) : undefined;
    },
    save(profile) {
      const valid = validateProfile(profile);
      if (!valid) throw new Error('Invalid Morpheus Agent Profile');
      const existing = byId.get(valid.profileId);
      const next = {
        ...copyProfile(valid),
        builtIn: existing?.builtIn ?? false,
        createdAt: existing?.createdAt ?? valid.createdAt,
      };
      byId.set(next.profileId, next);
      flush();
      return copyProfile(next);
    },
    resetBuiltIns() {
      for (const starter of MORPHEUS_STARTER_AGENT_PROFILES) byId.set(starter.profileId, copyProfile(starter));
      flush();
      return snapshot();
    },
  };
}

export { validateProfile as validateMorpheusAgentProfile };

