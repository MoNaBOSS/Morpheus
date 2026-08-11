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
  type MorpheusTranscribeAudioPayload,
  type MorpheusVoiceSettingsPatch,
} from '@shared/morpheus/voice-types';
import type { MorpheusVoiceService } from './morpheus/voice/voice-service';
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
  voice: MorpheusVoiceService;
  workspaces: MorpheusWorkspaceStore;
  audit: MorpheusAuditSink;
  filesRoot: string;
  appVersion: string;
  auditHealth: () => 'healthy' | 'degraded';
  /** Main-owned native picker. Renderer can never supply a directory path. */
  selectWorkspaceDirectory: () => Promise<string | null>;
  now?: () => Date;
  /** Main-owned adapter boundary; raw provider output never enters here directly. */
  planner?: MorpheusPlanner;
};

export function validateSubmitObjectivePayload(payload: unknown): SubmitMorpheusObjectivePayload {
  const record = requireRecord(payload, 'submitObjective payload');
  assertNoUnknownKeys(record, ['objective', 'originType', 'workspaceId', 'agentProfileId'], 'submitObjective payload');
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
  return {
    objective,
    originType: originType as SubmitMorpheusObjectivePayload['originType'],
    ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
    ...(agentProfileId ? { agentProfileId } : {}),
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
  ], 'updateVoiceSettings payload');
  for (const key of ['enabled', 'speakResponses', 'autoSubmitTranscript'] as const) {
    if (record[key] !== undefined && typeof record[key] !== 'boolean') {
      throw new MorpheusValidationError(`${key} must be a boolean`);
    }
  }
  if (record.providerAccountId !== undefined && record.providerAccountId !== null
    && (typeof record.providerAccountId !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(record.providerAccountId))) {
    throw new MorpheusValidationError('invalid providerAccountId');
  }
  if (record.modelId !== undefined && (typeof record.modelId !== 'string'
    || !record.modelId.trim() || record.modelId.length > 200)) {
    throw new MorpheusValidationError('invalid voice modelId');
  }
  return record as MorpheusVoiceSettingsPatch;
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
  'execution', 'objective', 'planner', 'voice', 'permission', 'workspace',
  'agent-profile', 'workflow', 'schedule',
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
    runtime, grants, agentProfiles, workflows, scheduler, objectives, voice,
    workspaces, audit, filesRoot, appVersion, auditHealth,
  } = options;
  const now = options.now ?? (() => new Date());
  const planner = options.planner ?? createDeterministicMorpheusPlanner();
  return {
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
    voiceStatus: () => voice.status(),
    updateVoiceSettings: (payload) => voice.updateSettings(validateVoiceSettingsPatch(payload)),
    transcribeAudio: (payload) => voice.transcribe(validateTranscribeAudioPayload(payload)),

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
