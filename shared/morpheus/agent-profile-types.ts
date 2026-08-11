/**
 * Platform-neutral Morpheus Agent Profile contract.
 *
 * An Agent Profile narrows planning context and capability choice. It is not an
 * operating-system principal and never owns grants: every plan it produces is
 * still resolved and permissioned by Electron Main.
 */
import type { MorpheusActionId, MorpheusRiskTier, MorpheusRootKey } from './actions/registry';

export const MORPHEUS_AGENT_PROFILE_VERSION = 1 as const;

export type AgentPlannerBinding =
  | { kind: 'auto' }
  | { kind: 'deterministic' }
  | { kind: 'openclaw'; agentId: string; modelId?: string }
  | { kind: 'provider'; providerId: string; modelId: string };

export type AgentMemoryPolicy = {
  mode: 'none' | 'session' | 'workspace';
  maxContextItems: number;
};

export type AgentWorkspacePolicy = {
  rootKey: MorpheusRootKey;
  access: 'read' | 'read-write';
};

export type AgentPermissionBoundary = {
  /** A frozen allowlist. It can narrow execution, never widen Main policy. */
  capabilityIds: readonly MorpheusActionId[];
  maxRiskTier: MorpheusRiskTier;
};

export type MorpheusAgentProfile = {
  v: typeof MORPHEUS_AGENT_PROFILE_VERSION;
  profileId: string;
  name: string;
  description: string;
  instructions: string;
  planner: AgentPlannerBinding;
  workspace: AgentWorkspacePolicy;
  memory: AgentMemoryPolicy;
  permissionBoundary: AgentPermissionBoundary;
  builtIn: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AgentProfileSummary = Pick<
  MorpheusAgentProfile,
  'profileId' | 'name' | 'description' | 'planner' | 'workspace' | 'memory'
  | 'permissionBoundary' | 'builtIn' | 'enabled' | 'updatedAt'
>;

export type AgentProfilesSnapshot = {
  profiles: readonly AgentProfileSummary[];
};
