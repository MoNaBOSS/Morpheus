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
import { interpretCommand } from '@shared/morpheus/interpreter/deterministic';

import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import type { MorpheusRuntime, MorpheusGrantStore } from './morpheus';

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
  const allowedParamKeys = descriptor.params.map((param) => param.key);

  const origin = record.originType as ExecutionOriginType | undefined;
  const agentId = record.agentId as string | undefined;

  if (record.params === undefined) {
    const missing = descriptor.params.filter((param) => param.required);
    if (missing.length > 0) {
      throw new MorpheusValidationError(`Missing required parameters: ${missing.map((p) => p.key).join(', ')}`);
    }
    return { actionId, ...(origin ? { originType: origin } : {}), ...(agentId ? { agentId } : {}) };
  }

  const rawParams = requireRecord(record.params, 'params');
  assertNoUnknownKeys(rawParams, allowedParamKeys, 'params');

  const params: MorpheusActionParams = {};
  for (const descriptorParam of descriptor.params) {
    const value = rawParams[descriptorParam.key];
    if (value === undefined) {
      if (descriptorParam.required) {
        throw new MorpheusValidationError(`Missing required parameter: ${descriptorParam.key}`);
      }
      continue;
    }
    if (typeof value !== 'string') {
      throw new MorpheusValidationError(`Parameter ${descriptorParam.key} must be a string`);
    }
    // Deeper semantic validation (grammar, size, registry membership) belongs to
    // the capability, which owns the meaning of its own parameters.
    params[descriptorParam.key as keyof MorpheusActionParams] = value;
  }

  return { actionId, params, ...(origin ? { originType: origin } : {}), ...(agentId ? { agentId } : {}) };
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
  filesRoot: string;
  auditHealth: () => 'healthy' | 'degraded';
};

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
  if (!EXECUTION_ORIGIN_TYPES.includes(originType as ExecutionOriginType)) {
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

export function validateRevokePayload(payload: unknown): { grantId: string } {
  const record = requireRecord(payload, 'revokeGrant payload');
  assertNoUnknownKeys(record, ['grantId'], 'revokeGrant payload');
  return { grantId: requireNonEmptyString(record.grantId, 'grantId') };
}

export function createMorpheusApi(options: CreateMorpheusApiOptions): CompleteHostServiceRegistry['morpheus'] {
  const { runtime, grants, filesRoot, auditHealth } = options;
  return {
    interpretCommand: (payload) => {
      const { objective, originType } = validateInterpretPayload(payload);
      return interpretCommand({
        objective,
        origin: originType === 'command-bar'
          ? { type: 'command-bar', commandText: objective }
          : { type: 'action-launcher' },
        platform: process.platform,
        filesRoot,
      });
    },

    permissionCenter: (): PermissionCenterSnapshot => ({
      profile: grants.getProfile(),
      sessionGrants: grants.listSessionGrants(),
      persistentGrants: grants.listPersistentGrants(),
      deniedScopes: grants.listDeniedScopes(),
      auditDegraded: auditHealth() === 'degraded',
    }),

    setPermissionProfile: (payload) => {
      grants.setProfile(validateSetProfilePayload(payload).profile);
      return { ok: true };
    },

    revokeGrant: (payload) => ({ ok: grants.revoke(validateRevokePayload(payload).grantId) }),

    revokeAllSessionGrants: () => {
      grants.revokeAllSession();
      return { ok: true };
    },

    resetPermissionPolicy: () => {
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
  };
}
