/** Built-in starter Agent Profiles. Data-only and safe in both processes. */
import type { MorpheusActionId } from '../actions/registry';
import {
  MORPHEUS_AGENT_PROFILE_VERSION,
  type MorpheusAgentProfile,
} from '../agent-profile-types';

const CREATED_AT = '2026-08-10T00:00:00.000Z';

const GENERAL_CAPABILITIES = Object.freeze([
  'system.report', 'system.storage', 'system.processes', 'system.notify', 'reminder.schedule',
  'file.createText', 'file.create', 'file.readText', 'file.appendText', 'file.list', 'file.search',
  'file.move', 'file.copy', 'folder.create',
  'app.launch', 'clipboard.readText', 'clipboard.writeText', 'screen.capture',
  'web.openUrl', 'site.verify',
] satisfies readonly MorpheusActionId[]);

const RESEARCH_CAPABILITIES = Object.freeze([
  'system.report', 'system.storage', 'system.notify', 'reminder.schedule',
  'file.createText', 'file.create', 'file.readText', 'file.appendText', 'file.list', 'file.search',
  'clipboard.readText', 'clipboard.writeText', 'web.openUrl', 'site.verify', 'screen.capture',
] satisfies readonly MorpheusActionId[]);

const DEVELOPER_CAPABILITIES = Object.freeze([
  'system.report', 'system.storage', 'system.processes', 'system.notify', 'reminder.schedule',
  'file.createText', 'file.create', 'file.readText', 'file.appendText', 'file.list', 'file.search',
  'file.move', 'file.copy', 'folder.create',
  'app.launch', 'clipboard.readText', 'clipboard.writeText', 'screen.capture',
  'web.openUrl', 'site.verify', 'dev.launchProject',
] satisfies readonly MorpheusActionId[]);

function starter(
  profileId: string,
  name: string,
  description: string,
  instructions: string,
  capabilityIds: readonly MorpheusActionId[],
): MorpheusAgentProfile {
  return Object.freeze({
    v: MORPHEUS_AGENT_PROFILE_VERSION,
    profileId,
    name,
    description,
    instructions,
    // Prefer a configured real provider, with the deterministic interpreter as
    // an honest offline fallback. Both produce the same typed plan contract.
    planner: Object.freeze({ kind: 'auto' as const }),
    workspace: Object.freeze({ rootKey: 'morpheusFiles' as const, access: 'read-write' as const }),
    memory: Object.freeze({ mode: 'workspace' as const, maxContextItems: 32 }),
    permissionBoundary: Object.freeze({
      capabilityIds,
      maxRiskTier: 'high' as const,
    }),
    builtIn: true,
    enabled: true,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
}

export const MORPHEUS_STARTER_AGENT_PROFILES: readonly MorpheusAgentProfile[] = Object.freeze([
  starter(
    'general',
    'General Agent',
    'Handles everyday objectives with broad non-destructive Morpheus capabilities.',
    'Build the smallest truthful plan that completes the objective. Prefer reversible operations and reuse trusted workspace scopes.',
    GENERAL_CAPABILITIES,
  ),
  starter(
    'research',
    'Research Agent',
    'Collects, organizes and preserves findings without broad process authority.',
    'Gather evidence, keep sources and artifacts explicit, and distinguish known facts from inference.',
    RESEARCH_CAPABILITIES,
  ),
  starter(
    'developer',
    'Developer Agent',
    'Works inside the approved Morpheus workspace with bounded developer tools.',
    'Inspect before changing, preserve existing behavior, and validate every produced artifact. Never invent shell authority.',
    DEVELOPER_CAPABILITIES,
  ),
]);

export function getStarterAgentProfile(profileId: string): MorpheusAgentProfile | undefined {
  return MORPHEUS_STARTER_AGENT_PROFILES.find((profile) => profile.profileId === profileId);
}
