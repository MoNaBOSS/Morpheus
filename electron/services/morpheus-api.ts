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

import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import type { MorpheusRuntime } from './morpheus';

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
  assertNoUnknownKeys(record, ['actionId', 'params'], 'requestAction payload');

  const actionId = requireNonEmptyString(record.actionId, 'actionId');
  if (!isMorpheusActionId(actionId)) {
    throw new MorpheusValidationError(`Unknown action: ${actionId}`);
  }

  const descriptor = getMorpheusActionDescriptor(actionId);
  const allowedParamKeys = descriptor.params.map((param) => param.key);

  if (record.params === undefined) {
    const missing = descriptor.params.filter((param) => param.required);
    if (missing.length > 0) {
      throw new MorpheusValidationError(`Missing required parameters: ${missing.map((p) => p.key).join(', ')}`);
    }
    return { actionId };
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

  return { actionId, params };
}

export function validateRespondPermissionPayload(payload: unknown): MorpheusRespondPermissionPayload {
  const record = requireRecord(payload, 'respondPermission payload');
  assertNoUnknownKeys(record, ['runId', 'decision'], 'respondPermission payload');
  const runId = requireNonEmptyString(record.runId, 'runId');
  const decision = record.decision;
  if (decision !== 'granted' && decision !== 'denied') {
    throw new MorpheusValidationError('decision must be "granted" or "denied"');
  }
  return { runId, decision };
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
};

export function createMorpheusApi(options: CreateMorpheusApiOptions): CompleteHostServiceRegistry['morpheus'] {
  const { runtime } = options;
  return {
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
