/**
 * Morpheus run, event and audit model.
 *
 * Deliberately independent of the ACP timeline in `src/lib/acp/timeline-types.ts`.
 * That model is session-keyed and owned by the ACP reducer; Morpheus runs share
 * none of its semantics. The snapshot idiom (`runOrder` + `runsById`) mirrors it
 * on purpose so the two read alike, without coupling them.
 *
 * Imported by BOTH processes: no `electron` and no Node built-in imports.
 */

import type { MorpheusActionId, MorpheusApplicationKey } from './actions/registry';

export const MORPHEUS_EVENT_VERSION = 1 as const;
export const MORPHEUS_AUDIT_VERSION = 1 as const;

/**
 * Lifecycle of a single run. Execution is reachable only from
 * `awaiting-permission`. `unsupported-platform` is a normal terminal outcome,
 * not an error, so future platform support is additive.
 */
export type MorpheusRunPhase =
  | 'requested'
  | 'awaiting-permission'
  | 'denied'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed-out'
  | 'unsupported-platform';

export const MORPHEUS_TERMINAL_PHASES: readonly MorpheusRunPhase[] = Object.freeze([
  'denied',
  'succeeded',
  'failed',
  'cancelled',
  'timed-out',
  'unsupported-platform',
]);

export function isMorpheusTerminalPhase(phase: MorpheusRunPhase): boolean {
  return MORPHEUS_TERMINAL_PHASES.includes(phase);
}

export type MorpheusFailureCode =
  | 'unknown-action'
  | 'unsupported-platform'
  | 'invalid-params'
  | 'resolution-failed'
  | 'execution-failed'
  | 'permission-denied'
  | 'permission-timeout'
  | 'rate-limited'
  | 'cancelled'
  | 'internal';

export type MorpheusError = {
  code: MorpheusFailureCode;
  message: string;
};

/**
 * What Main resolved the request to. Surfaced in the confirmation so the user
 * approves the real target rather than the requested one.
 */
export type MorpheusResolvedTarget =
  | { kind: 'executable'; path: string; applicationKey: MorpheusApplicationKey }
  | { kind: 'file'; path: string; bytes: number }
  | { kind: 'none' };

export type MorpheusSystemInfo = {
  platform: string;
  release: string;
  arch: string;
  cpuCount: number;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  uptimeSeconds: number;
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
};

export type MorpheusLaunchResult = {
  kind: 'launch';
  applicationKey: MorpheusApplicationKey;
  executablePath: string;
  pid: number | null;
};

export type MorpheusFileResult = {
  kind: 'file';
  path: string;
  bytes: number;
  /** Truncated SHA-256 of the content. The content itself is never retained. */
  contentSha256: string;
};

export type MorpheusSystemResult = {
  kind: 'system';
  info: MorpheusSystemInfo;
};

export type MorpheusActionResult =
  | MorpheusLaunchResult
  | MorpheusFileResult
  | MorpheusSystemResult;

/** Renderer-supplied parameters. Validated in Main against a key whitelist. */
export type MorpheusActionParams = {
  applicationKey?: string;
  fileName?: string;
  content?: string;
};

/** The single envelope carried on `morpheus:action-event`. */
export type MorpheusActionEvent = {
  v: typeof MORPHEUS_EVENT_VERSION;
  /** Monotonic per-process ordering key. The Renderer sorts on this. */
  seq: number;
  ts: string;
  runId: string;
  actionId: MorpheusActionId;
  phase: MorpheusRunPhase;
  target?: MorpheusResolvedTarget;
  result?: MorpheusActionResult;
  error?: MorpheusError;
  durationMs?: number;
  reason?: string;
};

/** Renderer-side projection of a run. */
export type MorpheusRun = {
  runId: string;
  actionId: MorpheusActionId;
  phase: MorpheusRunPhase;
  seq: number;
  requestedAt: string;
  updatedAt: string;
  target?: MorpheusResolvedTarget;
  result?: MorpheusActionResult;
  error?: MorpheusError;
  durationMs?: number;
};

export type MorpheusActionSnapshot = {
  runOrder: string[];
  runsById: Record<string, MorpheusRun>;
};

export type MorpheusPermissionDecision = 'granted' | 'denied';

export type MorpheusRequestActionPayload = {
  actionId: string;
  params?: MorpheusActionParams;
  originType?: import('./execution-types').ExecutionOriginType;
  agentId?: string;
};

export type MorpheusRequestActionResult = {
  runId: string;
};

export type MorpheusPermissionDecisionInput =
  | MorpheusPermissionDecision
  | 'deny' | 'deny-always' | 'allow-once' | 'allow-session' | 'allow-always';

export type MorpheusRespondPermissionPayload = {
  runId: string;
  decision: MorpheusPermissionDecisionInput;
};

export type MorpheusCancelActionPayload = {
  runId: string;
};

export type MorpheusAcknowledgement = {
  accepted: boolean;
};

export type MorpheusAuditRecentPayload = {
  limit?: number;
};

/**
 * One line of the append-only audit log.
 *
 * `params` is sanitized: text file content is never present. Content is
 * represented by `contentBytes` and `contentSha256` only.
 */
export type MorpheusAuditEntry = {
  v: typeof MORPHEUS_AUDIT_VERSION;
  seq: number;
  ts: string;
  runId: string;
  actionId: MorpheusActionId;
  phase: MorpheusRunPhase;
  decision?: MorpheusPermissionDecision;
  reason?: string;
  grantId?: string;
  params?: Record<string, string | number | boolean>;
  target?: MorpheusResolvedTarget;
  outcome?: MorpheusActionResult;
  error?: MorpheusError;
  durationMs?: number;
  appVersion: string;
  pid?: number | null;
};

export type MorpheusAuditRecentResult = {
  entries: MorpheusAuditEntry[];
  truncated: boolean;
};

export type MorpheusActionAvailability = {
  actionId: MorpheusActionId;
  supported: boolean;
};

export type MorpheusDescribeActionsResult = {
  platform: string;
  actions: MorpheusActionAvailability[];
  applicationKeys: string[];
};
