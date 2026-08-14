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

import type { MorpheusActionId, MorpheusApplicationKey, MorpheusParamsFor } from './actions/registry';

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
  | 'workspace-unavailable'
  | 'workspace-read-only'
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
/**
 * What Main resolved an action to act on.
 *
 * File and folder targets carry `workspaceRoot`: the canonical approved root
 * they live under. Trust is workspace-oriented, so the grant scope is that
 * root — NOT the immediate parent directory. Deriving the scope by slicing the
 * parent would make every subfolder a new trust boundary, and a user who
 * approved a workspace would be re-prompted the moment work nested one level
 * deeper. That is exactly the prompt fatigue the permission model rejects.
 */
export type MorpheusResolvedTarget =
  | { kind: 'executable'; path: string; applicationKey: MorpheusApplicationKey }
  | { kind: 'file'; path: string; bytes: number; workspaceRoot: string }
  | { kind: 'folder'; path: string; entryCount?: number; workspaceRoot: string }
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

export type MorpheusStorageResult = {
  kind: 'storage';
  root: string;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
};

export type MorpheusProcessResult = {
  kind: 'processes';
  processes: ReadonlyArray<{ pid: number; name: string; memoryBytes?: number }>;
  truncated: boolean;
};

export type MorpheusUrlResult = {
  kind: 'url';
  url: string;
};

export type MorpheusProjectLaunchResult = {
  kind: 'project-launch';
  templateKey: 'vscode';
  path: string;
  executablePath: string;
  pid: number | null;
};

/** Contents of a file read from the workspace. */
export type MorpheusTextResult = {
  kind: 'text';
  path: string;
  bytes: number;
  contentSha256: string;
  /**
   * The text itself, for display in the interface.
   *
   * Carried on the RESULT, never into the audit record — `buildAuditParams`
   * reduces anything of kind `textContent` to a byte count and a digest, and
   * results are not audited verbatim.
   */
  text: string;
};

/** A directory listing or a name search. */
export type MorpheusListingResult = {
  kind: 'listing';
  path: string;
  entries: ReadonlyArray<{ name: string; kind: 'file' | 'folder' }>;
  /** True when the result was cut off at the capability's bound. */
  truncated: boolean;
};

/** An irreversible removal. Recorded so history shows what is gone. */
export type MorpheusDeletionResult = {
  kind: 'deletion';
  path: string;
  wasFolder: boolean;
  relativePath: string;
};

/** A transient OS notification that was actually shown. */
export type MorpheusNotificationResult = {
  kind: 'notification';
  title: string;
  body: string;
};

export type MorpheusActionResult =
  | MorpheusNotificationResult
  | MorpheusStorageResult
  | MorpheusProcessResult
  | MorpheusUrlResult
  | MorpheusProjectLaunchResult
  | MorpheusLaunchResult
  | MorpheusFileResult
  | MorpheusSystemResult
  | MorpheusTextResult
  | MorpheusListingResult
  | MorpheusDeletionResult;

/**
 * Privacy-safe execution metadata retained in the append-only audit ledger.
 *
 * Action results may contain file or clipboard text, notification copy,
 * process names, directory entries, or URL query strings. Those values are
 * useful transiently in the Renderer, but they are not required to prove that
 * an action ran and must never become durable audit content.
 */
export type MorpheusAuditOutcome =
  | MorpheusLaunchResult
  | MorpheusFileResult
  | MorpheusSystemResult
  | MorpheusStorageResult
  | MorpheusProjectLaunchResult
  | MorpheusDeletionResult
  | { kind: 'text'; path: string; bytes: number; contentSha256: string }
  | { kind: 'listing'; path: string; entryCount: number; truncated: boolean }
  | { kind: 'processes'; processCount: number; truncated: boolean }
  | { kind: 'url'; origin: string }
  | { kind: 'notification'; delivered: true };

/** Renderer-supplied parameters. Validated in Main against a key whitelist. */
/**
 * Any capability's validated parameters.
 *
 * 0.1.1 declared this as a flat bag of optionals shared by every capability. At
 * three that was tolerable; at ~18 it becomes forty optionals with no way to
 * express which combination is valid, and no way for a type error to catch a
 * parameter handed to the wrong capability.
 *
 * It is now the union of the per-capability shapes DERIVED from the registry
 * descriptors. Code handling an arbitrary action (audit, transport, storage)
 * uses this; a capability adapter uses `MorpheusParamsFor<'its.id'>` and gets
 * exactly its own keys.
 */
export type MorpheusActionParams = {
  [K in MorpheusActionId]: MorpheusParamsFor<K>;
}[MorpheusActionId];

/** Parameters as they travel and are stored: kind-checked, capability-agnostic. */
export type MorpheusParamRecord = Readonly<Record<string, string | number | boolean>>;

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
  /** Logical Main-owned workspace id. Never an absolute root. */
  workspaceId?: string;
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
  /** Privacy-safe metadata only; never the transient Renderer result. */
  outcome?: MorpheusAuditOutcome;
  error?: MorpheusError;
  durationMs?: number;
  appVersion: string;
  pid?: number | null;
};

export type MorpheusAuditRecentResult = {
  entries: MorpheusAuditEntry[];
  truncated: boolean;
};

export type MorpheusControlAuditCategory =
  | 'objective'
  | 'mission'
  | 'project'
  | 'memory'
  | 'onboarding'
  | 'planner'
  | 'voice'
  | 'permission'
  | 'workspace'
  | 'agent-profile'
  | 'workflow'
  | 'schedule'
  | 'runtime'
  | 'goal'
  | 'proactive'
  | 'system';

/** Non-capability policy/configuration fact in the same append-only ledger. */
export type MorpheusControlAuditEntry = {
  v: typeof MORPHEUS_AUDIT_VERSION;
  seq: number;
  ts: string;
  category: MorpheusControlAuditCategory;
  event: string;
  subjectId?: string;
  details?: Record<string, string | number | boolean>;
  appVersion: string;
};

export type MorpheusAuditRecord = MorpheusAuditEntry | MorpheusControlAuditEntry;

export type MorpheusAuditQueryPayload = {
  from?: string;
  to?: string;
  capabilityId?: string;
  phase?: MorpheusRunPhase;
  category?: 'execution' | MorpheusControlAuditCategory;
  limit?: number;
  cursor?: string;
};

export type MorpheusAuditQueryResult = {
  /** Newest first. */
  entries: MorpheusAuditRecord[];
  nextCursor?: string;
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
