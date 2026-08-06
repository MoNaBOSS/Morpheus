/**
 * Morpheus action runtime.
 *
 * Owns run lifecycle, the permission gate, audit ordering and event emission.
 * Every invariant in `harness/specs/rules/morpheus-native-action-safety.md`
 * that is not a property of a single capability lives here.
 *
 * IMPORTANT: this module and everything it imports must stay independent of the
 * Gateway and ACP services. Native actions are a product capability in their own
 * right, not an agent tool surface, so the agent runtime beside them stays
 * replaceable. Enforced by `tests/unit/morpheus-runtime-isolation.test.ts`.
 */
import { randomUUID } from 'node:crypto';

import {
  MORPHEUS_MAX_AUDIT_PAGE,
  MORPHEUS_MAX_CONCURRENT_RUNS,
  MORPHEUS_MAX_RUNS_PER_MINUTE,
  MORPHEUS_PERMISSION_TIMEOUT_MS,
  getMorpheusActionDescriptor,
  isMorpheusActionId,
  listMorpheusActionIds,
  listMorpheusApplicationKeys,
} from '@shared/morpheus/actions/registry';
import type { MorpheusActionId } from '@shared/morpheus/actions/registry';
import {
  MORPHEUS_AUDIT_VERSION,
  MORPHEUS_EVENT_VERSION,
  type MorpheusAcknowledgement,
  type MorpheusActionEvent,
  type MorpheusActionParams,
  type MorpheusActionResult,
  type MorpheusAuditEntry,
  type MorpheusAuditRecentPayload,
  type MorpheusAuditRecentResult,
  type MorpheusCancelActionPayload,
  type MorpheusDescribeActionsResult,
  type MorpheusError,
  type MorpheusFailureCode,
  type MorpheusPermissionDecision,
  type MorpheusRequestActionPayload,
  type MorpheusRequestActionResult,
  type MorpheusRespondPermissionPayload,
  type MorpheusResolvedTarget,
  type MorpheusRunPhase,
  type MorpheusSystemInfo,
} from '@shared/morpheus/action-types';

import { morpheusContentDigest, type MorpheusAuditSink } from './audit';
import {
  MorpheusCapabilityError,
  type MorpheusCapabilityRegistry,
  type MorpheusResolution,
} from './capability-registry';
import type { MorpheusPermissionGate } from './policy/permission-gate';
import type { MorpheusGrantStore } from './policy/grant-store';
import type { AuditHealth } from './policy/policy-engine';
import {
  decisionCreatesGrant,
  type PermissionDecisionKind,
  type PermissionResolutionReason,
  type PermissionScope,
} from '@shared/morpheus/permission-types';
import type { ExecutionOriginType } from '@shared/morpheus/execution-types';
import type { MorpheusRootProvider } from './roots';
import { collectMorpheusSystemInfo } from './capabilities/win32/system-report';

export class MorpheusRequestError extends Error {
  constructor(public readonly code: MorpheusFailureCode, message: string) {
    super(message);
    this.name = 'MorpheusRequestError';
  }
}

type PendingRun = {
  runId: string;
  actionId: MorpheusActionId;
  scope: PermissionScope;
  target: MorpheusResolvedTarget;
  resolution: MorpheusResolution;
  auditParams: Record<string, string | number | boolean>;
  startedAt: number;
  timer: NodeJS.Timeout;
};

export type MorpheusRuntimeOptions = {
  registry: MorpheusCapabilityRegistry;
  roots: MorpheusRootProvider;
  audit: MorpheusAuditSink;
  gate: MorpheusPermissionGate;
  grants: MorpheusGrantStore;
  /** Reports whether audit persistence is currently healthy. */
  auditHealth?: () => AuditHealth;
  appVersion: string;
  emit: (event: MorpheusActionEvent) => void;
  platform?: string;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  createRunId?: () => string;
  permissionTimeoutMs?: number;
};

export interface MorpheusRuntime {
  describeActions(): MorpheusDescribeActionsResult;
  systemInfo(): MorpheusSystemInfo;
  requestAction(payload: MorpheusRequestActionPayload): Promise<MorpheusRequestActionResult>;
  respondPermission(payload: MorpheusRespondPermissionPayload): Promise<MorpheusAcknowledgement>;
  cancelAction(payload: MorpheusCancelActionPayload): Promise<MorpheusAcknowledgement>;
  auditRecent(payload?: MorpheusAuditRecentPayload): Promise<MorpheusAuditRecentResult>;
  dispose(): void;
}

/**
 * Builds the audit view of the request parameters.
 *
 * Text file content is never carried through. It is represented by a byte count
 * and a truncated digest, which is enough to prove what was written without
 * retaining it.
 */
export function buildAuditParams(params: MorpheusActionParams): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (typeof params.applicationKey === 'string') out.applicationKey = params.applicationKey;
  if (typeof params.fileName === 'string') out.fileName = params.fileName;
  if (typeof params.content === 'string') {
    out.contentBytes = Buffer.byteLength(params.content, 'utf8');
    out.contentSha256 = morpheusContentDigest(params.content);
  }
  return out;
}

/**
 * Resource scope for a grant, taken from the target Main RESOLVED.
 *
 * Never from the request: a grant must bind to a real, verified target so
 * "always allow" cannot be attached to something the user was not shown.
 */
export function resourceScopeFor(target: MorpheusResolvedTarget): string {
  if (target.kind === 'executable') return target.applicationKey;
  // The containing approved root, not the individual file — otherwise every new
  // filename would re-prompt and the grant would be useless.
  if (target.kind === 'file') return target.path.slice(0, Math.max(0, target.path.lastIndexOf('\\')));
  return 'runtime';
}

const DECISION_KINDS: readonly PermissionDecisionKind[] = [
  'deny', 'deny-always', 'allow-once', 'allow-session', 'allow-always',
];

/**
 * Accepts the five decision kinds, and maps the 0.1 wire values
 * (`granted`/`denied`) onto them so older callers keep working.
 */
export function normalizeDecision(value: unknown): PermissionDecisionKind | null {
  if (value === 'granted') return 'allow-once';
  if (value === 'denied') return 'deny';
  return DECISION_KINDS.includes(value as PermissionDecisionKind)
    ? (value as PermissionDecisionKind)
    : null;
}

export function createMorpheusRuntime(options: MorpheusRuntimeOptions): MorpheusRuntime {
  const now = options.now ?? (() => new Date());
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const createRunId = options.createRunId ?? (() => randomUUID());
  const permissionTimeoutMs = options.permissionTimeoutMs ?? MORPHEUS_PERMISSION_TIMEOUT_MS;

  const pending = new Map<string, PendingRun>();
  const executing = new Set<string>();
  let recentRequests: number[] = [];
  let seq = 0;

  const nextSeq = (): number => {
    seq += 1;
    return seq;
  };

  /**
   * The single ordering guarantee of the whole system: the audit record is
   * durable BEFORE the Renderer is told anything. The interface can never show
   * an outcome the audit did not capture.
   */
  const transition = async (
    input: {
      runId: string;
      actionId: MorpheusActionId;
      phase: MorpheusRunPhase;
      auditParams?: Record<string, string | number | boolean>;
      target?: MorpheusResolvedTarget;
      result?: MorpheusActionResult;
      error?: MorpheusError;
      decision?: MorpheusPermissionDecision;
      reason?: PermissionResolutionReason;
      grantId?: string;
      durationMs?: number;
      pid?: number | null;
    },
  ): Promise<void> => {
    const currentSeq = nextSeq();
    const ts = now().toISOString();

    const auditEntry: MorpheusAuditEntry = {
      v: MORPHEUS_AUDIT_VERSION,
      seq: currentSeq,
      ts,
      runId: input.runId,
      actionId: input.actionId,
      phase: input.phase,
      decision: input.decision,
      reason: input.reason,
      grantId: input.grantId,
      params: input.auditParams,
      target: input.target,
      outcome: input.result,
      error: input.error,
      durationMs: input.durationMs,
      appVersion: options.appVersion,
      pid: input.pid,
    };

    try {
      await options.audit.record(auditEntry);
    } catch {
      // A failing audit sink must not silently downgrade to an unaudited
      // action. The phase still reaches the Renderer so the run is visible,
      // but the failure is not swallowed into success either: emission below
      // proceeds only after this attempt has completed.
    }

    const event: MorpheusActionEvent = {
      v: MORPHEUS_EVENT_VERSION,
      seq: currentSeq,
      ts,
      runId: input.runId,
      actionId: input.actionId,
      phase: input.phase,
      target: input.target,
      result: input.result,
      error: input.error,
      durationMs: input.durationMs,
    };
    options.emit(event);
  };

  const withinRateLimit = (): boolean => {
    const cutoff = now().getTime() - 60_000;
    recentRequests = recentRequests.filter((timestamp) => timestamp > cutoff);
    return recentRequests.length < MORPHEUS_MAX_RUNS_PER_MINUTE;
  };

  const inFlight = (): number => pending.size + executing.size;

  const toError = (error: unknown, fallback: MorpheusFailureCode): MorpheusError => {
    if (error instanceof MorpheusCapabilityError) {
      return { code: error.code, message: error.message };
    }
    if (error instanceof MorpheusRequestError) {
      return { code: error.code, message: error.message };
    }
    return {
      code: fallback,
      message: error instanceof Error ? error.message : 'Unknown failure',
    };
  };

  /**
   * Removes the pending record and returns it, or `undefined` if it was already
   * consumed. Removal happens before any execution, so a repeated or racing
   * response can never start a second run.
   */
  const consumePending = (runId: string): PendingRun | undefined => {
    const run = pending.get(runId);
    if (!run) return undefined;
    pending.delete(runId);
    clearTimeout(run.timer);
    return run;
  };

  const finishDenied = async (
    run: PendingRun,
    phase: Extract<MorpheusRunPhase, 'denied' | 'cancelled' | 'timed-out'>,
    code: MorpheusFailureCode,
    message: string,
  ): Promise<void> => {
    await transition({
      runId: run.runId,
      actionId: run.actionId,
      phase,
      auditParams: run.auditParams,
      target: run.target,
      decision: phase === 'denied' ? 'denied' : undefined,
      error: { code, message },
      durationMs: now().getTime() - run.startedAt,
    });
  };

  const execute = async (
    run: PendingRun,
    reason?: PermissionResolutionReason,
    grantId?: string,
  ): Promise<void> => {
    executing.add(run.runId);
    try {
      await transition({
        runId: run.runId,
        actionId: run.actionId,
        phase: 'running',
        auditParams: run.auditParams,
        target: run.target,
        decision: 'granted',
        reason,
        grantId,
      });

      let result: MorpheusActionResult;
      try {
        result = await run.resolution.execute();
      } catch (error) {
        await transition({
          runId: run.runId,
          actionId: run.actionId,
          phase: 'failed',
          auditParams: run.auditParams,
          target: run.target,
          error: toError(error, 'execution-failed'),
          durationMs: now().getTime() - run.startedAt,
        });
        return;
      }

      await transition({
        runId: run.runId,
        actionId: run.actionId,
        phase: 'succeeded',
        auditParams: run.auditParams,
        target: run.target,
        result,
        durationMs: now().getTime() - run.startedAt,
        pid: result.kind === 'launch' ? result.pid : undefined,
      });
    } finally {
      executing.delete(run.runId);
    }
  };

  return {
    describeActions(): MorpheusDescribeActionsResult {
      const supported = new Set(options.registry.supportedActions(platform));
      return {
        platform,
        actions: listMorpheusActionIds().map((actionId) => ({
          actionId,
          supported: supported.has(actionId),
        })),
        applicationKeys: [...listMorpheusApplicationKeys()],
      };
    },

    /**
     * Read-only, side-effect free, and therefore neither gated nor audited. It
     * exposes nothing beyond what an About screen shows, and the boot sequence
     * uses it as a genuine host-bridge liveness check.
     */
    systemInfo(): MorpheusSystemInfo {
      return collectMorpheusSystemInfo(options.appVersion);
    },

    async requestAction(payload: MorpheusRequestActionPayload): Promise<MorpheusRequestActionResult> {
      // Not yet a run: a malformed or unknown request never becomes an auditable
      // lifecycle, it is rejected at the boundary.
      if (!isMorpheusActionId(payload?.actionId)) {
        throw new MorpheusRequestError('unknown-action', 'Unknown Morpheus action');
      }
      const actionId = payload.actionId;
      const params: MorpheusActionParams = payload.params ?? {};
      const originType: ExecutionOriginType = payload.originType ?? 'action-launcher';
      const agentId = payload.agentId;
      const auditParams = buildAuditParams(params);
      const runId = createRunId();
      const startedAt = now().getTime();

      await transition({ runId, actionId, phase: 'requested', auditParams });

      if (!withinRateLimit() || inFlight() >= MORPHEUS_MAX_CONCURRENT_RUNS) {
        await transition({
          runId,
          actionId,
          phase: 'failed',
          auditParams,
          error: { code: 'rate-limited', message: 'Another action is already in progress' },
          durationMs: now().getTime() - startedAt,
        });
        return { runId };
      }
      recentRequests.push(startedAt);

      const capability = options.registry.resolve(actionId, platform);
      if (!capability) {
        await transition({
          runId,
          actionId,
          phase: 'unsupported-platform',
          auditParams,
          error: { code: 'unsupported-platform', message: `${actionId} is not available on ${platform}` },
          durationMs: now().getTime() - startedAt,
        });
        return { runId };
      }

      let resolution: MorpheusResolution;
      try {
        resolution = await capability.resolve(params, {
          roots: options.roots,
          appVersion: options.appVersion,
          env,
        });
      } catch (error) {
        await transition({
          runId,
          actionId,
          phase: 'failed',
          auditParams,
          error: toError(error, 'resolution-failed'),
          durationMs: now().getTime() - startedAt,
        });
        return { runId };
      }

      // Resource scope is derived from what Main RESOLVED, never from the
      // request, so a grant can only ever bind to a real target.
      const scope: PermissionScope = {
        capabilityId: actionId,
        platform,
        resourceScope: resourceScopeFor(resolution.target),
        riskTier: getMorpheusActionDescriptor(actionId).riskTier,
        originType,
        agentId,
      };

      const verdict = options.gate.evaluate({
        scope,
        auditHealth: (options.auditHealth ?? (() => 'healthy' as AuditHealth))(),
      });

      if (verdict.outcome === 'deny') {
        await transition({
          runId,
          actionId,
          phase: 'denied',
          auditParams,
          target: resolution.target,
          decision: 'denied',
          reason: verdict.reason,
          error: {
            code: verdict.reason === 'audit-degraded' ? 'internal' : 'permission-denied',
            message: verdict.reason === 'audit-degraded'
              ? 'Blocked: auditing is unavailable, so only read-only actions may run'
              : 'Blocked by a saved decision for this exact scope',
          },
          durationMs: now().getTime() - startedAt,
        });
        return { runId };
      }

      const timer = setTimeout(() => {
        const timedOut = consumePending(runId);
        if (!timedOut) return;
        void finishDenied(timedOut, 'timed-out', 'permission-timeout', 'Confirmation was not answered in time');
      }, permissionTimeoutMs);
      // A pending confirmation must never hold the process open.
      timer.unref?.();

      const run: PendingRun = {
        runId,
        actionId,
        scope,
        target: resolution.target,
        resolution,
        auditParams,
        startedAt,
        timer,
      };

      if (verdict.outcome === 'allow') {
        clearTimeout(timer);
        if (verdict.grantId) options.gate.recordGrantUse(verdict.grantId);
        await execute(run, verdict.reason, verdict.grantId);
        return { runId };
      }

      pending.set(runId, run);
      await transition({
        runId,
        actionId,
        phase: 'awaiting-permission',
        auditParams,
        target: resolution.target,
        reason: verdict.reason,
      });
      return { runId };
    },

    async respondPermission(payload: MorpheusRespondPermissionPayload): Promise<MorpheusAcknowledgement> {
      const runId = typeof payload?.runId === 'string' ? payload.runId : '';
      const decision = normalizeDecision(payload?.decision);
      if (!decision) {
        throw new MorpheusRequestError('invalid-params', 'unsupported permission decision');
      }

      const run = consumePending(runId);
      if (!run) return { accepted: false };

      // A remembered decision is stored BEFORE the action runs, so a crash
      // mid-execution cannot lose the consent the user just gave.
      if (decisionCreatesGrant(decision)) {
        const grantType = decision === 'allow-session'
          ? 'session'
          : decision === 'allow-always'
            ? 'persistent'
            : 'denied-persistent';
        options.grants.createGrant(run.scope, grantType);
      }

      if (decision === 'deny' || decision === 'deny-always') {
        await finishDenied(run, 'denied', 'permission-denied', 'Denied by the user');
        return { accepted: true };
      }

      await execute(run, 'prompt-required');
      return { accepted: true };
    },

    async cancelAction(payload: MorpheusCancelActionPayload): Promise<MorpheusAcknowledgement> {
      const runId = typeof payload?.runId === 'string' ? payload.runId : '';
      const run = consumePending(runId);
      if (!run) return { accepted: false };
      await finishDenied(run, 'cancelled', 'cancelled', 'Cancelled before execution');
      return { accepted: true };
    },

    auditRecent(payload?: MorpheusAuditRecentPayload): Promise<MorpheusAuditRecentResult> {
      const requested = typeof payload?.limit === 'number' ? payload.limit : MORPHEUS_MAX_AUDIT_PAGE;
      return options.audit.recent(requested);
    },

    dispose(): void {
      for (const run of pending.values()) clearTimeout(run.timer);
      pending.clear();
      executing.clear();
    },
  };
}
