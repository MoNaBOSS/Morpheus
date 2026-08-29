/**
 * Typed host-invoke surface for Morpheus native actions.
 *
 * This is the trust boundary. Everything arriving here came from the Renderer
 * and is treated as untrusted: parameters are matched against an explicit
 * whitelist derived from the action registry, and unknown keys are REJECTED
 * rather than ignored, so a payload that smuggles an extra field fails loudly
 * instead of being silently dropped.
 */
import { randomUUID } from 'node:crypto';

import {
  MORPHEUS_MAX_AUDIT_PAGE,
  getMorpheusActionDescriptor,
  isMorpheusActionId,
  type MorpheusRiskTier,
} from '@shared/morpheus/actions/registry';
import type {
  MorpheusAcknowledgement,
  MorpheusActionParams,
  MorpheusAuditRecentPayload,
  MorpheusAuditRecentResult,
  MorpheusAuditQueryPayload,
  MorpheusAuditQueryResult,
  MorpheusCancelActionPayload,
  MorpheusDescribeActionsResult,
  MorpheusRequestActionPayload,
  MorpheusRequestActionResult,
  MorpheusRespondPermissionPayload,
  MorpheusSystemInfo,
} from '@shared/morpheus/action-types';

import { shell } from 'electron';

import {
  EXECUTION_ORIGIN_TYPES,
  type ExecutionOriginType,
} from '@shared/morpheus/execution-types';
import {
  PERMISSION_DECISION_KINDS,
  PERMISSION_PROFILES,
  type PermissionCenterSnapshot,
  type PermissionProfile,
} from '@shared/morpheus/permission-types';
import { createDeterministicMorpheusPlanner } from '@shared/morpheus/interpreter/deterministic-planner';
import type { MorpheusPlanner } from '@shared/morpheus/planner';
import { validateParams } from '@shared/morpheus/capabilities/params';

import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import type {
  MorpheusRuntime,
  MorpheusGrantStore,
  MorpheusAgentProfileStore,
  MorpheusWorkflowService,
  MorpheusScheduler,
  MorpheusRuntimeControlService,
  MorpheusMissionStore,
  MorpheusProjectStore,
  MorpheusMemoryStore,
  MorpheusOnboardingStore,
  MorpheusGoalService,
  MorpheusProactiveService,
  MorpheusSystemService,
} from './morpheus';
import type { MorpheusScheduleDraft, MorpheusScheduleTrigger } from '@shared/morpheus/schedule-types';
import type { MorpheusAuditSink } from './morpheus/audit';
import type { MorpheusObjectiveOrchestrator } from './morpheus/core/objective-orchestrator';
import type {
  CancelMorpheusObjectivePayload,
  CorrectMorpheusObjectivePayload,
  SubmitMorpheusObjectivePayload,
} from '@shared/morpheus/core/objective-types';
import {
  MORPHEUS_VOICE_MAX_AUDIO_BYTES,
  MORPHEUS_VOICE_MAX_DURATION_MS,
  MORPHEUS_VOICE_MIME_TYPES,
  MORPHEUS_AMBIENT_MAX_SILENCE_MS,
  MORPHEUS_AMBIENT_MAX_UTTERANCE_MS,
  MORPHEUS_AMBIENT_MIN_SILENCE_MS,
  MORPHEUS_AMBIENT_MIN_UTTERANCE_MS,
  MORPHEUS_AMBIENT_WAKE_PHRASE_PATTERN,
  MORPHEUS_SPEECH_MAX_TEXT_CHARS,
  MORPHEUS_SPEECH_VOICES,
  type MorpheusTranscribeAudioPayload,
  type MorpheusSynthesizeSpeechPayload,
  type MorpheusVoiceSettingsPatch,
} from '@shared/morpheus/voice-types';
import type { MorpheusVoiceService } from './morpheus/voice/voice-service';
import type { SetMorpheusRuntimePausedPayload } from '@shared/morpheus/runtime-control-types';
import {
  isMorpheusWorkspaceId,
  type AddMorpheusWorkspacePayload,
  type MorpheusWorkspaceIdPayload,
  type UpdateMorpheusWorkspacePayload,
} from '@shared/morpheus/workspace-types';
import type { MorpheusWorkspaceStore } from './morpheus/workspaces/workspace-store';
import {
  MORPHEUS_AGENT_PROFILE_VERSION,
  type AgentPlannerBinding,
  type MorpheusAgentProfileDraft,
} from '@shared/morpheus/agent-profile-types';
import {
  MORPHEUS_WORKFLOW_VERSION,
  type MorpheusWorkflowDraft,
  type MorpheusWorkflowStep,
  type WorkflowTriggerType,
} from '@shared/morpheus/workflow-types';
import {
  isMorpheusMissionId,
  type MorpheusMissionIdPayload,
} from '@shared/morpheus/mission-types';
import {
  isMorpheusProjectId,
  type MorpheusProjectDraft,
  type MorpheusProjectIdPayload,
} from '@shared/morpheus/project-types';
import {
  isMorpheusMemoryId,
  type MorpheusMemoryDraft,
  type MorpheusMemoryIdPayload,
} from '@shared/morpheus/memory-types';
import type { CompleteMorpheusOnboardingPayload } from '@shared/morpheus/onboarding-types';
import {
  MORPHEUS_INTERACTION_MODES,
  MORPHEUS_INTERACTION_SURFACES,
  routeMorpheusInteraction,
  type RouteMorpheusInteractionPayload,
} from '@shared/morpheus/operator-types';
import type { MorpheusCompanionSurfaceStatus } from '@shared/morpheus/companion-types';
import {
  isMorpheusGoalId,
  type MorpheusGoalDraft,
} from '@shared/morpheus/goal-types';
import {
  isMorpheusAttentionId,
  type CreateMorpheusReminderPayload,
  type MorpheusProactiveSettingsPatch,
} from '@shared/morpheus/proactive-types';
import {
  isMorpheusSystemId,
  type CreateMorpheusSystemFromMissionPayload,
  type MorpheusSystemDraft,
} from '@shared/morpheus/system-types';

const MORPHEUS_RISK_ORDER: Record<MorpheusRiskTier, number> = {
  low: 0, medium: 1, high: 2, critical: 3,
};

export class MorpheusValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MorpheusValidationError';
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MorpheusValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new MorpheusValidationError(`${label} must be a non-empty string`);
  }
  return value;
}

function assertNoUnknownKeys(record: Record<string, unknown>, allowed: string[], label: string): void {
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      throw new MorpheusValidationError(`${label} contains an unsupported key: ${key}`);
    }
  }
}

/**
 * Validates the request envelope and narrows the parameters to exactly the keys
 * the registry declares for that action. A parameter the descriptor does not
 * name cannot reach a capability.
 */
export function validateRequestActionPayload(payload: unknown): MorpheusRequestActionPayload {
  const record = requireRecord(payload, 'requestAction payload');
  assertNoUnknownKeys(record, ['actionId', 'params', 'originType', 'agentId', 'workspaceId'], 'requestAction payload');

  // Origin and agent identity participate in grant scope, so they are validated
  // as strictly as the action itself — an unrecognised origin is rejected, not
  // silently coerced into a broader one.
  if (record.originType !== undefined
    && !EXECUTION_ORIGIN_TYPES.includes(record.originType as ExecutionOriginType)) {
    throw new MorpheusValidationError('unsupported originType');
  }
  if (record.agentId !== undefined && typeof record.agentId !== 'string') {
    throw new MorpheusValidationError('agentId must be a string');
  }
  if (record.workspaceId !== undefined && !isMorpheusWorkspaceId(record.workspaceId)) {
    throw new MorpheusValidationError('invalid workspaceId');
  }

  const actionId = requireNonEmptyString(record.actionId, 'actionId');
  if (!isMorpheusActionId(actionId)) {
    throw new MorpheusValidationError(`Unknown action: ${actionId}`);
  }

  const descriptor = getMorpheusActionDescriptor(actionId);
  const origin = record.originType as ExecutionOriginType | undefined;
  const agentId = record.agentId as string | undefined;

  // One generic validator drives every capability from its declared parameter
  // kinds. Adding a capability adds descriptors, not validation code — which is
  // what keeps this trust boundary reviewable as the set grows.
  const validation = validateParams(descriptor.params, record.params);
  if (!validation.ok) {
    const detail = validation.errors.map((e) => `${e.key} ${e.reason}`).join('; ');
    throw new MorpheusValidationError(`Invalid parameters: ${detail}`);
  }

  return {
    actionId,
    params: validation.params as MorpheusActionParams,
    ...(origin ? { originType: origin } : {}),
    ...(agentId ? { agentId } : {}),
    ...(record.workspaceId ? { workspaceId: record.workspaceId as string } : {}),
  };
}

export function validateRespondPermissionPayload(payload: unknown): MorpheusRespondPermissionPayload {
  const record = requireRecord(payload, 'respondPermission payload');
  assertNoUnknownKeys(record, ['runId', 'decision'], 'respondPermission payload');
  const runId = requireNonEmptyString(record.runId, 'runId');
  const decision = record.decision;
  // The five decision kinds, plus the 0.1 wire values which Main normalises.
  const accepted = [...PERMISSION_DECISION_KINDS, 'granted', 'denied'];
  if (typeof decision !== 'string' || !accepted.includes(decision)) {
    throw new MorpheusValidationError(
      `decision must be one of: ${accepted.join(', ')}`,
    );
  }
  return { runId, decision: decision as MorpheusRespondPermissionPayload['decision'] };
}

export function validateCancelActionPayload(payload: unknown): MorpheusCancelActionPayload {
  const record = requireRecord(payload, 'cancelAction payload');
  assertNoUnknownKeys(record, ['runId'], 'cancelAction payload');
  return { runId: requireNonEmptyString(record.runId, 'runId') };
}

export function validateAuditRecentPayload(payload: unknown): MorpheusAuditRecentPayload {
  if (payload === undefined || payload === null) return {};
  const record = requireRecord(payload, 'auditRecent payload');
  assertNoUnknownKeys(record, ['limit'], 'auditRecent payload');
  if (record.limit === undefined) return {};
  if (typeof record.limit !== 'number' || !Number.isFinite(record.limit)) {
    throw new MorpheusValidationError('limit must be a finite number');
  }
  return { limit: Math.min(Math.max(1, Math.trunc(record.limit)), MORPHEUS_MAX_AUDIT_PAGE) };
}

export type CreateMorpheusApiOptions = {
  runtime: MorpheusRuntime;
  grants: MorpheusGrantStore;
  agentProfiles: MorpheusAgentProfileStore;
  workflows: MorpheusWorkflowService;
  scheduler: MorpheusScheduler;
  objectives: MorpheusObjectiveOrchestrator;
  missions: MorpheusMissionStore;
  projects: MorpheusProjectStore;
  memory: MorpheusMemoryStore;
  onboarding: MorpheusOnboardingStore;
  goals: MorpheusGoalService;
  proactive: MorpheusProactiveService;
  systems: MorpheusSystemService;
  companionSurface: {
    status(): MorpheusCompanionSurfaceStatus;
    dismiss(): MorpheusCompanionSurfaceStatus;
    expand(): MorpheusCompanionSurfaceStatus;
  };
  voice: MorpheusVoiceService;
  runtimeControl: MorpheusRuntimeControlService;
  workspaces: MorpheusWorkspaceStore;
  audit: MorpheusAuditSink;
  filesRoot: string;
  appVersion: string;
  auditHealth: () => 'healthy' | 'degraded';
  /** Main-owned native picker. Renderer can never supply a directory path. */
  selectWorkspaceDirectory: () => Promise<string | null>;
  /** Main-owned Windows setup side effects; renderer supplies booleans only. */
  applyDesktopSetup?: (preferences: { launchAtStartup: boolean }) => Promise<void>;
  now?: () => Date;
  /** Main-owned adapter boundary; raw provider output never enters here directly. */
  planner?: MorpheusPlanner;
};

export function validateSubmitObjectivePayload(payload: unknown): SubmitMorpheusObjectivePayload {
  const record = requireRecord(payload, 'submitObjective payload');
  assertNoUnknownKeys(record, ['objective', 'originType', 'workspaceId', 'agentProfileId', 'projectId'], 'submitObjective payload');
  const objective = requireNonEmptyString(record.objective, 'objective').trim();
  if (!objective || objective.length > 4_000) throw new MorpheusValidationError('objective must be between 1 and 4000 characters');
  const originType = record.originType ?? 'command-bar';
  if (!['command-bar', 'quick-command', 'voice', 'chat'].includes(String(originType))) {
    throw new MorpheusValidationError('unsupported objective originType');
  }
  const optionalId = (value: unknown, label: string): string | undefined => {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(value)) {
      throw new MorpheusValidationError(`invalid ${label}`);
    }
    return value;
  };
  if (record.workspaceId !== undefined && !isMorpheusWorkspaceId(record.workspaceId)) {
    throw new MorpheusValidationError('invalid workspaceId');
  }
  const agentProfileId = optionalId(record.agentProfileId, 'agentProfileId');
  if (record.projectId !== undefined && !isMorpheusProjectId(record.projectId)) {
    throw new MorpheusValidationError('invalid projectId');
  }
  return {
    objective,
    originType: originType as SubmitMorpheusObjectivePayload['originType'],
    ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
    ...(agentProfileId ? { agentProfileId } : {}),
    ...(record.projectId ? { projectId: record.projectId } : {}),
  };
}

export function validateRouteInteractionPayload(payload: unknown): RouteMorpheusInteractionPayload {
  const record = requireRecord(payload, 'routeInteraction payload');
  assertNoUnknownKeys(record, ['text', 'mode', 'surface'], 'routeInteraction payload');
  const text = requireNonEmptyString(record.text, 'interaction text').trim();
  if (!text || text.length > 4_000) {
    throw new MorpheusValidationError('interaction text must be between 1 and 4000 characters');
  }
  if (!MORPHEUS_INTERACTION_MODES.includes(record.mode as never)) {
    throw new MorpheusValidationError('unsupported interaction mode');
  }
  if (!MORPHEUS_INTERACTION_SURFACES.includes(record.surface as never)) {
    throw new MorpheusValidationError('unsupported interaction surface');
  }
  return {
    text,
    mode: record.mode as RouteMorpheusInteractionPayload['mode'],
    surface: record.surface as RouteMorpheusInteractionPayload['surface'],
  };
}

export function validateMissionIdPayload(payload: unknown): MorpheusMissionIdPayload {
  const record = requireRecord(payload, 'Mission payload');
  assertNoUnknownKeys(record, ['missionId'], 'Mission payload');
  if (!isMorpheusMissionId(record.missionId)) throw new MorpheusValidationError('invalid Mission id');
  return { missionId: record.missionId };
}

export function validateProjectIdPayload(payload: unknown): MorpheusProjectIdPayload {
  const record = requireRecord(payload, 'Project payload');
  assertNoUnknownKeys(record, ['projectId'], 'Project payload');
  if (!isMorpheusProjectId(record.projectId)) throw new MorpheusValidationError('invalid Project id');
  return { projectId: record.projectId };
}

export function validateProjectDraft(payload: unknown): MorpheusProjectDraft {
  const record = requireRecord(payload, 'saveProject payload');
  assertNoUnknownKeys(record, [
    'projectId', 'name', 'description', 'workspaceId', 'instructions', 'enabled',
  ], 'saveProject payload');
  if (record.projectId !== undefined && !isMorpheusProjectId(record.projectId)) {
    throw new MorpheusValidationError('invalid Project id');
  }
  if (!isMorpheusWorkspaceId(record.workspaceId)) throw new MorpheusValidationError('invalid Project workspaceId');
  if (typeof record.enabled !== 'boolean') throw new MorpheusValidationError('Project enabled must be boolean');
  return {
    ...(record.projectId ? { projectId: record.projectId } : {}),
    name: boundedText(record.name, 'Project name', 80, false).trim(),
    description: boundedText(record.description, 'Project description', 400).trim(),
    workspaceId: record.workspaceId,
    instructions: boundedText(record.instructions, 'Project context', 2_000).trim(),
    enabled: record.enabled,
  };
}

export function validateGoalIdPayload(payload: unknown): { goalId: string } {
  const record = requireRecord(payload, 'Goal payload');
  assertNoUnknownKeys(record, ['goalId'], 'Goal payload');
  if (!isMorpheusGoalId(record.goalId)) throw new MorpheusValidationError('invalid Goal id');
  return { goalId: record.goalId };
}

export function validateGoalDraft(payload: unknown): MorpheusGoalDraft {
  const record = requireRecord(payload, 'saveGoal payload');
  assertNoUnknownKeys(record, [
    'goalId', 'name', 'objective', 'successCriteria', 'status', 'targetDate',
    'projectId', 'workspaceId', 'agentProfileId', 'nextAction', 'milestones',
  ], 'saveGoal payload');
  if (record.goalId !== undefined && !isMorpheusGoalId(record.goalId)) throw new MorpheusValidationError('invalid Goal id');
  if (!['active', 'paused', 'completed', 'abandoned'].includes(String(record.status))) {
    throw new MorpheusValidationError('invalid Goal status');
  }
  if (!isMorpheusProjectId(record.projectId)) throw new MorpheusValidationError('invalid Goal Project id');
  if (!isMorpheusWorkspaceId(record.workspaceId)) throw new MorpheusValidationError('invalid Goal workspace id');
  if (typeof record.agentProfileId !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(record.agentProfileId)) {
    throw new MorpheusValidationError('invalid Goal Agent Profile id');
  }
  if (record.targetDate !== undefined && (typeof record.targetDate !== 'string'
    || !/^\d{4}-\d{2}-\d{2}$/.test(record.targetDate)
    || !Number.isFinite(Date.parse(`${record.targetDate}T00:00:00`)))) {
    throw new MorpheusValidationError('invalid Goal target date');
  }
  if (!Array.isArray(record.milestones) || record.milestones.length > 50) {
    throw new MorpheusValidationError('invalid Goal milestones');
  }
  const milestones = record.milestones.map((value, index) => {
    const milestone = requireRecord(value, `Goal milestone ${index + 1}`);
    assertNoUnknownKeys(milestone, ['milestoneId', 'title', 'status', 'targetDate'], `Goal milestone ${index + 1}`);
    if (milestone.milestoneId !== undefined && (typeof milestone.milestoneId !== 'string'
      || !/^milestone-[a-z0-9][a-z0-9-]{0,95}$/i.test(milestone.milestoneId))) {
      throw new MorpheusValidationError('invalid Goal milestone id');
    }
    if (!['pending', 'in-progress', 'completed', 'skipped'].includes(String(milestone.status))) {
      throw new MorpheusValidationError('invalid Goal milestone status');
    }
    if (milestone.targetDate !== undefined && (typeof milestone.targetDate !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(milestone.targetDate)
      || !Number.isFinite(Date.parse(`${milestone.targetDate}T00:00:00`)))) {
      throw new MorpheusValidationError('invalid Goal milestone target date');
    }
    return {
      ...(milestone.milestoneId ? { milestoneId: milestone.milestoneId } : {}),
      title: boundedText(milestone.title, 'Goal milestone title', 160, false).trim(),
      status: milestone.status as MorpheusGoalDraft['milestones'][number]['status'],
      ...(milestone.targetDate ? { targetDate: milestone.targetDate } : {}),
    };
  });
  return {
    ...(record.goalId ? { goalId: record.goalId } : {}),
    name: boundedText(record.name, 'Goal name', 100, false).trim(),
    objective: boundedText(record.objective, 'Goal objective', 2_000, false).trim(),
    successCriteria: boundedText(record.successCriteria, 'Goal success criteria', 2_000).trim(),
    status: record.status as MorpheusGoalDraft['status'],
    ...(record.targetDate ? { targetDate: record.targetDate } : {}),
    projectId: record.projectId,
    workspaceId: record.workspaceId,
    agentProfileId: record.agentProfileId,
    nextAction: boundedText(record.nextAction, 'Goal next action', 2_000).trim(),
    milestones,
  };
}

export function validateProactiveSettingsPatch(payload: unknown): MorpheusProactiveSettingsPatch {
  const record = requireRecord(payload, 'updateProactiveSettings payload');
  assertNoUnknownKeys(record, [
    'enabled', 'notificationsEnabled', 'quietHoursEnabled', 'quietHoursStart', 'quietHoursEnd', 'categories',
  ], 'updateProactiveSettings payload');
  for (const key of ['enabled', 'notificationsEnabled', 'quietHoursEnabled'] as const) {
    if (record[key] !== undefined && typeof record[key] !== 'boolean') {
      throw new MorpheusValidationError(`${key} must be boolean`);
    }
  }
  for (const key of ['quietHoursStart', 'quietHoursEnd'] as const) {
    if (record[key] !== undefined && (typeof record[key] !== 'string'
      || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(record[key]))) {
      throw new MorpheusValidationError(`${key} must be HH:MM`);
    }
  }
  let categories: MorpheusProactiveSettingsPatch['categories'];
  if (record.categories !== undefined) {
    const input = requireRecord(record.categories, 'proactive categories');
    assertNoUnknownKeys(input, ['mission', 'goal', 'schedule', 'routine', 'reminder'], 'proactive categories');
    for (const [key, value] of Object.entries(input)) {
      if (typeof value !== 'boolean') throw new MorpheusValidationError(`${key} category must be boolean`);
    }
    categories = input as MorpheusProactiveSettingsPatch['categories'];
  }
  return {
    ...(record.enabled !== undefined ? { enabled: record.enabled } : {}),
    ...(record.notificationsEnabled !== undefined ? { notificationsEnabled: record.notificationsEnabled } : {}),
    ...(record.quietHoursEnabled !== undefined ? { quietHoursEnabled: record.quietHoursEnabled } : {}),
    ...(record.quietHoursStart ? { quietHoursStart: record.quietHoursStart } : {}),
    ...(record.quietHoursEnd ? { quietHoursEnd: record.quietHoursEnd } : {}),
    ...(categories ? { categories } : {}),
  } as MorpheusProactiveSettingsPatch;
}

export function validateCreateReminderPayload(payload: unknown): CreateMorpheusReminderPayload {
  const record = requireRecord(payload, 'createReminder payload');
  assertNoUnknownKeys(record, ['title', 'detail', 'dueAt', 'suggestedObjective'], 'createReminder payload');
  if (typeof record.dueAt !== 'string' || !Number.isFinite(Date.parse(record.dueAt))) {
    throw new MorpheusValidationError('dueAt must be an ISO date');
  }
  return {
    title: boundedText(record.title, 'reminder title', 160, false).trim(),
    detail: boundedText(record.detail, 'reminder detail', 600).trim(),
    dueAt: new Date(record.dueAt).toISOString(),
    ...(record.suggestedObjective !== undefined
      ? { suggestedObjective: boundedText(record.suggestedObjective, 'reminder objective', 2_000).trim() }
      : {}),
  };
}

export function validateAttentionIdPayload(payload: unknown): { attentionId: string } {
  const record = requireRecord(payload, 'attention payload');
  assertNoUnknownKeys(record, ['attentionId'], 'attention payload');
  if (!isMorpheusAttentionId(record.attentionId)) throw new MorpheusValidationError('invalid attention id');
  return { attentionId: record.attentionId };
}

export function validateSnoozeAttentionPayload(payload: unknown): { attentionId: string; until: string } {
  const record = requireRecord(payload, 'snoozeAttention payload');
  assertNoUnknownKeys(record, ['attentionId', 'until'], 'snoozeAttention payload');
  if (!isMorpheusAttentionId(record.attentionId)) throw new MorpheusValidationError('invalid attention id');
  if (typeof record.until !== 'string' || !Number.isFinite(Date.parse(record.until))) {
    throw new MorpheusValidationError('until must be an ISO date');
  }
  return { attentionId: record.attentionId, until: new Date(record.until).toISOString() };
}

export function validateSystemIdPayload(payload: unknown): { systemId: string } {
  const record = requireRecord(payload, 'System payload');
  assertNoUnknownKeys(record, ['systemId'], 'System payload');
  if (!isMorpheusSystemId(record.systemId)) throw new MorpheusValidationError('invalid System id');
  return { systemId: record.systemId };
}

export function validateSystemDraft(payload: unknown): MorpheusSystemDraft {
  const record = requireRecord(payload, 'saveSystem payload');
  assertNoUnknownKeys(record, [
    'systemId', 'name', 'description', 'workflowId', 'workspaceId', 'projectId',
    'scheduleIds', 'outputs',
  ], 'saveSystem payload');
  if (record.systemId !== undefined && !isMorpheusSystemId(record.systemId)) {
    throw new MorpheusValidationError('invalid System id');
  }
  if (typeof record.workflowId !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(record.workflowId)) {
    throw new MorpheusValidationError('invalid System workflow id');
  }
  if (!isMorpheusWorkspaceId(record.workspaceId)) throw new MorpheusValidationError('invalid System workspace id');
  if (record.projectId !== undefined && !isMorpheusProjectId(record.projectId)) {
    throw new MorpheusValidationError('invalid System Project id');
  }
  if (!Array.isArray(record.scheduleIds) || record.scheduleIds.length > 32
    || record.scheduleIds.some((id) => typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,80}$/.test(id))
    || new Set(record.scheduleIds).size !== record.scheduleIds.length) {
    throw new MorpheusValidationError('invalid System schedule ids');
  }
  const outputs = requireRecord(record.outputs, 'System outputs');
  assertNoUnknownKeys(outputs, ['collectArtifacts', 'retainHistory'], 'System outputs');
  for (const key of ['collectArtifacts', 'retainHistory'] as const) {
    if (typeof outputs[key] !== 'boolean') throw new MorpheusValidationError(`${key} must be boolean`);
  }
  return {
    ...(record.systemId ? { systemId: record.systemId } : {}),
    name: boundedText(record.name, 'System name', 100, false).trim(),
    description: boundedText(record.description, 'System description', 500).trim(),
    workflowId: record.workflowId,
    workspaceId: record.workspaceId,
    ...(record.projectId ? { projectId: record.projectId } : {}),
    scheduleIds: [...record.scheduleIds] as string[],
    outputs: {
      collectArtifacts: outputs.collectArtifacts as boolean,
      retainHistory: outputs.retainHistory as boolean,
    },
  };
}

export function validateCreateSystemFromMissionPayload(payload: unknown): CreateMorpheusSystemFromMissionPayload {
  const record = requireRecord(payload, 'createSystemFromMission payload');
  assertNoUnknownKeys(record, ['missionId', 'name'], 'createSystemFromMission payload');
  if (!isMorpheusMissionId(record.missionId)) throw new MorpheusValidationError('invalid Mission id');
  return {
    missionId: record.missionId,
    ...(record.name !== undefined ? { name: boundedText(record.name, 'System name', 100, false).trim() } : {}),
  };
}

export function validateMemoryIdPayload(payload: unknown): MorpheusMemoryIdPayload {
  const record = requireRecord(payload, 'memory payload');
  assertNoUnknownKeys(record, ['memoryId'], 'memory payload');
  if (!isMorpheusMemoryId(record.memoryId)) throw new MorpheusValidationError('invalid memory id');
  return { memoryId: record.memoryId };
}

export function validateMemoryDraft(payload: unknown): MorpheusMemoryDraft {
  const record = requireRecord(payload, 'saveMemory payload');
  assertNoUnknownKeys(record, [
    'memoryId', 'title', 'text', 'kind', 'sensitivity', 'providerUse', 'projectId', 'enabled',
  ], 'saveMemory payload');
  if (record.memoryId !== undefined && !isMorpheusMemoryId(record.memoryId)) {
    throw new MorpheusValidationError('invalid memory id');
  }
  if (record.projectId !== undefined && !isMorpheusProjectId(record.projectId)) {
    throw new MorpheusValidationError('invalid memory Project id');
  }
  if (!['preference', 'project-context', 'routine', 'decision'].includes(String(record.kind))) {
    throw new MorpheusValidationError('invalid memory kind');
  }
  if (!['normal', 'sensitive'].includes(String(record.sensitivity))) {
    throw new MorpheusValidationError('invalid memory sensitivity');
  }
  if (!['allowed', 'local-only'].includes(String(record.providerUse))) {
    throw new MorpheusValidationError('invalid memory provider policy');
  }
  if (typeof record.enabled !== 'boolean') throw new MorpheusValidationError('memory enabled must be boolean');
  return {
    ...(record.memoryId ? { memoryId: record.memoryId } : {}),
    title: boundedText(record.title, 'memory title', 80, false).trim(),
    text: boundedText(record.text, 'memory text', 1_000, false).trim(),
    kind: record.kind as MorpheusMemoryDraft['kind'],
    sensitivity: record.sensitivity as MorpheusMemoryDraft['sensitivity'],
    providerUse: record.providerUse as MorpheusMemoryDraft['providerUse'],
    ...(record.projectId ? { projectId: record.projectId } : {}),
    enabled: record.enabled,
  };
}

export function validateCompleteOnboardingPayload(payload: unknown): CompleteMorpheusOnboardingPayload {
  const record = requireRecord(payload, 'completeOnboarding payload');
  assertNoUnknownKeys(record, [
    'preferredName', 'speakResponses', 'personality', 'interactionMode',
    'launchAtStartup', 'ambientVoiceEnabled', 'wakePhrase', 'permissionProfile',
    'proactiveCheckIns',
  ], 'completeOnboarding payload');
  if (typeof record.preferredName !== 'string' || record.preferredName.trim().length > 80) {
    throw new MorpheusValidationError('preferredName must be at most 80 characters');
  }
  if (typeof record.speakResponses !== 'boolean') throw new MorpheusValidationError('speakResponses must be boolean');
  if (!['adaptive', 'concise', 'warm', 'witty'].includes(String(record.personality))) {
    throw new MorpheusValidationError('invalid companion personality');
  }
  if (!MORPHEUS_INTERACTION_MODES.includes(record.interactionMode as never)) {
    throw new MorpheusValidationError('invalid default interaction mode');
  }
  if (typeof record.launchAtStartup !== 'boolean') throw new MorpheusValidationError('launchAtStartup must be boolean');
  if (typeof record.ambientVoiceEnabled !== 'boolean') throw new MorpheusValidationError('ambientVoiceEnabled must be boolean');
  if (typeof record.wakePhrase !== 'string'
    || !MORPHEUS_AMBIENT_WAKE_PHRASE_PATTERN.test(record.wakePhrase.trim())) {
    throw new MorpheusValidationError('invalid wake phrase');
  }
  if (!PERMISSION_PROFILES.includes(record.permissionProfile as never)) {
    throw new MorpheusValidationError('invalid permission profile');
  }
  if (typeof record.proactiveCheckIns !== 'boolean') throw new MorpheusValidationError('proactiveCheckIns must be boolean');
  return {
    preferredName: record.preferredName.trim(),
    speakResponses: record.speakResponses,
    personality: record.personality as CompleteMorpheusOnboardingPayload['personality'],
    interactionMode: record.interactionMode as CompleteMorpheusOnboardingPayload['interactionMode'],
    launchAtStartup: record.launchAtStartup,
    ambientVoiceEnabled: record.ambientVoiceEnabled,
    wakePhrase: record.wakePhrase.trim(),
    permissionProfile: record.permissionProfile as PermissionProfile,
    proactiveCheckIns: record.proactiveCheckIns,
  };
}

function validateWorkspaceAccess(value: unknown): 'read' | 'read-write' | undefined {
  if (value === undefined) return undefined;
  if (value !== 'read' && value !== 'read-write') {
    throw new MorpheusValidationError('workspace access must be read or read-write');
  }
  return value;
}

function validateWorkspaceName(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) {
    throw new MorpheusValidationError('workspace name must be between 1 and 80 characters');
  }
  return value.trim();
}

export function validateAddWorkspacePayload(payload: unknown): AddMorpheusWorkspacePayload {
  const record = requireRecord(payload, 'addWorkspace payload');
  assertNoUnknownKeys(record, ['name', 'access'], 'addWorkspace payload');
  const name = validateWorkspaceName(record.name);
  const access = validateWorkspaceAccess(record.access);
  return { ...(name ? { name } : {}), ...(access ? { access } : {}) };
}

export function validateUpdateWorkspacePayload(payload: unknown): UpdateMorpheusWorkspacePayload {
  const record = requireRecord(payload, 'updateWorkspace payload');
  assertNoUnknownKeys(record, ['workspaceId', 'name', 'access', 'enabled'], 'updateWorkspace payload');
  if (!isMorpheusWorkspaceId(record.workspaceId)) throw new MorpheusValidationError('invalid workspaceId');
  if (record.enabled !== undefined && typeof record.enabled !== 'boolean') {
    throw new MorpheusValidationError('workspace enabled must be a boolean');
  }
  const name = validateWorkspaceName(record.name);
  const access = validateWorkspaceAccess(record.access);
  return {
    workspaceId: record.workspaceId,
    ...(name ? { name } : {}),
    ...(access ? { access } : {}),
    ...(record.enabled === undefined ? {} : { enabled: record.enabled }),
  };
}

export function validateWorkspaceIdPayload(payload: unknown): MorpheusWorkspaceIdPayload {
  const record = requireRecord(payload, 'workspace payload');
  assertNoUnknownKeys(record, ['workspaceId'], 'workspace payload');
  if (!isMorpheusWorkspaceId(record.workspaceId)) throw new MorpheusValidationError('invalid workspaceId');
  return { workspaceId: record.workspaceId };
}

function boundedText(
  value: unknown,
  label: string,
  maxLength: number,
  allowEmpty = true,
): string {
  if (typeof value !== 'string' || value.length > maxLength || (!allowEmpty && !value.trim())) {
    throw new MorpheusValidationError(`${label} is invalid`);
  }
  return value;
}

function validatePlannerBinding(value: unknown): AgentPlannerBinding {
  const planner = requireRecord(value, 'Agent Profile planner');
  const kind = planner.kind;
  if (kind === 'auto' || kind === 'deterministic') {
    assertNoUnknownKeys(planner, ['kind'], 'Agent Profile planner');
    return { kind };
  }
  if (kind === 'openclaw') {
    assertNoUnknownKeys(planner, ['kind', 'agentId', 'modelId'], 'Agent Profile planner');
    const agentId = boundedText(planner.agentId, 'OpenClaw agentId', 128, false).trim();
    const modelId = planner.modelId === undefined
      ? undefined
      : boundedText(planner.modelId, 'OpenClaw modelId', 200, false).trim();
    return { kind, agentId, ...(modelId ? { modelId } : {}) };
  }
  if (kind === 'provider') {
    assertNoUnknownKeys(planner, ['kind', 'providerId', 'modelId'], 'Agent Profile planner');
    return {
      kind,
      providerId: boundedText(planner.providerId, 'providerId', 128, false).trim(),
      modelId: boundedText(planner.modelId, 'modelId', 200, false).trim(),
    };
  }
  throw new MorpheusValidationError('unknown Agent Profile planner kind');
}

export function validateAgentProfileDraft(payload: unknown): MorpheusAgentProfileDraft {
  const record = requireRecord(payload, 'saveAgentProfile payload');
  assertNoUnknownKeys(record, [
    'profileId', 'name', 'description', 'instructions', 'planner', 'workspace',
    'memory', 'permissionBoundary', 'enabled',
  ], 'saveAgentProfile payload');
  if (record.profileId !== undefined
    && (typeof record.profileId !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(record.profileId))) {
    throw new MorpheusValidationError('invalid Agent Profile id');
  }
  if (typeof record.enabled !== 'boolean') throw new MorpheusValidationError('Agent Profile enabled must be boolean');
  const workspace = requireRecord(record.workspace, 'Agent Profile workspace');
  assertNoUnknownKeys(workspace, ['rootKey', 'access'], 'Agent Profile workspace');
  if (workspace.rootKey !== 'morpheusFiles' || !['read', 'read-write'].includes(String(workspace.access))) {
    throw new MorpheusValidationError('invalid Agent Profile workspace policy');
  }
  const memory = requireRecord(record.memory, 'Agent Profile memory');
  assertNoUnknownKeys(memory, ['mode', 'maxContextItems'], 'Agent Profile memory');
  if (!['none', 'session', 'workspace'].includes(String(memory.mode))
    || typeof memory.maxContextItems !== 'number' || !Number.isInteger(memory.maxContextItems)
    || memory.maxContextItems < 0 || memory.maxContextItems > 200) {
    throw new MorpheusValidationError('invalid Agent Profile memory policy');
  }
  const permission = requireRecord(record.permissionBoundary, 'Agent Profile permissionBoundary');
  assertNoUnknownKeys(permission, ['capabilityIds', 'maxRiskTier'], 'Agent Profile permissionBoundary');
  if (!Array.isArray(permission.capabilityIds) || permission.capabilityIds.length > 64
    || permission.capabilityIds.some((id) => !isMorpheusActionId(id))) {
    throw new MorpheusValidationError('invalid Agent Profile capability allowlist');
  }
  const capabilityIds = [...new Set(permission.capabilityIds)] as MorpheusAgentProfileDraft['permissionBoundary']['capabilityIds'];
  if (capabilityIds.length !== permission.capabilityIds.length) {
    throw new MorpheusValidationError('duplicate Agent Profile capability');
  }
  if (!['low', 'medium', 'high', 'critical'].includes(String(permission.maxRiskTier))) {
    throw new MorpheusValidationError('invalid Agent Profile maximum risk');
  }
  const maxRiskTier = permission.maxRiskTier as MorpheusRiskTier;
  if (capabilityIds.some((id) => (
    MORPHEUS_RISK_ORDER[getMorpheusActionDescriptor(id).riskTier] > MORPHEUS_RISK_ORDER[maxRiskTier]
  ))) {
    throw new MorpheusValidationError('Agent Profile capability exceeds maximum risk');
  }
  return {
    ...(record.profileId ? { profileId: record.profileId } : {}),
    name: boundedText(record.name, 'Agent Profile name', 80, false).trim(),
    description: boundedText(record.description, 'Agent Profile description', 300),
    instructions: boundedText(record.instructions, 'Agent Profile instructions', 8_000),
    planner: validatePlannerBinding(record.planner),
    workspace: { rootKey: 'morpheusFiles', access: workspace.access as 'read' | 'read-write' },
    memory: {
      mode: memory.mode as 'none' | 'session' | 'workspace',
      maxContextItems: memory.maxContextItems,
    },
    permissionBoundary: {
      capabilityIds,
      maxRiskTier,
    },
    enabled: record.enabled,
  };
}

export function validateWorkflowDraft(payload: unknown): MorpheusWorkflowDraft {
  const record = requireRecord(payload, 'saveWorkflow payload');
  assertNoUnknownKeys(record, [
    'workflowId', 'name', 'description', 'agentProfileId', 'steps',
    'allowedTriggers', 'outputs', 'enabled',
  ], 'saveWorkflow payload');
  if (record.workflowId !== undefined
    && (typeof record.workflowId !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(record.workflowId))) {
    throw new MorpheusValidationError('invalid workflow id');
  }
  const agentProfileId = boundedText(record.agentProfileId, 'workflow Agent Profile id', 64, false).trim();
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(agentProfileId)) throw new MorpheusValidationError('invalid workflow Agent Profile id');
  if (typeof record.enabled !== 'boolean') throw new MorpheusValidationError('workflow enabled must be boolean');
  if (!Array.isArray(record.steps) || record.steps.length < 1 || record.steps.length > 32) {
    throw new MorpheusValidationError('workflow must contain between 1 and 32 steps');
  }
  const stepIds = new Set<string>();
  const steps: MorpheusWorkflowStep[] = record.steps.map((value, index) => {
    const step = requireRecord(value, `workflow step ${index + 1}`);
    assertNoUnknownKeys(step, [
      'stepId', 'capabilityId', 'params', 'dependsOn', 'condition', 'summary',
    ], `workflow step ${index + 1}`);
    const stepId = boundedText(step.stepId, 'workflow step id', 64, false).trim();
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(stepId) || stepIds.has(stepId)) {
      throw new MorpheusValidationError('invalid or duplicate workflow step id');
    }
    stepIds.add(stepId);
    if (!isMorpheusActionId(step.capabilityId)) throw new MorpheusValidationError('unknown workflow capability');
    const validated = validateParams(getMorpheusActionDescriptor(step.capabilityId).params, step.params);
    if (!validated.ok) throw new MorpheusValidationError('invalid workflow capability parameters');
    if (!Array.isArray(step.dependsOn) || step.dependsOn.some((id) => typeof id !== 'string')) {
      throw new MorpheusValidationError('invalid workflow dependencies');
    }
    let condition: MorpheusWorkflowStep['condition'];
    if (step.condition !== undefined) {
      const rawCondition = requireRecord(step.condition, 'workflow condition');
      if (rawCondition.type === 'always') {
        assertNoUnknownKeys(rawCondition, ['type'], 'workflow condition');
        condition = { type: 'always' };
      } else if (rawCondition.type === 'step-succeeded') {
        assertNoUnknownKeys(rawCondition, ['type', 'stepId'], 'workflow condition');
        condition = {
          type: 'step-succeeded',
          stepId: boundedText(rawCondition.stepId, 'workflow condition step', 64, false),
        };
      } else {
        throw new MorpheusValidationError('invalid workflow condition');
      }
    }
    return {
      stepId,
      capabilityId: step.capabilityId,
      params: validated.params as MorpheusActionParams,
      dependsOn: [...step.dependsOn],
      ...(condition ? { condition } : {}),
      summary: boundedText(step.summary, 'workflow step summary', 160, false).trim(),
    };
  });
  if (!Array.isArray(record.allowedTriggers) || record.allowedTriggers.length < 1) {
    throw new MorpheusValidationError('workflow needs at least one trigger');
  }
  const allowedTriggers = [...new Set(record.allowedTriggers)] as WorkflowTriggerType[];
  if (allowedTriggers.length !== record.allowedTriggers.length
    || allowedTriggers.some((trigger) => !['manual', 'schedule', 'app-startup'].includes(String(trigger)))) {
    throw new MorpheusValidationError('invalid workflow triggers');
  }
  const outputs = requireRecord(record.outputs, 'workflow outputs');
  assertNoUnknownKeys(outputs, ['collectArtifacts', 'retainHistory'], 'workflow outputs');
  if (typeof outputs.collectArtifacts !== 'boolean' || typeof outputs.retainHistory !== 'boolean') {
    throw new MorpheusValidationError('invalid workflow output policy');
  }
  return {
    ...(record.workflowId ? { workflowId: record.workflowId } : {}),
    name: boundedText(record.name, 'workflow name', 100, false).trim(),
    description: boundedText(record.description, 'workflow description', 400),
    agentProfileId,
    steps,
    allowedTriggers,
    outputs: {
      collectArtifacts: outputs.collectArtifacts,
      retainHistory: outputs.retainHistory,
    },
    enabled: record.enabled,
  };
}

function validateObjectiveId(value: unknown): string {
  const id = requireNonEmptyString(value, 'objectiveRunId');
  if (id.length > 128 || !/^[A-Za-z0-9-]+$/.test(id)) throw new MorpheusValidationError('invalid objectiveRunId');
  return id;
}

export function validateCorrectObjectivePayload(payload: unknown): CorrectMorpheusObjectivePayload {
  const record = requireRecord(payload, 'correctObjective payload');
  assertNoUnknownKeys(record, ['objectiveRunId', 'correction'], 'correctObjective payload');
  const correction = requireNonEmptyString(record.correction, 'correction').trim();
  if (!correction || correction.length > 2_000) throw new MorpheusValidationError('correction must be between 1 and 2000 characters');
  return { objectiveRunId: validateObjectiveId(record.objectiveRunId), correction };
}

export function validateCancelObjectivePayload(payload: unknown): CancelMorpheusObjectivePayload {
  const record = requireRecord(payload, 'cancelObjective payload');
  assertNoUnknownKeys(record, ['objectiveRunId'], 'cancelObjective payload');
  return { objectiveRunId: validateObjectiveId(record.objectiveRunId) };
}

export function validateVoiceSettingsPatch(payload: unknown): MorpheusVoiceSettingsPatch {
  const record = requireRecord(payload, 'updateVoiceSettings payload');
  assertNoUnknownKeys(record, [
    'enabled', 'providerAccountId', 'modelId', 'speakResponses', 'autoSubmitTranscript',
    'speechProviderAccountId', 'speechModelId', 'speechVoice',
    'ambientEnabled', 'wakePhrase', 'ambientSilenceMs', 'ambientMaxUtteranceMs', 'bargeIn',
  ], 'updateVoiceSettings payload');
  for (const key of ['enabled', 'speakResponses', 'autoSubmitTranscript', 'ambientEnabled', 'bargeIn'] as const) {
    if (record[key] !== undefined && typeof record[key] !== 'boolean') {
      throw new MorpheusValidationError(`${key} must be a boolean`);
    }
  }
  if (record.providerAccountId !== undefined && record.providerAccountId !== null
    && (typeof record.providerAccountId !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(record.providerAccountId))) {
    throw new MorpheusValidationError('invalid providerAccountId');
  }
  if (record.speechProviderAccountId !== undefined && record.speechProviderAccountId !== null
    && (typeof record.speechProviderAccountId !== 'string'
      || !/^[A-Za-z0-9._-]{1,128}$/.test(record.speechProviderAccountId))) {
    throw new MorpheusValidationError('invalid speechProviderAccountId');
  }
  if (record.modelId !== undefined && (typeof record.modelId !== 'string'
    || !record.modelId.trim() || record.modelId.length > 200)) {
    throw new MorpheusValidationError('invalid voice modelId');
  }
  if (record.speechModelId !== undefined && (typeof record.speechModelId !== 'string'
    || !record.speechModelId.trim() || record.speechModelId.length > 200)) {
    throw new MorpheusValidationError('invalid speechModelId');
  }
  if (record.speechVoice !== undefined
    && !MORPHEUS_SPEECH_VOICES.includes(record.speechVoice as never)) {
    throw new MorpheusValidationError('invalid speechVoice');
  }
  if (record.wakePhrase !== undefined && (typeof record.wakePhrase !== 'string'
    || !MORPHEUS_AMBIENT_WAKE_PHRASE_PATTERN.test(record.wakePhrase.trim()))) {
    throw new MorpheusValidationError('invalid ambient wakePhrase');
  }
  if (record.ambientSilenceMs !== undefined && (!Number.isInteger(record.ambientSilenceMs)
    || Number(record.ambientSilenceMs) < MORPHEUS_AMBIENT_MIN_SILENCE_MS
    || Number(record.ambientSilenceMs) > MORPHEUS_AMBIENT_MAX_SILENCE_MS)) {
    throw new MorpheusValidationError('invalid ambientSilenceMs');
  }
  if (record.ambientMaxUtteranceMs !== undefined && (!Number.isInteger(record.ambientMaxUtteranceMs)
    || Number(record.ambientMaxUtteranceMs) < MORPHEUS_AMBIENT_MIN_UTTERANCE_MS
    || Number(record.ambientMaxUtteranceMs) > MORPHEUS_AMBIENT_MAX_UTTERANCE_MS)) {
    throw new MorpheusValidationError('invalid ambientMaxUtteranceMs');
  }
  return record as MorpheusVoiceSettingsPatch;
}

export function validateAmbientListeningPayload(payload: unknown): { listening: boolean } {
  const record = requireRecord(payload, 'setAmbientVoiceListening payload');
  assertNoUnknownKeys(record, ['listening'], 'setAmbientVoiceListening payload');
  if (typeof record.listening !== 'boolean') throw new MorpheusValidationError('listening must be boolean');
  return { listening: record.listening };
}

export function validateVoiceSpeakingPayload(payload: unknown): { speaking: boolean } {
  const record = requireRecord(payload, 'setVoiceSpeaking payload');
  assertNoUnknownKeys(record, ['speaking'], 'setVoiceSpeaking payload');
  if (typeof record.speaking !== 'boolean') throw new MorpheusValidationError('speaking must be boolean');
  return { speaking: record.speaking };
}

export function validateRuntimePausedPayload(payload: unknown): SetMorpheusRuntimePausedPayload {
  const record = requireRecord(payload, 'setRuntimePaused payload');
  assertNoUnknownKeys(record, ['paused'], 'setRuntimePaused payload');
  if (typeof record.paused !== 'boolean') throw new MorpheusValidationError('paused must be a boolean');
  return { paused: record.paused };
}

export function validateTranscribeAudioPayload(payload: unknown): MorpheusTranscribeAudioPayload {
  const record = requireRecord(payload, 'transcribeAudio payload');
  assertNoUnknownKeys(record, ['audioBase64', 'mimeType', 'durationMs'], 'transcribeAudio payload');
  if (typeof record.audioBase64 !== 'string' || !record.audioBase64
    || record.audioBase64.length > Math.ceil(MORPHEUS_VOICE_MAX_AUDIO_BYTES / 3) * 4 + 4) {
    throw new MorpheusValidationError('audioBase64 is empty or too large');
  }
  if (!MORPHEUS_VOICE_MIME_TYPES.includes(record.mimeType as never)) {
    throw new MorpheusValidationError('unsupported voice mimeType');
  }
  if (typeof record.durationMs !== 'number' || !Number.isInteger(record.durationMs)
    || record.durationMs < 100 || record.durationMs > MORPHEUS_VOICE_MAX_DURATION_MS) {
    throw new MorpheusValidationError('invalid voice durationMs');
  }
  return record as MorpheusTranscribeAudioPayload;
}

export function validateSynthesizeSpeechPayload(payload: unknown): MorpheusSynthesizeSpeechPayload {
  const record = requireRecord(payload, 'synthesizeSpeech payload');
  assertNoUnknownKeys(record, ['text'], 'synthesizeSpeech payload');
  if (typeof record.text !== 'string' || !record.text.trim()
    || record.text.length > MORPHEUS_SPEECH_MAX_TEXT_CHARS) {
    throw new MorpheusValidationError('speech text is empty or too large');
  }
  return { text: record.text.trim() };
}

function validateIdPayload(payload: unknown, label: string): { id: string } {
  const record = requireRecord(payload, `${label} payload`);
  assertNoUnknownKeys(record, ['id'], `${label} payload`);
  const id = requireNonEmptyString(record.id, 'id');
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(id)) throw new MorpheusValidationError(`invalid ${label} id`);
  return { id };
}

function validateRunWorkflowPayload(payload: unknown): { workflowId: string; workspaceId?: string } {
  const record = requireRecord(payload, 'runWorkflow payload');
  assertNoUnknownKeys(record, ['workflowId', 'workspaceId'], 'runWorkflow payload');
  const workflowId = requireNonEmptyString(record.workflowId, 'workflowId');
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(workflowId)) throw new MorpheusValidationError('invalid workflow id');
  if (record.workspaceId !== undefined && !isMorpheusWorkspaceId(record.workspaceId)) {
    throw new MorpheusValidationError('invalid workspaceId');
  }
  return { workflowId, ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}) };
}

function validateScheduleTrigger(value: unknown): MorpheusScheduleTrigger {
  const trigger = requireRecord(value, 'schedule trigger');
  if (trigger.type === 'once') {
    assertNoUnknownKeys(trigger, ['type', 'runAt'], 'schedule trigger');
    const runAt = requireNonEmptyString(trigger.runAt, 'runAt');
    if (!Number.isFinite(Date.parse(runAt))) throw new MorpheusValidationError('runAt must be an ISO date');
    return { type: 'once', runAt: new Date(runAt).toISOString() };
  }
  if (trigger.type === 'interval') {
    assertNoUnknownKeys(trigger, ['type', 'everyMinutes'], 'schedule trigger');
    if (typeof trigger.everyMinutes !== 'number' || !Number.isInteger(trigger.everyMinutes)
      || trigger.everyMinutes < 1 || trigger.everyMinutes > 43_200) {
      throw new MorpheusValidationError('everyMinutes must be an integer between 1 and 43200');
    }
    return { type: 'interval', everyMinutes: trigger.everyMinutes };
  }
  if (trigger.type === 'daily') {
    assertNoUnknownKeys(trigger, ['type', 'localTime'], 'schedule trigger');
    const localTime = requireNonEmptyString(trigger.localTime, 'localTime');
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(localTime)) throw new MorpheusValidationError('localTime must be HH:MM');
    return { type: 'daily', localTime };
  }
  if (trigger.type === 'app-startup') {
    assertNoUnknownKeys(trigger, ['type'], 'schedule trigger');
    return { type: 'app-startup' };
  }
  throw new MorpheusValidationError('unknown schedule trigger');
}

export function validateScheduleDraft(payload: unknown): MorpheusScheduleDraft {
  const record = requireRecord(payload, 'saveSchedule payload');
  assertNoUnknownKeys(record, ['scheduleId', 'name', 'workflowId', 'workspaceId', 'enabled', 'trigger'], 'saveSchedule payload');
  const name = requireNonEmptyString(record.name, 'name').trim();
  if (name.length > 100) throw new MorpheusValidationError('name is too long');
  const workflowId = requireNonEmptyString(record.workflowId, 'workflowId');
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(workflowId)) throw new MorpheusValidationError('invalid workflowId');
  if (typeof record.enabled !== 'boolean') throw new MorpheusValidationError('enabled must be a boolean');
  if (record.workspaceId !== undefined && !isMorpheusWorkspaceId(record.workspaceId)) {
    throw new MorpheusValidationError('invalid workspaceId');
  }
  const scheduleId = record.scheduleId === undefined ? undefined : requireNonEmptyString(record.scheduleId, 'scheduleId');
  return {
    ...(scheduleId ? { scheduleId } : {}),
    name,
    workflowId,
    ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
    enabled: record.enabled,
    trigger: validateScheduleTrigger(record.trigger),
  };
}

const AUDIT_PHASES = [
  'requested', 'awaiting-permission', 'denied', 'running', 'succeeded', 'failed',
  'cancelled', 'timed-out', 'unsupported-platform',
] as const;
const AUDIT_CATEGORIES = [
  'execution', 'objective', 'mission', 'project', 'memory', 'onboarding',
  'planner', 'voice', 'permission', 'workspace',
  'agent-profile', 'workflow', 'schedule', 'runtime', 'goal', 'proactive', 'system',
] as const;

export function validateAuditQueryPayload(payload: unknown): MorpheusAuditQueryPayload {
  if (payload === undefined || payload === null) return { limit: 50 };
  const record = requireRecord(payload, 'auditQuery payload');
  assertNoUnknownKeys(record, ['from', 'to', 'capabilityId', 'phase', 'category', 'limit', 'cursor'], 'auditQuery payload');
  const out: MorpheusAuditQueryPayload = {};
  for (const key of ['from', 'to'] as const) {
    const value = record[key];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new MorpheusValidationError(`${key} must be an ISO date`);
    out[key] = new Date(value).toISOString();
  }
  if (out.from && out.to) {
    const range = Date.parse(out.to) - Date.parse(out.from);
    if (range < 0 || range > 31 * 24 * 60 * 60 * 1000) throw new MorpheusValidationError('audit date range must be at most 31 days');
  }
  if (record.capabilityId !== undefined) {
    if (!isMorpheusActionId(record.capabilityId)) throw new MorpheusValidationError('unknown capabilityId');
    out.capabilityId = record.capabilityId;
  }
  if (record.phase !== undefined) {
    if (!AUDIT_PHASES.includes(record.phase as never)) throw new MorpheusValidationError('unknown audit phase');
    out.phase = record.phase as MorpheusAuditQueryPayload['phase'];
  }
  if (record.category !== undefined) {
    if (!AUDIT_CATEGORIES.includes(record.category as never)) throw new MorpheusValidationError('unknown audit category');
    out.category = record.category as MorpheusAuditQueryPayload['category'];
  }
  if (record.limit !== undefined && (typeof record.limit !== 'number' || !Number.isFinite(record.limit))) {
    throw new MorpheusValidationError('limit must be a finite number');
  }
  out.limit = Math.min(Math.max(1, Math.trunc(Number(record.limit ?? 50))), MORPHEUS_MAX_AUDIT_PAGE);
  if (record.cursor !== undefined) {
    if (typeof record.cursor !== 'string' || record.cursor.length < 1 || record.cursor.length > 512) throw new MorpheusValidationError('invalid audit cursor');
    out.cursor = record.cursor;
  }
  return out;
}

/**
 * Interprets a command into a typed plan.
 *
 * Runs in Main so the canonical approved root — never a renderer-supplied path
 * — becomes the plan's resource scope.
 */
export function validateInterpretPayload(payload: unknown): { objective: string; originType: ExecutionOriginType } {
  const record = requireRecord(payload, 'interpretCommand payload');
  assertNoUnknownKeys(record, ['objective', 'originType'], 'interpretCommand payload');
  const objective = requireNonEmptyString(record.objective, 'objective');
  if (objective.length > 2000) throw new MorpheusValidationError('objective is too long');
  const originType = record.originType === undefined ? 'command-bar' : record.originType;
  if (!(['command-bar', 'quick-command', 'action-launcher', 'chat'] as const).includes(originType as never)) {
    throw new MorpheusValidationError('unsupported originType');
  }
  return { objective, originType: originType as ExecutionOriginType };
}

export function validateSetProfilePayload(payload: unknown): { profile: PermissionProfile } {
  const record = requireRecord(payload, 'setPermissionProfile payload');
  assertNoUnknownKeys(record, ['profile'], 'setPermissionProfile payload');
  if (!PERMISSION_PROFILES.includes(record.profile as PermissionProfile)) {
    throw new MorpheusValidationError('unknown permission profile');
  }
  return { profile: record.profile as PermissionProfile };
}

export function validateExecutePlanPayload(payload: unknown): { planId: string } {
  const record = requireRecord(payload, 'executePlan payload');
  assertNoUnknownKeys(record, ['planId'], 'executePlan payload');
  return { planId: requireNonEmptyString(record.planId, 'planId') };
}

/**
 * Validates a batched consent response.
 *
 * Decision VALUES are checked here; boundary IDS are not, because Main matches
 * them against the boundaries it issued — an id it does not recognise is simply
 * absent from the decision map, which the executor already treats as a refusal.
 */
export function validatePlanDecisionsPayload(payload: unknown): {
  planId: string;
  decisions: Record<string, string>;
} {
  const record = requireRecord(payload, 'respondPlanPermission payload');
  assertNoUnknownKeys(record, ['planId', 'decisions'], 'respondPlanPermission payload');
  const planId = requireNonEmptyString(record.planId, 'planId');
  const raw = requireRecord(record.decisions ?? {}, 'decisions');

  const decisions: Record<string, string> = {};
  for (const [boundaryId, value] of Object.entries(raw)) {
    if (typeof value !== 'string' || !PERMISSION_DECISION_KINDS.includes(value as never)) {
      throw new MorpheusValidationError(
        `decision for ${boundaryId} must be one of: ${PERMISSION_DECISION_KINDS.join(', ')}`,
      );
    }
    decisions[boundaryId] = value;
  }
  return { planId, decisions };
}

export function validateRevokePayload(payload: unknown): { grantId: string } {
  const record = requireRecord(payload, 'revokeGrant payload');
  assertNoUnknownKeys(record, ['grantId'], 'revokeGrant payload');
  return { grantId: requireNonEmptyString(record.grantId, 'grantId') };
}

export function createMorpheusApi(options: CreateMorpheusApiOptions): CompleteHostServiceRegistry['morpheus'] {
  const {
    runtime, grants, agentProfiles, workflows, scheduler, objectives, voice, runtimeControl,
    missions, projects, memory, onboarding, goals, proactive, systems, companionSurface, workspaces, audit, filesRoot, appVersion, auditHealth,
  } = options;
  const now = options.now ?? (() => new Date());
  const planner = options.planner ?? createDeterministicMorpheusPlanner();
  return {
    routeInteraction: (payload) => routeMorpheusInteraction(validateRouteInteractionPayload(payload)),
    interpretCommand: async (payload) => {
      const { objective, originType } = validateInterpretPayload(payload);
      const result = await planner.plan({
        objective,
        origin: originType === 'command-bar'
          ? { type: 'command-bar', commandText: objective }
          : originType === 'quick-command'
            ? { type: 'quick-command', commandText: objective }
            : originType === 'chat'
              ? { type: 'chat' }
              : { type: 'action-launcher' },
        platform: process.platform,
        filesRoot,
      });
      // Main keeps the plan it authored. The renderer gets a copy to preview and
      // an id to execute — it can never hand back a plan of its own making.
      if (result.ok) runtime.registerPlan(result.plan);
      return result;
    },

    executePlan: (payload) => runtime.executePlan(validateExecutePlanPayload(payload)),

    respondPlanPermission: (payload) => (
      runtime.respondPlanPermission(validatePlanDecisionsPayload(payload))
    ),

    submitObjective: (payload) => objectives.submit(validateSubmitObjectivePayload(payload)),
    objectiveSnapshot: () => objectives.snapshot(),
    correctObjective: (payload) => objectives.correct(validateCorrectObjectivePayload(payload)),
    cancelObjective: (payload) => objectives.cancel(validateCancelObjectivePayload(payload)),
    missions: () => missions.snapshot(),
    mission: (payload) => ({ mission: missions.get(validateMissionIdPayload(payload).missionId) ?? null }),
    rerunMission: (payload) => {
      const mission = missions.get(validateMissionIdPayload(payload).missionId);
      if (!mission) throw new MorpheusValidationError('Unknown Morpheus Mission');
      return objectives.submitInternal({
        objective: mission.objective,
        origin: { type: 'command-bar', commandText: mission.objective },
        workspaceId: mission.workspaceId,
        agentProfileId: mission.agentProfileId,
        projectId: mission.projectId,
        missionId: mission.missionId,
      });
    },
    projects: () => projects.list(),
    project: (payload) => ({ project: projects.get(validateProjectIdPayload(payload).projectId) ?? null }),
    saveProject: async (payload) => {
      const draft = validateProjectDraft(payload);
      const workspace = workspaces.get(draft.workspaceId);
      if (!workspace?.enabled || !workspace.available) {
        throw new MorpheusValidationError('Project workspace is unavailable');
      }
      const projectId = draft.projectId ?? `project-${randomUUID()}`;
      await audit.recordControl({
        category: 'project', event: draft.projectId ? 'updated' : 'created', subjectId: projectId,
        details: { workspaceId: draft.workspaceId, enabled: draft.enabled }, appVersion,
      });
      return { project: projects.save({ ...draft, projectId }) };
    },
    removeProject: async (payload) => {
      const { projectId } = validateProjectIdPayload(payload);
      if (memory.countForProject(projectId) > 0) {
        throw new MorpheusValidationError('Delete this Project\'s memory entries first');
      }
      await audit.recordControl({
        category: 'project', event: 'removed', subjectId: projectId, details: {}, appVersion,
      });
      return { project: projects.remove(projectId) };
    },
    memories: () => memory.list(),
    saveMemory: async (payload) => {
      const draft = validateMemoryDraft(payload);
      if (draft.projectId && !projects.get(draft.projectId)?.enabled) {
        throw new MorpheusValidationError('Memory Project is unavailable');
      }
      const memoryId = draft.memoryId ?? `memory-${randomUUID()}`;
      await audit.recordControl({
        category: 'memory', event: draft.memoryId ? 'updated' : 'created', subjectId: memoryId,
        details: {
          kind: draft.kind,
          sensitivity: draft.sensitivity,
          providerUse: draft.providerUse,
          scopedToProject: Boolean(draft.projectId),
          enabled: draft.enabled,
        },
        appVersion,
      });
      return { memory: memory.save({ ...draft, memoryId }) };
    },
    removeMemory: async (payload) => {
      const { memoryId } = validateMemoryIdPayload(payload);
      await audit.recordControl({
        category: 'memory', event: 'removed', subjectId: memoryId, details: {}, appVersion,
      });
      return { memory: memory.remove(memoryId) };
    },
    onboardingStatus: () => onboarding.status(),
    completeOnboarding: async (payload) => {
      const preferences = validateCompleteOnboardingPayload(payload);
      await audit.recordControl({
        category: 'onboarding', event: 'completed',
        details: {
          hasPreferredName: Boolean(preferences.preferredName),
          speakResponses: preferences.speakResponses,
          personality: preferences.personality,
          interactionMode: preferences.interactionMode,
          launchAtStartup: preferences.launchAtStartup,
          ambientVoiceEnabled: preferences.ambientVoiceEnabled,
          permissionProfile: preferences.permissionProfile,
          proactiveCheckIns: preferences.proactiveCheckIns,
        },
        appVersion,
      });
      await voice.updateSettings({
        speakResponses: preferences.speakResponses,
        ambientEnabled: preferences.ambientVoiceEnabled,
        wakePhrase: preferences.wakePhrase,
      });
      await proactive.updateSettings({ enabled: preferences.proactiveCheckIns });
      await options.applyDesktopSetup?.({ launchAtStartup: preferences.launchAtStartup });
      await audit.recordControl({
        category: 'permission', event: 'profile-changed',
        details: { profile: preferences.permissionProfile, source: 'onboarding' }, appVersion,
      });
      grants.setProfile(preferences.permissionProfile);

      if (preferences.preferredName) {
        const existing = memory.list().memories.find((entry) => (
          entry.sourceId === 'onboarding-preferred-name'
        ));
        const memoryId = existing?.memoryId ?? `memory-${randomUUID()}`;
        await audit.recordControl({
          category: 'memory', event: existing ? 'updated-from-onboarding' : 'captured-from-onboarding',
          subjectId: memoryId,
          details: { kind: 'preference', source: 'user' }, appVersion,
        });
        memory.save({
          memoryId,
          title: 'Preferred name',
          text: `Call the user ${preferences.preferredName}.`,
          kind: 'preference',
          sensitivity: 'normal',
          providerUse: 'allowed',
          enabled: true,
        }, { source: 'user', sourceId: 'onboarding-preferred-name' });
      }
      const personalityMemory = memory.list().memories.find((entry) => (
        entry.sourceId === 'onboarding-personality'
      ));
      const personalityMemoryId = personalityMemory?.memoryId ?? `memory-${randomUUID()}`;
      await audit.recordControl({
        category: 'memory',
        event: personalityMemory ? 'updated-from-onboarding' : 'captured-from-onboarding',
        subjectId: personalityMemoryId,
        details: { kind: 'preference', source: 'user' },
        appVersion,
      });
      const personalityText = {
        adaptive: 'Adapt communication detail, tone, and pace to the objective.',
        concise: 'Communicate briefly and directly without unnecessary narration.',
        warm: 'Communicate naturally and warmly, with light humor when appropriate.',
        witty: 'Communicate confidently and concisely, with subtle human wit when appropriate.',
      }[preferences.personality];
      memory.save({
        memoryId: personalityMemoryId,
        title: 'Companion communication style',
        text: personalityText,
        kind: 'preference',
        sensitivity: 'normal',
        providerUse: 'allowed',
        enabled: true,
      }, { source: 'user', sourceId: 'onboarding-personality' });
      return onboarding.complete(preferences);
    },
    resetOnboarding: async () => {
      await audit.recordControl({
        category: 'onboarding', event: 'reset', details: {}, appVersion,
      });
      return onboarding.reset();
    },
    goals: () => goals.list(),
    goal: (payload) => ({ goal: goals.get(validateGoalIdPayload(payload).goalId) ?? null }),
    saveGoal: (payload) => goals.save(validateGoalDraft(payload)),
    removeGoal: (payload) => goals.remove(validateGoalIdPayload(payload).goalId),
    continueGoal: (payload) => goals.continue(validateGoalIdPayload(payload).goalId),
    proactiveSnapshot: () => proactive.snapshot(),
    refreshProactive: () => proactive.refresh(),
    updateProactiveSettings: (payload) => proactive.updateSettings(validateProactiveSettingsPatch(payload)),
    createReminder: (payload) => proactive.createReminder(validateCreateReminderPayload(payload)),
    dismissAttention: (payload) => proactive.dismiss(validateAttentionIdPayload(payload).attentionId),
    snoozeAttention: (payload) => {
      const input = validateSnoozeAttentionPayload(payload);
      return proactive.snooze(input.attentionId, input.until);
    },
    removeReminder: (payload) => proactive.removeReminder(validateAttentionIdPayload(payload).attentionId),
    actOnAttention: (payload) => proactive.act(validateAttentionIdPayload(payload).attentionId),
    systems: () => systems.list(),
    system: (payload) => ({ system: systems.get(validateSystemIdPayload(payload).systemId) ?? null }),
    saveSystem: async (payload) => ({ system: await systems.save(validateSystemDraft(payload)) }),
    removeSystem: async (payload) => ({ system: await systems.remove(validateSystemIdPayload(payload).systemId) }),
    createSystemFromMission: (payload) => {
      const input = validateCreateSystemFromMissionPayload(payload);
      return systems.createFromMission(input.missionId, input.name);
    },
    testSystem: (payload) => systems.test(validateSystemIdPayload(payload).systemId),
    activateSystem: (payload) => systems.activate(validateSystemIdPayload(payload).systemId),
    pauseSystem: (payload) => systems.pause(validateSystemIdPayload(payload).systemId),
    runSystem: (payload) => systems.run(validateSystemIdPayload(payload).systemId),
    companionSurfaceStatus: () => companionSurface.status(),
    dismissCompanionSurface: () => companionSurface.dismiss(),
    expandCompanionSurface: () => companionSurface.expand(),
    voiceStatus: () => voice.status(),
    updateVoiceSettings: (payload) => voice.updateSettings(validateVoiceSettingsPatch(payload)),
    transcribeAudio: (payload) => voice.transcribe(validateTranscribeAudioPayload(payload)),
    synthesizeSpeech: (payload) => voice.synthesize(validateSynthesizeSpeechPayload(payload)),
    beginAmbientVoice: () => voice.beginAmbientSession(),
    endAmbientVoice: () => voice.endAmbientSession(),
    setAmbientVoiceListening: (payload) => (
      voice.setAmbientListening(validateAmbientListeningPayload(payload).listening)
    ),
    transcribeAmbientAudio: (payload) => voice.transcribeAmbient(validateTranscribeAudioPayload(payload)),
    setVoiceSpeaking: (payload) => voice.setSpeaking(validateVoiceSpeakingPayload(payload).speaking),
    runtimeControl: () => runtimeControl.snapshot(),
    setRuntimePaused: (payload) => (
      runtimeControl.setPaused(validateRuntimePausedPayload(payload).paused, 'settings')
    ),

    permissionCenter: (): PermissionCenterSnapshot => ({
      profile: grants.getProfile(),
      sessionGrants: grants.listSessionGrants(),
      persistentGrants: grants.listPersistentGrants(),
      deniedScopes: grants.listDeniedScopes(),
      auditDegraded: auditHealth() === 'degraded',
    }),

    setPermissionProfile: async (payload) => {
      const profile = validateSetProfilePayload(payload).profile;
      await audit.recordControl({
        category: 'permission', event: 'profile-changed', subjectId: profile,
        details: { profile }, appVersion,
      });
      grants.setProfile(profile);
      return { ok: true };
    },

    revokeGrant: async (payload) => {
      const grantId = validateRevokePayload(payload).grantId;
      await audit.recordControl({
        category: 'permission', event: 'grant-revoked', subjectId: grantId,
        details: { grantId }, appVersion,
      });
      return { ok: grants.revoke(grantId) };
    },

    revokeAllSessionGrants: async () => {
      await audit.recordControl({
        category: 'permission', event: 'session-grants-revoked',
        details: {}, appVersion,
      });
      grants.revokeAllSession();
      return { ok: true };
    },

    resetPermissionPolicy: async () => {
      await audit.recordControl({
        category: 'permission', event: 'policy-reset',
        details: {}, appVersion,
      });
      grants.reset();
      return { ok: true };
    },

    filesRoot: () => ({ path: filesRoot }),

    /**
     * Opens the approved folder through a typed, Main-owned capability. The
     * renderer never gets shell access, and the path is the canonical root
     * rather than anything it supplied.
     */
    openFilesRoot: async () => {
      const error = await shell.openPath(filesRoot);
      if (error) throw new Error(error);
      return { ok: true };
    },

    workspaces: () => workspaces.list(),
    addWorkspace: async (payload) => {
      const input = validateAddWorkspacePayload(payload);
      const directoryPath = await options.selectWorkspaceDirectory();
      if (!directoryPath) return { workspace: null };
      await audit.recordControl({
        category: 'workspace', event: 'registration-requested',
        details: { access: input.access ?? 'read-write' }, appVersion,
      });
      return { workspace: workspaces.add(directoryPath, input) };
    },
    updateWorkspace: async (payload) => {
      const input = validateUpdateWorkspacePayload(payload);
      const existing = workspaces.get(input.workspaceId);
      if (!existing) throw new MorpheusValidationError('Unknown Morpheus workspace');
      await audit.recordControl({
        category: 'workspace', event: 'update-requested', subjectId: input.workspaceId,
        details: {
          ...(input.access ? { access: input.access } : {}),
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
          ...(input.name ? { nameChanged: true } : {}),
        },
        appVersion,
      });
      if ((input.access === 'read' && existing.access === 'read-write') || input.enabled === false) {
        grants.revokeForResourceScope(existing.rootPath);
      }
      return { workspace: workspaces.update(input) };
    },
    removeWorkspace: async (payload) => {
      const { workspaceId } = validateWorkspaceIdPayload(payload);
      const workspace = workspaces.get(workspaceId);
      if (!workspace) return { workspace: null };
      if (workspace.kind === 'managed') {
        throw new MorpheusValidationError('The managed Morpheus workspace cannot be removed');
      }
      await audit.recordControl({
        category: 'workspace', event: 'removal-requested', subjectId: workspaceId,
        details: {}, appVersion,
      });
      grants.revokeForResourceScope(workspace.rootPath);
      return { workspace: workspaces.remove(workspaceId) };
    },
    openWorkspace: async (payload) => {
      const { workspaceId } = validateWorkspaceIdPayload(payload);
      const error = await shell.openPath(workspaces.resolveRoot(workspaceId));
      if (error) throw new Error(error);
      return { ok: true };
    },

    agentProfiles: () => agentProfiles.list(),
    agentProfile: (payload) => ({
      profile: agentProfiles.get(validateIdPayload(payload, 'Agent Profile').id) ?? null,
    }),
    saveAgentProfile: async (payload) => {
      const draft = validateAgentProfileDraft(payload);
      const profileId = draft.profileId ?? `agent-${randomUUID()}`;
      const existing = agentProfiles.get(profileId);
      const timestamp = now().toISOString();
      await audit.recordControl({
        category: 'agent-profile', event: 'save-requested', subjectId: profileId,
        details: {
          planner: draft.planner.kind,
          capabilityCount: draft.permissionBoundary.capabilityIds.length,
          workspaceAccess: draft.workspace.access,
        },
        appVersion,
      });
      return {
        profile: agentProfiles.save({
          v: MORPHEUS_AGENT_PROFILE_VERSION,
          ...draft,
          profileId,
          builtIn: existing?.builtIn ?? false,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        }),
      };
    },
    removeAgentProfile: async (payload) => {
      const id = validateIdPayload(payload, 'Agent Profile').id;
      const profile = agentProfiles.get(id);
      if (!profile) return { ok: false };
      if (profile.builtIn) {
        throw new MorpheusValidationError('Built-in Morpheus Agent Profiles cannot be removed');
      }
      if (workflows.list().workflows.some((workflow) => workflow.agentProfileId === id)) {
        throw new MorpheusValidationError('Remove workflows that use this Agent Profile first');
      }
      await audit.recordControl({
        category: 'agent-profile', event: 'removal-requested', subjectId: id,
        details: {}, appVersion,
      });
      return { ok: agentProfiles.remove(id) };
    },
    resetAgentProfiles: async () => {
      await audit.recordControl({
        category: 'agent-profile', event: 'built-ins-reset', details: {}, appVersion,
      });
      return agentProfiles.resetBuiltIns();
    },
    workflows: () => workflows.list(),
    workflow: (payload) => ({
      workflow: workflows.get(validateIdPayload(payload, 'workflow').id) ?? null,
    }),
    saveWorkflow: async (payload) => {
      const draft = validateWorkflowDraft(payload);
      const profile = agentProfiles.get(draft.agentProfileId);
      if (!profile) {
        throw new MorpheusValidationError('Unknown workflow Agent Profile');
      }
      const allowed = new Set(profile.permissionBoundary.capabilityIds);
      for (const step of draft.steps) {
        if (!allowed.has(step.capabilityId)) {
          throw new MorpheusValidationError(`Agent Profile does not allow ${step.capabilityId}`);
        }
        const risk = getMorpheusActionDescriptor(step.capabilityId).riskTier;
        if (MORPHEUS_RISK_ORDER[risk] > MORPHEUS_RISK_ORDER[profile.permissionBoundary.maxRiskTier]) {
          throw new MorpheusValidationError(`${step.capabilityId} exceeds the Agent Profile risk boundary`);
        }
      }
      const workflowId = draft.workflowId ?? `workflow-${randomUUID()}`;
      const existing = workflows.get(workflowId);
      const timestamp = now().toISOString();
      await audit.recordControl({
        category: 'workflow', event: 'save-requested', subjectId: workflowId,
        details: {
          agentProfileId: draft.agentProfileId,
          stepCount: draft.steps.length,
          enabled: draft.enabled,
        },
        appVersion,
      });
      return {
        workflow: workflows.save({
          v: MORPHEUS_WORKFLOW_VERSION,
          ...draft,
          workflowId,
          builtIn: existing?.builtIn ?? false,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        }),
      };
    },
    removeWorkflow: async (payload) => {
      const id = validateIdPayload(payload, 'workflow').id;
      const workflow = workflows.get(id);
      if (!workflow) return { ok: false };
      if (workflow.builtIn) throw new MorpheusValidationError('Built-in Morpheus workflows cannot be removed');
      if (scheduler.list().schedules.some((schedule) => schedule.workflowId === id)) {
        throw new MorpheusValidationError('Remove schedules that use this workflow first');
      }
      await audit.recordControl({
        category: 'workflow', event: 'removal-requested', subjectId: id,
        details: {}, appVersion,
      });
      return { ok: workflows.remove(id) };
    },
    runWorkflow: (payload) => {
      const { workflowId, workspaceId } = validateRunWorkflowPayload(payload);
      const workflow = workflows.get(workflowId);
      if (!workflow) throw new MorpheusValidationError('Unknown Morpheus workflow');
      const plan = workflows.prepare({
        workflowId,
        trigger: 'manual',
        workspaceId,
        origin: {
          type: 'workflow',
          workflowId,
          agentProfileId: workflow.agentProfileId,
        },
      });
      return objectives.submitInternal({
        objective: workflow.name,
        origin: plan.origin,
        workspaceId: plan.workspaceId,
        agentProfileId: workflow.agentProfileId,
        preparedPlan: plan,
      });
    },
    schedules: () => scheduler.list(),
    saveSchedule: async (payload) => {
      const draft = validateScheduleDraft(payload);
      if (!workflows.get(draft.workflowId)) throw new MorpheusValidationError('Unknown Morpheus workflow');
      await audit.recordControl({
        category: 'schedule', event: draft.scheduleId ? 'updated' : 'created',
        subjectId: draft.scheduleId ?? draft.workflowId,
        details: { workflowId: draft.workflowId, trigger: draft.trigger.type },
        appVersion,
      });
      return scheduler.save(draft);
    },
    removeSchedule: async (payload) => {
      const id = validateIdPayload(payload, 'schedule').id;
      await audit.recordControl({
        category: 'schedule', event: 'removed', subjectId: id,
        details: { scheduleId: id }, appVersion,
      });
      return { ok: scheduler.remove(id) };
    },
    runSchedule: (payload) => scheduler.runNow(validateIdPayload(payload, 'schedule').id),

    describeActions: (): MorpheusDescribeActionsResult => runtime.describeActions(),
    systemInfo: (): MorpheusSystemInfo => runtime.systemInfo(),
    requestAction: (payload): Promise<MorpheusRequestActionResult> => (
      runtime.requestAction(validateRequestActionPayload(payload))
    ),
    respondPermission: (payload): Promise<MorpheusAcknowledgement> => (
      runtime.respondPermission(validateRespondPermissionPayload(payload))
    ),
    cancelAction: (payload): Promise<MorpheusAcknowledgement> => (
      runtime.cancelAction(validateCancelActionPayload(payload))
    ),
    auditRecent: (payload): Promise<MorpheusAuditRecentResult> => (
      runtime.auditRecent(validateAuditRecentPayload(payload))
    ),
    auditQuery: (payload): Promise<MorpheusAuditQueryResult> => (
      audit.query(validateAuditQueryPayload(payload))
    ),
  };
}
