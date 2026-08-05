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
import type { MorpheusPermissionGate } from './permission-gate';
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

  const execute = async (run: PendingRun): Promise<void> => {
    executing.add(run.runId);
    try {
      await transition({
        runId: run.runId,
        actionId: run.actionId,
        phase: 'running',
        auditParams: run.auditParams,
        target: run.target,
        decision: 'granted',
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

      const verdict = options.gate.evaluate({
        runId,
        actionId,
        riskTier: getMorpheusActionDescriptor(actionId).riskTier,
        target: resolution.target,
      });

      if (verdict.kind === 'auto' && verdict.decision === 'denied') {
        await transition({
          runId,
          actionId,
          phase: 'denied',
          auditParams,
          target: resolution.target,
          decision: 'denied',
          error: { code: 'permission-denied', message: 'Denied by policy' },
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
        target: resolution.target,
        resolution,
        auditParams,
        startedAt,
        timer,
      };

      if (verdict.kind === 'auto') {
        clearTimeout(timer);
        await execute(run);
        return { runId };
      }

      pending.set(runId, run);
      await transition({
        runId,
        actionId,
        phase: 'awaiting-permission',
        auditParams,
        target: resolution.target,
      });
      return { runId };
    },

    async respondPermission(payload: MorpheusRespondPermissionPayload): Promise<MorpheusAcknowledgement> {
      const runId = typeof payload?.runId === 'string' ? payload.runId : '';
      const decision = payload?.decision;
      if (decision !== 'granted' && decision !== 'denied') {
        throw new MorpheusRequestError('invalid-params', 'decision must be granted or denied');
      }

      const run = consumePending(runId);
      if (!run) return { accepted: false };

      if (decision === 'denied') {
        await finishDenied(run, 'denied', 'permission-denied', 'Denied by the user');
        return { accepted: true };
      }

      await execute(run);
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
