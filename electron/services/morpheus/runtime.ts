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
  type MorpheusActionId,
  type MorpheusParamsFor,
} from '@shared/morpheus/actions/registry';
import {
  MORPHEUS_AUDIT_VERSION,
  MORPHEUS_EVENT_VERSION,
  type MorpheusAcknowledgement,
  type MorpheusActionEvent,
  type MorpheusActionParams,
  type MorpheusParamRecord,
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
  grantTypeForDecision,
  type PermissionDecisionKind,
  type PermissionResolutionReason,
  type PermissionScope,
} from '@shared/morpheus/permission-types';
import type {
  ExecutionOriginType,
  ExecutionPlan,
  ExecutionStep,
} from '@shared/morpheus/execution-types';
import {
  executePlan as runPlanGraph,
  type PlanStepRunner,
  type PrepareResult,
  type RunResult,
} from './plan/executor';
import type { TrustBoundary } from './plan/trust';
import { createMorpheusPlanStore, type MorpheusPlanStore } from './plan/plan-store';
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
  /** Main-held plans. Supplied in tests; created here otherwise. */
  planStore?: MorpheusPlanStore;
  /** Emits the batched consent request for a plan. */
  emitPlanConsent?: (request: MorpheusPlanConsentRequest) => void;
};

/**
 * One consent request covering a whole plan.
 *
 * Deduplicated by `evaluatePlanTrust`, so five steps writing into the same
 * folder arrive as one boundary rather than five prompts.
 */
export type MorpheusPlanConsentRequest = {
  planId: string;
  objective: string;
  boundaries: readonly TrustBoundary[];
};

export type MorpheusExecutePlanPayload = {
  /** A plan id Main issued. A plan object is never accepted from the renderer. */
  planId: string;
};

export type MorpheusPlanDecisionsPayload = {
  planId: string;
  /**
   * Boundary id to decision. Typed as `string` because this is wire data; the
   * runtime normalises each value and drops anything unrecognised, and a
   * boundary left out counts as a refusal.
   */
  decisions: Record<string, string>;
};

export interface MorpheusRuntime {
  describeActions(): MorpheusDescribeActionsResult;
  systemInfo(): MorpheusSystemInfo;
  requestAction(payload: MorpheusRequestActionPayload): Promise<MorpheusRequestActionResult>;
  respondPermission(payload: MorpheusRespondPermissionPayload): Promise<MorpheusAcknowledgement>;
  cancelAction(payload: MorpheusCancelActionPayload): Promise<MorpheusAcknowledgement>;
  auditRecent(payload?: MorpheusAuditRecentPayload): Promise<MorpheusAuditRecentResult>;
  /** Stores a Main-authored plan and returns it, so the renderer can preview it. */
  registerPlan(plan: ExecutionPlan): ExecutionPlan;
  /** Executes a stored plan by id, evaluating trust across the whole plan first. */
  executePlan(payload: MorpheusExecutePlanPayload): Promise<MorpheusPlanExecutionResult>;
  /** Answers a batched consent request. */
  respondPlanPermission(payload: MorpheusPlanDecisionsPayload): Promise<MorpheusAcknowledgement>;
  dispose(): void;
}

export type MorpheusPlanExecutionResult = {
  planId: string;
  status: ExecutionPlan['status'];
  steps: readonly import('@shared/morpheus/execution-types').ExecutionStepResult[];
  rejection?: { code: string; message: string };
};

/**
 * Builds the audit view of the request parameters.
 *
 * Driven by the capability's declared parameter KINDS rather than a hardcoded
 * key list, so a capability added later cannot accidentally leak a payload the
 * audit was never taught about: anything declared `textContent` is replaced by a
 * byte count and a truncated digest — enough to prove what was written without
 * retaining it — and a key absent from the descriptors is dropped entirely.
 */
export function buildAuditParams(
  actionId: MorpheusActionId,
  params: MorpheusParamRecord,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const descriptor of getMorpheusActionDescriptor(actionId).params) {
    const value = params[descriptor.key];
    if (value === undefined) continue;
    if (descriptor.kind === 'textContent') {
      const text = String(value);
      out[`${descriptor.key}Bytes`] = Buffer.byteLength(text, 'utf8');
      out[`${descriptor.key}Sha256`] = morpheusContentDigest(text);
      continue;
    }
    out[descriptor.key] = value;
  }
  return out;
}

/**
 * Resource scope for a grant, taken from the target Main RESOLVED.
 *
 * Never from the request: a grant must bind to a real, verified target so
 * "always allow" cannot be attached to something the user was not shown.
 */
/**
 * The concrete thing an action will act on, for display in a prompt.
 *
 * Deliberately the FULL path, not the grant scope: the user is approving this
 * specific file or executable now, and a folder alone would hide which file.
 */
export function describeTarget(target: MorpheusResolvedTarget): string | undefined {
  return target.kind === 'none' ? undefined : target.path;
}

export function resourceScopeFor(target: MorpheusResolvedTarget): string {
  if (target.kind === 'executable') return target.applicationKey;
  // The WORKSPACE root, not the file and not its parent directory. Trust is
  // workspace-oriented: approving a workspace covers work anywhere inside it,
  // however deeply nested, so routine operations do not re-prompt as folders
  // grow. Narrowing to the parent directory would make every subfolder its own
  // boundary, which is the prompt fatigue the permission model rejects.
  if (target.kind === 'file' || target.kind === 'folder') return target.workspaceRoot;
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
  const planStore = options.planStore ?? createMorpheusPlanStore({ now });
  /** Parked consent requests, one per in-flight plan. */
  const planConsent = new Map<string, {
    resolve: (decisions: ReadonlyMap<string, PermissionDecisionKind>) => void;
    timer: NodeJS.Timeout;
  }>();
  let recentRequests: number[] = [];
  // Shared across Command Center, workflow, schedule and Quick Command. The
  // 0.5 executor is deliberately sequential, so no entry point can race a
  // second plan between two steps of the first.
  let activePlans = 0;
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

  /**
   * Writes an audit record WITHOUT emitting a run event.
   *
   * Used for plan-level facts that are not phases of any single run — asking
   * for consent is the case today. Emitting these as run events would
   * fabricate pending runs in the interface, which is both untrue and would
   * open the per-run permission dialog for a plan that has its own.
   */
  const recordOnly = async (entry: Omit<MorpheusAuditEntry, 'v' | 'seq' | 'ts' | 'appVersion'>): Promise<void> => {
    try {
      await options.audit.record({
        v: MORPHEUS_AUDIT_VERSION,
        seq: nextSeq(),
        ts: now().toISOString(),
        appVersion: options.appVersion,
        ...entry,
      });
    } catch {
      // Same posture as `transition`: a failing sink is not silently upgraded
      // into a success, but it does not abort the surrounding decision either.
    }
  };

  const withinRateLimit = (): boolean => {
    const cutoff = now().getTime() - 60_000;
    recentRequests = recentRequests.filter((timestamp) => timestamp > cutoff);
    return recentRequests.length < MORPHEUS_MAX_RUNS_PER_MINUTE;
  };

  const inFlight = (): number => pending.size + executing.size + activePlans;

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

  /**
   * Runs a prepared step and records its outcome.
   *
   * Returns the failure, or `null` on success, so a caller (the plan executor)
   * learns what happened from the same code path that audited it. A separate
   * success/failure signal could drift from the recorded phase.
   */
  const execute = async (
    run: PendingRun,
    reason?: PermissionResolutionReason,
    grantId?: string,
  ): Promise<MorpheusError | null> => {
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
        const failure = toError(error, 'execution-failed');
        await transition({
          runId: run.runId,
          actionId: run.actionId,
          phase: 'failed',
          auditParams: run.auditParams,
          target: run.target,
          error: failure,
          durationMs: now().getTime() - run.startedAt,
        });
        return failure;
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
      return null;
    } finally {
      executing.delete(run.runId);
    }
  };

  /**
   * Adapts one plan step onto the existing per-step machinery.
   *
   * `prepare` resolves the real target and derives the scope but executes
   * nothing, which is what lets the whole plan be assessed before the user is
   * asked anything. `run` reuses `execute`, so plan steps inherit the same
   * audit-before-emit ordering and the same failure handling as a direct
   * action — there is no second, weaker execution path.
   */
  const planStepRunner = (originType: ExecutionOriginType, agentId?: string): PlanStepRunner => ({
    async prepare(step: ExecutionStep): Promise<PrepareResult> {
      const actionId = step.capabilityId;
      if (!isMorpheusActionId(actionId)) {
        return { ok: false, error: { code: 'unknown-action', message: `Unknown action: ${String(actionId)}` } };
      }
      const capability = options.registry.resolve(actionId, platform);
      if (!capability) {
        return {
          ok: false,
          error: { code: 'unsupported-platform', message: `${actionId} is not available on ${platform}` },
        };
      }

      let resolution: MorpheusResolution;
      try {
        resolution = await capability.resolve(step.params as MorpheusParamsFor<MorpheusActionId>, {
          roots: options.roots,
          appVersion: options.appVersion,
          env,
        });
      } catch (error) {
        return { ok: false, error: toError(error, 'resolution-failed') };
      }

      // Scope comes from what Main RESOLVED, never from the step's declared
      // permission block — otherwise a plan could name a narrower scope than
      // the one it actually touches.
      const descriptor = getMorpheusActionDescriptor(actionId);
      const scope: PermissionScope = {
        capabilityId: actionId,
        // Grouped capabilities share ONE workspace decision, so the grant binds
        // to the group rather than the verb. Audit still records the exact
        // capability, so history stays precise while trust stays workspace-shaped.
        capabilityGroup: descriptor.group,
        platform,
        resourceScope: resourceScopeFor(resolution.target),
        riskTier: descriptor.riskTier,
        originType,
        agentId,
      };
      return {
        ok: true,
        prepared: {
          stepId: step.stepId,
          scope,
          target: describeTarget(resolution.target),
          handle: { resolution, actionId },
        },
      };
    },

    async run(step, prepared, reason): Promise<RunResult> {
      const { resolution, actionId } = prepared.handle as {
        resolution: MorpheusResolution;
        actionId: MorpheusActionId;
      };
      const runId = createRunId();
      const startedAt = now().getTime();
      const auditParams = buildAuditParams(actionId, step.params as MorpheusParamRecord);

      await transition({ runId, actionId, phase: 'requested', auditParams });

      const run: PendingRun = {
        runId,
        actionId,
        scope: prepared.scope,
        target: resolution.target,
        resolution,
        auditParams,
        startedAt,
        timer: setTimeout(() => undefined, 0),
      };
      clearTimeout(run.timer);

      // `execute` records the outcome and returns it, so the plan's view and
      // the audit trail come from the same place and cannot disagree.
      const failure = await execute(run, reason as PermissionResolutionReason);
      const durationMs = now().getTime() - startedAt;
      return failure
        ? { status: 'failed', error: failure, durationMs }
        : { status: 'succeeded', durationMs };
    },

    /**
     * Records a refusal as a real `denied` phase, so a denied plan leaves the
     * same audit evidence a denied single action does.
     */
    async deny(step, prepared, reason): Promise<void> {
      const actionId = step.capabilityId;
      if (!isMorpheusActionId(actionId)) return;
      const handle = prepared?.handle as { resolution?: MorpheusResolution } | undefined;
      await transition({
        runId: createRunId(),
        actionId,
        phase: 'denied',
        auditParams: buildAuditParams(actionId, step.params as MorpheusParamRecord),
        target: handle?.resolution?.target,
        decision: 'denied',
        error: { code: 'permission-denied', message: `Refused: ${reason}` },
      });
    },

    async skip(step, because): Promise<void> {
      const actionId = step.capabilityId;
      if (!isMorpheusActionId(actionId)) return;
      await transition({
        runId: createRunId(),
        actionId,
        phase: 'cancelled',
        auditParams: buildAuditParams(actionId, step.params as MorpheusParamRecord),
        error: { code: 'cancelled', message: `Skipped because ${because} failed` },
      });
    },
  });

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
      const auditParams = buildAuditParams(payload.actionId, params);
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
        // The registry dispatches on a runtime id, so the static type argument
        // is erased at the lookup. `params` was validated against THIS action's
        // descriptors in `validateRequestActionPayload` before reaching here.
        resolution = await capability.resolve(params as MorpheusParamsFor<MorpheusActionId>, {
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
      const singleDescriptor = getMorpheusActionDescriptor(actionId);
      const scope: PermissionScope = {
        capabilityId: actionId,
        // Grouped capabilities share ONE workspace decision, so the grant binds
        // to the group rather than the verb. Audit still records the exact
        // capability, so history stays precise while trust stays workspace-shaped.
        capabilityGroup: singleDescriptor.group,
        platform,
        resourceScope: resourceScopeFor(resolution.target),
        riskTier: singleDescriptor.riskTier,
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
        if (verdict.grantId) {
          options.gate.recordGrantUse(verdict.grantId);
          await options.audit.recordControl({
            category: 'permission', event: 'grant-used', subjectId: verdict.grantId,
            details: {
              capabilityId: scope.capabilityId,
              resourceScope: scope.resourceScope,
              originType: scope.originType,
            },
            appVersion: options.appVersion,
          });
        }
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
      const grantType = grantTypeForDecision(decision);
      if (grantType) {
        const grant = options.grants.createGrant(run.scope, grantType);
        await options.audit.recordControl({
          category: 'permission',
          event: grantType === 'denied-persistent' ? 'denial-created' : 'grant-created',
          subjectId: grant.grantId,
          details: {
            capabilityId: run.scope.capabilityId,
            resourceScope: run.scope.resourceScope,
            originType: run.scope.originType,
            grantType,
          },
          appVersion: options.appVersion,
        });
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

    /**
     * Stores a Main-authored plan so the renderer can preview it and later name
     * it by id. A plan object never travels back inbound.
     */
    registerPlan(plan: ExecutionPlan): ExecutionPlan {
      planStore.put(plan);
      return plan;
    },

    async executePlan(payload: MorpheusExecutePlanPayload): Promise<MorpheusPlanExecutionResult> {
      const planId = typeof payload?.planId === 'string' ? payload.planId : '';
      // `take` rather than `get`: a plan executes once. Leaving it retrievable
      // would let an already-approved plan be replayed without a fresh decision.
      const plan = planStore.take(planId);
      if (!plan) {
        return {
          planId,
          status: 'rejected',
          steps: [],
          rejection: { code: 'unknown-action', message: 'Unknown or expired plan' },
        };
      }

      if (!withinRateLimit() || inFlight() >= MORPHEUS_MAX_CONCURRENT_RUNS) {
        return {
          planId,
          status: 'rejected',
          steps: [],
          rejection: { code: 'rate-limited', message: 'Another action is already in progress' },
        };
      }
      recentRequests.push(now().getTime());

      activePlans += 1;
      try {
        const result = await runPlanGraph({
          plan,
          runner: planStepRunner(
            plan.origin.type,
            'agentProfileId' in plan.origin ? plan.origin.agentProfileId : undefined,
          ),
          policy: options.gate,
          auditHealth: (options.auditHealth ?? (() => 'healthy' as AuditHealth))(),
          now,

        /**
         * Parks ONE request for the whole plan and waits. A timeout resolves
         * EMPTY rather than allowing, and the executor treats a missing
         * decision as a refusal — so an unanswered prompt can never become
         * silent authority.
         */
          requestConsent: async (boundaries) => {
          // Record that the user WAS ASKED, before asking. Without this the
          // audit could show an execution with no evidence that consent was
          // ever sought — and the same ordering guarantee applies here as
          // everywhere else: persisted first, then surfaced.
          const stepsById = new Map(plan.steps.map((entry) => [entry.stepId, entry]));
          for (const boundary of boundaries) {
            for (const stepId of boundary.stepIds) {
              const step = stepsById.get(stepId);
              if (!step || !isMorpheusActionId(step.capabilityId)) continue;
              await recordOnly({
                runId: `${planId}:${stepId}`,
                actionId: step.capabilityId,
                phase: 'awaiting-permission',
                params: buildAuditParams(step.capabilityId, step.params as MorpheusParamRecord),
                reason: 'prompt-required',
              });
            }
          }

          return new Promise((resolve) => {
            const timer = setTimeout(() => {
              planConsent.delete(planId);
              resolve(new Map());
            }, permissionTimeoutMs);
            timer.unref?.();
            planConsent.set(planId, { resolve, timer });
            options.emitPlanConsent?.({ planId, objective: plan.objective, boundaries });
          });
          },

          persistDecision: async (scope, decision) => {
            const grantType = grantTypeForDecision(decision);
            if (!grantType) return;
            const grant = options.grants.createGrant(scope, grantType);
            await options.audit.recordControl({
              category: 'permission',
              event: grantType === 'denied-persistent' ? 'denial-created' : 'grant-created',
              subjectId: grant.grantId,
              details: {
                capabilityId: scope.capabilityId,
                resourceScope: scope.resourceScope,
                originType: scope.originType,
                grantType,
              },
              appVersion: options.appVersion,
            });
          },
          recordGrantUse: async (grantId, scope) => {
            options.gate.recordGrantUse(grantId);
            await options.audit.recordControl({
              category: 'permission', event: 'grant-used', subjectId: grantId,
              details: {
                capabilityId: scope.capabilityId,
                resourceScope: scope.resourceScope,
                originType: scope.originType,
              },
              appVersion: options.appVersion,
            });
          },
        });

        return { planId, status: result.status, steps: result.steps, rejection: result.rejection };
      } finally {
        activePlans -= 1;
      }
    },

    async respondPlanPermission(payload: MorpheusPlanDecisionsPayload): Promise<MorpheusAcknowledgement> {
      const planId = typeof payload?.planId === 'string' ? payload.planId : '';
      const parked = planConsent.get(planId);
      if (!parked) return { accepted: false };
      // Deleted before resolving, so a repeated or racing response is a no-op
      // rather than a second chance to change a decision already acted on.
      planConsent.delete(planId);
      clearTimeout(parked.timer);

      const decisions = new Map<string, PermissionDecisionKind>();
      for (const [boundaryId, value] of Object.entries(payload?.decisions ?? {})) {
        const decision = normalizeDecision(value);
        if (decision) decisions.set(boundaryId, decision);
      }
      parked.resolve(decisions);
      return { accepted: true };
    },

    auditRecent(payload?: MorpheusAuditRecentPayload): Promise<MorpheusAuditRecentResult> {
      const requested = typeof payload?.limit === 'number' ? payload.limit : MORPHEUS_MAX_AUDIT_PAGE;
      return options.audit.recent(requested);
    },

    dispose(): void {
      // A parked plan resolves empty, which the executor reads as a refusal.
      for (const parked of planConsent.values()) {
        clearTimeout(parked.timer);
        parked.resolve(new Map());
      }
      planConsent.clear();
      for (const run of pending.values()) clearTimeout(run.timer);
      pending.clear();
      executing.clear();
    },
  };
}
