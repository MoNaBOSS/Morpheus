/**
 * Typed host-invoke surface for Morpheus native actions.
 *
 * This is the trust boundary. Everything arriving here came from the Renderer
 * and is treated as untrusted: parameters are matched against an explicit
 * whitelist derived from the action registry, and unknown keys are REJECTED
 * rather than ignored, so a payload that smuggles an extra field fails loudly
 * instead of being silently dropped.
 */
import {
  MORPHEUS_MAX_AUDIT_PAGE,
  getMorpheusActionDescriptor,
  isMorpheusActionId,
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
  assertNoUnknownKeys(record, ['actionId', 'params', 'originType', 'agentId'], 'requestAction payload');

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
  audit: MorpheusAuditSink;
  filesRoot: string;
  appVersion: string;
  auditHealth: () => 'healthy' | 'degraded';
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
  return {
    objective,
    originType: originType as SubmitMorpheusObjectivePayload['originType'],
    ...(optionalId(record.workspaceId, 'workspaceId') ? { workspaceId: record.workspaceId as string } : {}),
    ...(optionalId(record.agentProfileId, 'agentProfileId') ? { agentProfileId: record.agentProfileId as string } : {}),
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

function validatePrepareWorkflowPayload(payload: unknown): { workflowId: string } {
  const record = requireRecord(payload, 'prepareWorkflow payload');
  assertNoUnknownKeys(record, ['workflowId'], 'prepareWorkflow payload');
  const workflowId = requireNonEmptyString(record.workflowId, 'workflowId');
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(workflowId)) throw new MorpheusValidationError('invalid workflow id');
  return { workflowId };
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
  assertNoUnknownKeys(record, ['scheduleId', 'name', 'workflowId', 'enabled', 'trigger'], 'saveSchedule payload');
  const name = requireNonEmptyString(record.name, 'name').trim();
  if (name.length > 100) throw new MorpheusValidationError('name is too long');
  const workflowId = requireNonEmptyString(record.workflowId, 'workflowId');
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(workflowId)) throw new MorpheusValidationError('invalid workflowId');
  if (typeof record.enabled !== 'boolean') throw new MorpheusValidationError('enabled must be a boolean');
  const scheduleId = record.scheduleId === undefined ? undefined : requireNonEmptyString(record.scheduleId, 'scheduleId');
  return { ...(scheduleId ? { scheduleId } : {}), name, workflowId, enabled: record.enabled, trigger: validateScheduleTrigger(record.trigger) };
}

const AUDIT_PHASES = [
  'requested', 'awaiting-permission', 'denied', 'running', 'succeeded', 'failed',
  'cancelled', 'timed-out', 'unsupported-platform',
] as const;
const AUDIT_CATEGORIES = ['execution', 'objective', 'planner', 'voice', 'permission', 'agent-profile', 'workflow', 'schedule'] as const;

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
  const { runtime, grants, agentProfiles, workflows, scheduler, objectives, voice, audit, filesRoot, appVersion, auditHealth } = options;
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
      await shell.openPath(filesRoot);
      return { ok: true };
    },

    agentProfiles: () => agentProfiles.list(),
    agentProfile: (payload) => ({
      profile: agentProfiles.get(validateIdPayload(payload, 'Agent Profile').id) ?? null,
    }),
    workflows: () => workflows.list(),
    workflow: (payload) => ({
      workflow: workflows.get(validateIdPayload(payload, 'workflow').id) ?? null,
    }),
    prepareWorkflow: (payload) => {
      const { workflowId } = validatePrepareWorkflowPayload(payload);
      const workflow = workflows.get(workflowId);
      if (!workflow) throw new MorpheusValidationError('Unknown Morpheus workflow');
      return workflows.prepare({
        workflowId,
        trigger: 'manual',
        origin: {
          type: 'workflow',
          workflowId,
          agentProfileId: workflow.agentProfileId,
        },
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
