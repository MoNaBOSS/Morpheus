import { randomUUID } from 'node:crypto';

import {
  DEFAULT_OBJECTIVE_LIMITS,
  MORPHEUS_OBJECTIVE_VERSION,
  isObjectiveTerminalState,
  type CancelMorpheusObjectivePayload,
  type CorrectMorpheusObjectivePayload,
  type MorpheusObjectiveEvent,
  type MorpheusObjectiveLimits,
  type MorpheusObjectiveRun,
  type MorpheusObjectiveSnapshot,
  type MorpheusPlanObservation,
  type MorpheusSystemState,
  type SubmitMorpheusObjectivePayload,
  type SubmitMorpheusObjectiveResult,
} from '@shared/morpheus/core/objective-types';
import type { MorpheusAgentProfile } from '@shared/morpheus/agent-profile-types';
import {
  getMorpheusActionDescriptor,
  isMorpheusWorkspaceWriteAction,
  listMorpheusActionIds,
  type MorpheusActionId,
} from '@shared/morpheus/actions/registry';
import type {
  ExecutionOrigin,
  ExecutionPlan,
  InterpretationResult,
} from '@shared/morpheus/execution-types';
import { createDeterministicMorpheusPlanner } from '@shared/morpheus/interpreter/deterministic-planner';
import type {
  MorpheusPlanner,
  MorpheusPlannerReviewResult,
  MorpheusPlanningCapability,
} from '@shared/morpheus/planner';
import type { MorpheusProject } from '@shared/morpheus/project-types';
import type { MorpheusMemory } from '@shared/morpheus/memory-types';
import {
  isMorpheusMissionId,
  type MorpheusObjectiveRoute,
} from '@shared/morpheus/mission-types';
import {
  MORPHEUS_DEFAULT_WORKSPACE_ID,
  type MorpheusWorkspaceAccess,
} from '@shared/morpheus/workspace-types';

import type { MorpheusAuditSink } from '../audit';
import type { MorpheusAgentProfileStore } from '../agents/profile-store';
import type {
  MorpheusPlanExecutionResult,
  MorpheusRuntime,
} from '../runtime';
import { selectMorpheusContext } from './context-selector';
import type { MorpheusObjectiveStore } from './objective-store';
import type {
  MorpheusPlannerSelection,
  MorpheusPlannerSelector,
} from '../planning/planner-selector';
import type { MorpheusWorkspaceStore } from '../workspaces/workspace-store';
import type { MorpheusMissionStore } from '../missions/mission-store';

const CAPABILITY_DESCRIPTIONS: Record<MorpheusActionId, string> = {
  'app.launch': 'Launch one compiled-in approved Windows application by logical key.',
  'file.createText': 'Create a new text file without overwrite inside the approved workspace.',
  'system.report': 'Read privacy-safe operating-system and Morpheus runtime information.',
  'file.readText': 'Read a bounded text file inside the approved workspace.',
  'file.appendText': 'Append bounded text to an existing text file inside the approved workspace.',
  'file.list': 'List bounded entries inside an approved workspace folder.',
  'file.search': 'Search names inside the approved workspace with a bounded query and result count.',
  'folder.create': 'Create a folder inside the approved workspace.',
  'file.copy': 'Copy a file or folder within the approved workspace without arbitrary paths.',
  'file.move': 'Move or rename a file or folder within the approved workspace.',
  'file.delete': 'Delete one exact item inside the approved workspace; this is critical and destructive.',
  'clipboard.readText': 'Read bounded current clipboard text.',
  'clipboard.writeText': 'Replace the clipboard with bounded text.',
  'system.notify': 'Show a bounded native Windows notification.',
  'screen.capture': 'Capture the current screen to a Main-generated PNG in the approved workspace.',
  'system.storage': 'Read privacy-safe storage capacity information.',
  'system.processes': 'List a bounded privacy-sensitive process snapshot.',
  'web.openUrl': 'Open an exact validated HTTP or HTTPS URL in the default browser.',
  'dev.launchProject': 'Open an approved workspace path with a compiled-in developer application template.',
};

type ObjectiveSubmission = {
  objective: string;
  origin: ExecutionOrigin;
  workspaceId?: string;
  agentProfileId?: string;
  projectId?: string;
  missionId?: string;
  /** Main-compiled workflow plan. Never accepted from Renderer. */
  preparedPlan?: ExecutionPlan;
};

type ActiveObjective = {
  generation: number;
  controller: AbortController;
  currentPlanId?: string;
  preparedPlan?: ExecutionPlan;
};

export interface MorpheusObjectiveOrchestrator {
  submit(payload: SubmitMorpheusObjectivePayload): Promise<SubmitMorpheusObjectiveResult>;
  submitInternal(payload: ObjectiveSubmission): Promise<SubmitMorpheusObjectiveResult>;
  waitForTerminal(objectiveRunId: string, timeoutMs?: number): Promise<MorpheusObjectiveRun>;
  waitForIdle(timeoutMs?: number): Promise<void>;
  correct(payload: CorrectMorpheusObjectivePayload): Promise<{ accepted: boolean }>;
  cancel(payload: CancelMorpheusObjectivePayload): Promise<{ accepted: boolean }>;
  snapshot(): MorpheusObjectiveSnapshot;
  onPlanLifecycle(event: {
    planId: string;
    phase: 'preparing' | 'waiting-for-approval' | 'executing' | 'finished';
  }): Promise<void>;
  dispose(): void;
}

function originFromPayload(payload: SubmitMorpheusObjectivePayload): ExecutionOrigin {
  if (payload.originType === 'quick-command') return { type: 'quick-command', commandText: payload.objective };
  if (payload.originType === 'voice') return { type: 'voice', commandText: payload.objective };
  if (payload.originType === 'chat') return { type: 'chat' };
  return { type: 'command-bar', commandText: payload.objective };
}

function effectiveObjective(run: MorpheusObjectiveRun): string {
  if (run.corrections.length === 0) return run.objective;
  return `${run.objective}\n\nUser corrections:\n${run.corrections.map((item) => `- ${item.text}`).join('\n')}`;
}

function summaryForExecution(result: MorpheusPlanExecutionResult): string {
  const succeeded = result.steps.filter((step) => step.status === 'succeeded').length;
  const failed = result.steps.filter((step) => step.status === 'failed').length;
  const artifacts = result.steps.filter((step) => step.artifact).length;
  if (result.status === 'completed') {
    return `Completed ${succeeded} ${succeeded === 1 ? 'step' : 'steps'}${artifacts ? ` and produced ${artifacts} ${artifacts === 1 ? 'artifact' : 'artifacts'}` : ''}.`;
  }
  return `Completed ${succeeded} steps; ${failed} failed. Review the execution details before continuing.`;
}

function observationFrom(
  iteration: number,
  plan: ExecutionPlan,
  result: MorpheusPlanExecutionResult,
  observedAt: string,
): MorpheusPlanObservation {
  const capabilityByStep = new Map(plan.steps.map((step) => [step.stepId, step.capabilityId]));
  return {
    iteration,
    planId: plan.planId,
    status: result.status,
    observedAt,
    steps: result.steps.map((step) => {
      const capabilityId = capabilityByStep.get(step.stepId);
      if (!capabilityId) throw new Error(`Executor returned an unknown step: ${step.stepId}`);
      return {
        stepId: step.stepId,
        capabilityId,
        status: step.status,
        durationMs: step.durationMs,
        errorCode: step.error?.code,
        errorMessage: step.error?.message,
        skippedBecauseOf: step.skippedBecauseOf,
        artifactIds: step.artifact ? [step.artifact.artifactId] : [],
      };
    }),
  };
}

function planFingerprint(plan: ExecutionPlan): string {
  return JSON.stringify(plan.steps.map((step) => ({
    capabilityId: step.capabilityId,
    params: step.params,
    dependsOn: step.dependsOn,
  })));
}

function interpretationClarification(result: Extract<InterpretationResult, { ok: false }>): string {
  const supported = result.unsupported.supportedCapabilities.join(', ');
  return `I could not safely turn that objective into an execution plan. Currently supported capabilities: ${supported}.`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function createMorpheusObjectiveOrchestrator(options: {
  store: MorpheusObjectiveStore;
  runtime: MorpheusRuntime;
  agents: MorpheusAgentProfileStore;
  planners: MorpheusPlannerSelector;
  audit: MorpheusAuditSink;
  appVersion: string;
  workspaces: Pick<MorpheusWorkspaceStore, 'get' | 'resolveRoot'>;
  missions: MorpheusMissionStore;
  projects?: { get(projectId: string): MorpheusProject | undefined };
  memory?: { eligibleForPlanning(projectId?: string, limit?: number): MorpheusMemory[] };
  isRuntimePaused?: () => boolean;
  emit: (event: MorpheusObjectiveEvent) => void;
  platform?: string;
  now?: () => Date;
  createId?: () => string;
  createMissionId?: () => string;
  limits?: MorpheusObjectiveLimits;
}): MorpheusObjectiveOrchestrator {
  const platform = options.platform ?? process.platform;
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => randomUUID());
  const createMissionId = options.createMissionId ?? (() => `mission-${randomUUID()}`);
  const limits = options.limits ?? DEFAULT_OBJECTIVE_LIMITS;
  const active = new Map<string, ActiveObjective>();
  const planOwners = new Map<string, { objectiveRunId: string; generation: number }>();
  const transitionChains = new Map<string, Promise<void>>();
  const terminalWaiters = new Map<string, Set<{
    resolve: (run: MorpheusObjectiveRun) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }>>();
  const idleWaiters = new Set<{
    resolve: () => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }>();
  let seq = 0;
  let disposed = false;

  const finishActive = (objectiveRunId: string): void => {
    active.delete(objectiveRunId);
    if (active.size !== 0) return;
    for (const waiter of idleWaiters) {
      clearTimeout(waiter.timer);
      waiter.resolve();
    }
    idleWaiters.clear();
  };

  const currentPlan = (objectiveRunId: string): ExecutionPlan | undefined => (
    options.store.snapshot().plansByObjectiveRunId[objectiveRunId]
  );

  const transition = async (
    objectiveRunId: string,
    state: MorpheusSystemState,
    patch: Partial<MorpheusObjectiveRun> = {},
  ): Promise<MorpheusObjectiveRun | undefined> => {
    let output: MorpheusObjectiveRun | undefined;
    const previous = transitionChains.get(objectiveRunId) ?? Promise.resolve();
    const next = previous.then(async () => {
      const existing = options.store.get(objectiveRunId);
      if (!existing) return;
      const timestamp = now().toISOString();
      const terminal = isObjectiveTerminalState(state);
      const run: MorpheusObjectiveRun = {
        ...existing,
        ...patch,
        state,
        updatedAt: timestamp,
        ...(terminal ? { completedAt: patch.completedAt ?? timestamp } : {}),
      };

      // Objective audit contains lifecycle metadata only—never objective text,
      // provider prompts, audio, file content or model output.
      try {
        await options.audit.recordControl({
          category: 'objective',
          event: 'state-transition',
          subjectId: objectiveRunId,
          details: {
            state,
            iteration: run.iteration,
            ...(run.planIds.at(-1) ? { planId: run.planIds.at(-1) as string } : {}),
            ...(run.plannerId ? { plannerId: run.plannerId } : {}),
          },
          appVersion: options.appVersion,
        });
        await options.audit.recordControl({
          category: 'mission',
          event: 'objective-state-projected',
          subjectId: run.missionId ?? objectiveRunId,
          details: { state, objectiveRunId },
          appVersion: options.appVersion,
        });
      } catch {
        // The runtime policy independently observes the audit sink and blocks
        // unsafe execution. The UI still receives truthful degraded state.
      }
      output = options.store.put(run);
      try {
        options.missions.projectObjective(run);
      } catch {
        // Objective Core remains the source of truth. A failed Mission
        // projection cannot be presented as success, but it must not duplicate
        // or replay a native operation either. Reconciliation repairs it on the
        // next healthy load.
      }
      seq += 1;
      options.emit({
        v: MORPHEUS_OBJECTIVE_VERSION,
        seq,
        ts: timestamp,
        objectiveRunId,
        state,
        run: structuredClone(run),
        plan: currentPlan(objectiveRunId),
      });
      if (terminal) {
        const waiters = terminalWaiters.get(objectiveRunId);
        if (waiters) {
          for (const waiter of waiters) {
            clearTimeout(waiter.timer);
            waiter.resolve(structuredClone(run));
          }
          terminalWaiters.delete(objectiveRunId);
        }
      }
    });
    transitionChains.set(objectiveRunId, next);
    await next;
    if (transitionChains.get(objectiveRunId) === next) transitionChains.delete(objectiveRunId);
    return output;
  };

  const selectionCapabilities = (
    agent: MorpheusAgentProfile,
    workspaceAccess: MorpheusWorkspaceAccess,
  ): MorpheusPlanningCapability[] => {
    const allowed = new Set(agent.permissionBoundary.capabilityIds);
    const allowWorkspaceWrites = agent.workspace.access === 'read-write'
      && workspaceAccess === 'read-write';
    return listMorpheusActionIds().flatMap((capabilityId) => {
      const descriptor = getMorpheusActionDescriptor(capabilityId);
      if (!allowed.has(capabilityId) || !descriptor.platforms.includes(platform as never)
        || (!allowWorkspaceWrites && isMorpheusWorkspaceWriteAction(capabilityId))) return [];
      return [{
        capabilityId,
        riskTier: descriptor.riskTier,
        description: CAPABILITY_DESCRIPTIONS[capabilityId],
        params: descriptor.params,
      }];
    });
  };

  const ensurePlanAllowed = (
    plan: ExecutionPlan,
    capabilities: readonly MorpheusPlanningCapability[],
    totalSteps: number,
    fingerprints: Set<string>,
  ): void => {
    if (plan.steps.length === 0 || plan.steps.length > limits.maxStepsPerPlan) {
      throw new Error(`Plan must contain between 1 and ${limits.maxStepsPerPlan} steps.`);
    }
    if (totalSteps + plan.steps.length > limits.maxTotalSteps) throw new Error('Objective exceeded its total step limit.');
    const allowed = new Set(capabilities.map((capability) => capability.capabilityId));
    for (const step of plan.steps) {
      if (!allowed.has(step.capabilityId)) throw new Error(`Agent Profile does not permit ${step.capabilityId}.`);
    }
    const fingerprint = planFingerprint(plan);
    if (fingerprints.has(fingerprint)) throw new Error('Planner repeated an identical plan instead of making progress.');
    fingerprints.add(fingerprint);
  };

  const callWithTimeout = async <T>(
    owner: ActiveObjective,
    operation: (signal: AbortSignal) => Promise<T> | T,
  ): Promise<T> => {
    const controller = new AbortController();
    const relay = (): void => controller.abort(owner.controller.signal.reason);
    owner.controller.signal.addEventListener('abort', relay, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException('Provider timed out', 'TimeoutError')), limits.providerTimeoutMs);
    timer.unref?.();
    try {
      return await operation(controller.signal);
    } finally {
      clearTimeout(timer);
      owner.controller.signal.removeEventListener('abort', relay);
    }
  };

  const isCurrent = (objectiveRunId: string, generation: number): boolean => (
    !disposed && active.get(objectiveRunId)?.generation === generation
  );

  const processObjective = async (
    objectiveRunId: string,
    generation: number,
    agent: MorpheusAgentProfile,
  ): Promise<void> => {
    const owner = active.get(objectiveRunId);
    if (!owner) return;
    const startedAt = now().getTime();
    const initialRun = options.store.get(objectiveRunId);
    const workspaceId = initialRun?.workspaceId ?? MORPHEUS_DEFAULT_WORKSPACE_ID;
    const workspace = options.workspaces.get(workspaceId);
    if (!workspace?.enabled || !workspace.available) {
      await transition(objectiveRunId, 'error', {
        error: { code: 'workspace-unavailable', message: 'The selected Morpheus workspace is unavailable.' },
      });
      finishActive(objectiveRunId);
      return;
    }
    let filesRoot: string;
    try {
      filesRoot = options.workspaces.resolveRoot(workspaceId);
    } catch (error) {
      await transition(objectiveRunId, 'error', {
        error: {
          code: 'workspace-unavailable',
          message: error instanceof Error ? error.message : 'The selected Morpheus workspace is unavailable.',
        },
      });
      finishActive(objectiveRunId);
      return;
    }
    const capabilities = selectionCapabilities(agent, workspace.access);
    const fingerprints = new Set<string>();
    let totalSteps = 0;
    let planner: MorpheusPlanner;
    let proposed: InterpretationResult | null = null;

    try {
      let run = options.store.get(objectiveRunId) as MorpheusObjectiveRun;
      const historySnapshot = options.store.snapshot();
      const history = historySnapshot.runOrder.flatMap((id) => {
        const entry = historySnapshot.runsById[id];
        return entry ? [entry] : [];
      });
      const contextProject = run.projectId ? options.projects?.get(run.projectId) : undefined;
      const context = selectMorpheusContext({
        current: run,
        history,
        agent,
        workspaceLabel: workspace.name,
        ...(contextProject ? { project: contextProject } : {}),
        memories: options.memory?.eligibleForPlanning(run.projectId),
      });
      if (owner.preparedPlan) {
        const preparedPlan: ExecutionPlan = {
          ...owner.preparedPlan,
          origin: run.origin,
          objective: run.objective,
        };
        planner = {
          plannerId: 'workflow-compiler-v1',
          plannedBy: 'deterministic',
          plan: async () => ({ ok: true, plan: preparedPlan }),
        };
        proposed = { ok: true, plan: preparedPlan };
        const route: MorpheusObjectiveRoute = {
          kind: 'prepared-workflow',
          plannerId: planner.plannerId,
          selectedAt: now().toISOString(),
          reason: 'Using a Main-compiled workflow plan.',
        };
        await transition(objectiveRunId, 'planning', { plannerId: planner.plannerId, route });
      } else {
        const directPlanner = createDeterministicMorpheusPlanner();
        const direct = await Promise.resolve(directPlanner.plan({
          objective: effectiveObjective(run),
          origin: run.origin,
          platform,
          filesRoot,
          objectiveRunId,
          iteration: 1,
          capabilities,
          context,
          agent: {
            profileId: agent.profileId,
            name: agent.name,
            instructions: agent.instructions,
            capabilityIds: agent.permissionBoundary.capabilityIds,
          },
          limits,
          signal: owner.controller.signal,
        }));
        const allowedCapabilityIds = new Set(capabilities.map((capability) => capability.capabilityId));
        if (direct.ok && direct.plan.steps.every((step) => allowedCapabilityIds.has(step.capabilityId))) {
          planner = directPlanner;
          proposed = direct;
          const route: MorpheusObjectiveRoute = {
            kind: 'direct-capability',
            plannerId: planner.plannerId,
            selectedAt: now().toISOString(),
            reason: 'Matched a registered capability before provider selection.',
          };
          await transition(objectiveRunId, 'planning', { plannerId: planner.plannerId, route });
        } else {
          const plannerSelection: MorpheusPlannerSelection = await options.planners.select(agent);
          if (!isCurrent(objectiveRunId, generation)) return;
          if (!plannerSelection.ok) {
            await transition(objectiveRunId, 'needs-clarification', { clarification: plannerSelection.reason });
            finishActive(objectiveRunId);
            return;
          }
          planner = plannerSelection.planner;
          const route: MorpheusObjectiveRoute = {
            kind: planner.plannedBy === 'provider' ? 'provider-plan' : 'deterministic-fallback',
            plannerId: planner.plannerId,
            selectedAt: now().toISOString(),
            reason: planner.plannedBy === 'provider'
              ? 'The objective requires provider-backed planning.'
              : 'No configured provider was available; using the bounded offline interpreter.',
          };
          await transition(objectiveRunId, 'planning', {
            plannerId: planner.plannerId,
            providerAccountId: plannerSelection.providerAccountId,
            modelId: plannerSelection.modelId,
            plannerNotice: plannerSelection.fallbackReason,
            route,
          });
        }
      }

      for (let iteration = 1; iteration <= limits.maxIterations; iteration += 1) {
        if (!isCurrent(objectiveRunId, generation) || owner.controller.signal.aborted) return;
        if (now().getTime() - startedAt > limits.maxDurationMs) throw new Error('Objective exceeded its maximum duration.');
        run = options.store.get(objectiveRunId) as MorpheusObjectiveRun;
        const objective = effectiveObjective(run);

        if (!proposed) {
          try {
            proposed = await callWithTimeout(owner, (signal) => Promise.resolve(planner.plan({
              objective,
              origin: run.origin,
              platform,
              filesRoot,
              objectiveRunId,
              iteration,
              capabilities,
              context,
              agent: {
                profileId: agent.profileId,
                name: agent.name,
                instructions: agent.instructions,
                capabilityIds: agent.permissionBoundary.capabilityIds,
              },
              limits,
              signal,
            })));
          } catch (error) {
            if (!isCurrent(objectiveRunId, generation) || owner.controller.signal.aborted) return;
            // Auto mode remains useful offline, but the fallback is recorded and
            // visible. Explicit provider profiles never silently change engines.
            if (agent.planner.kind !== 'auto' || planner.plannedBy !== 'provider') throw error;
            const deterministic = createDeterministicMorpheusPlanner();
            proposed = await deterministic.plan({
              objective, origin: run.origin, platform, filesRoot,
              objectiveRunId, iteration, capabilities, context, limits,
            });
            planner = deterministic;
            const route: MorpheusObjectiveRoute = {
              kind: 'deterministic-fallback',
              plannerId: deterministic.plannerId,
              selectedAt: now().toISOString(),
              reason: 'Provider planning failed; using the bounded offline interpreter.',
            };
            await transition(objectiveRunId, 'planning', {
              plannerId: deterministic.plannerId,
              plannerNotice: `Provider planning was unavailable (${error instanceof Error ? error.message : String(error)}). Used the deterministic offline interpreter.`,
              route,
            });
          }
        }

        if (!isCurrent(objectiveRunId, generation)) return;
        if (!proposed.ok) {
          await transition(objectiveRunId, 'needs-clarification', {
            clarification: interpretationClarification(proposed),
            iteration,
          });
          finishActive(objectiveRunId);
          return;
        }

        // Workspace binding is Main-owned. Provider proposals cannot choose or
        // widen a root even if they include an extra field in raw output.
        const plan: ExecutionPlan = {
          ...proposed.plan,
          workspaceId,
        };
        ensurePlanAllowed(plan, capabilities, totalSteps, fingerprints);
        totalSteps += plan.steps.length;
        options.runtime.registerPlan(plan);
        options.store.setActivePlan(objectiveRunId, plan);
        planOwners.set(plan.planId, { objectiveRunId, generation });
        owner.currentPlanId = plan.planId;
        run = options.store.get(objectiveRunId) as MorpheusObjectiveRun;
        await transition(objectiveRunId, 'executing', {
          iteration,
          planIds: [...run.planIds, plan.planId],
        });

        const execution = await options.runtime.executePlan({ planId: plan.planId });
        owner.currentPlanId = undefined;
        if (!isCurrent(objectiveRunId, generation)) return;
        const observedAt = now().toISOString();
        const observation = observationFrom(iteration, plan, execution, observedAt);
        const artifacts = execution.steps.flatMap((step) => step.artifact ? [step.artifact] : []);
        run = options.store.get(objectiveRunId) as MorpheusObjectiveRun;
        await transition(objectiveRunId, 'observing', {
          observations: [...run.observations, observation],
          artifacts: [...run.artifacts, ...artifacts.filter((artifact) => (
            !run.artifacts.some((existing) => existing.artifactId === artifact.artifactId)
          ))],
        });

        if (execution.status === 'cancelled') {
          options.store.setActivePlan(objectiveRunId, null);
          await transition(objectiveRunId, 'cancelled');
          finishActive(objectiveRunId);
          return;
        }
        if (execution.status === 'rejected' && execution.rejection?.code === 'permission-denied') {
          options.store.setActivePlan(objectiveRunId, null);
          await transition(objectiveRunId, 'needs-clarification', {
            clarification: 'Execution stopped because the required trust boundary was not approved.',
          });
          finishActive(objectiveRunId);
          return;
        }

        const reviewPlanner = planner.review;
        if (!reviewPlanner) {
          options.store.setActivePlan(objectiveRunId, null);
          await transition(objectiveRunId, execution.status === 'completed' ? 'complete' : 'error', {
            summary: summaryForExecution(execution),
            ...(execution.status === 'completed' ? {} : {
              error: execution.rejection ?? { code: 'execution-incomplete', message: summaryForExecution(execution) },
            }),
          });
          finishActive(objectiveRunId);
          return;
        }

        let review: MorpheusPlannerReviewResult;
        try {
          review = await callWithTimeout(owner, (signal): Promise<MorpheusPlannerReviewResult> => Promise.resolve(reviewPlanner({
            objectiveRunId,
            objective,
            origin: run.origin,
            iteration,
            plan,
            planStatus: execution.status,
            stepResults: execution.steps,
            context,
            capabilities,
            limits,
            signal,
          })));
        } catch (error) {
          if (!isCurrent(objectiveRunId, generation) || owner.controller.signal.aborted) return;
          // Execution truth is more important than a failed summarisation call.
          options.store.setActivePlan(objectiveRunId, null);
          await transition(objectiveRunId, execution.status === 'completed' ? 'complete' : 'error', {
            summary: summaryForExecution(execution),
            plannerNotice: `Planner review was unavailable: ${error instanceof Error ? error.message : String(error)}`,
            ...(execution.status === 'completed' ? {} : {
              error: { code: 'review-unavailable', message: summaryForExecution(execution) },
            }),
          });
          finishActive(objectiveRunId);
          return;
        }

        if (!isCurrent(objectiveRunId, generation)) return;
        if (review.outcome === 'complete') {
          options.store.setActivePlan(objectiveRunId, null);
          await transition(objectiveRunId, 'complete', { summary: review.summary });
          finishActive(objectiveRunId);
          return;
        }
        if (review.outcome === 'clarify') {
          options.store.setActivePlan(objectiveRunId, null);
          await transition(objectiveRunId, 'needs-clarification', { clarification: review.question });
          finishActive(objectiveRunId);
          return;
        }

        proposed = { ok: true, plan: review.plan };
        await transition(objectiveRunId, 'replanning', { iteration });
      }

      options.store.setActivePlan(objectiveRunId, null);
      await transition(objectiveRunId, 'error', {
        error: { code: 'iteration-limit', message: 'Morpheus reached the safe replanning limit before completion.' },
      });
      finishActive(objectiveRunId);
    } catch (error) {
      if (!isCurrent(objectiveRunId, generation)) return;
      options.store.setActivePlan(objectiveRunId, null);
      if (owner.controller.signal.aborted || isAbortError(error)) {
        const run = options.store.get(objectiveRunId);
        if (run && !isObjectiveTerminalState(run.state)) await transition(objectiveRunId, 'cancelled');
      } else {
        await transition(objectiveRunId, 'error', {
          error: { code: 'objective-failed', message: error instanceof Error ? error.message : String(error) },
        });
      }
      finishActive(objectiveRunId);
    } finally {
      for (const [planId, planOwner] of planOwners) {
        if (planOwner.objectiveRunId === objectiveRunId && planOwner.generation === generation) planOwners.delete(planId);
      }
    }
  };

  const submitInternal = async (payload: ObjectiveSubmission): Promise<SubmitMorpheusObjectiveResult> => {
    if (disposed) return { objectiveRunId: '', accepted: false, message: 'Morpheus is shutting down.' };
    if (options.isRuntimePaused?.()) {
      return {
        objectiveRunId: '',
        accepted: false,
        message: 'Morpheus is paused. Resume new work from the Command Center, Settings, or tray.',
      };
    }
    const snapshot = options.store.snapshot();
    if (snapshot.activeObjectiveRunId) {
      return {
        objectiveRunId: snapshot.activeObjectiveRunId,
        accepted: false,
        message: 'Another objective is already active. Stop or finish it before starting a new one.',
      };
    }
    const objective = payload.objective.trim();
    const agentProfileId = payload.agentProfileId ?? 'general';
    const agent = options.agents.get(agentProfileId);
    if (!agent?.enabled) return { objectiveRunId: '', accepted: false, message: 'The selected Agent Profile is unavailable.' };
    const projectId = payload.projectId;
    const project = projectId ? options.projects?.get(projectId) : undefined;
    if (projectId && (!project || !project.enabled)) {
      return { objectiveRunId: '', accepted: false, message: 'The selected Project is unavailable.' };
    }
    if (project && payload.workspaceId && payload.workspaceId !== project.workspaceId) {
      return { objectiveRunId: '', accepted: false, message: 'The selected Project belongs to a different workspace.' };
    }
    const workspaceId = project?.workspaceId ?? payload.workspaceId ?? MORPHEUS_DEFAULT_WORKSPACE_ID;
    const workspace = options.workspaces.get(workspaceId);
    if (!workspace?.enabled || !workspace.available) {
      return { objectiveRunId: '', accepted: false, message: 'The selected workspace is unavailable.' };
    }

    const objectiveRunId = createId();
    const missionId = payload.missionId ?? createMissionId();
    if (!isMorpheusMissionId(missionId)) {
      return { objectiveRunId: '', accepted: false, message: 'Morpheus could not create a valid Mission identity.' };
    }
    const timestamp = now().toISOString();
    const run: MorpheusObjectiveRun = {
      v: MORPHEUS_OBJECTIVE_VERSION,
      objectiveRunId,
      missionId,
      ...(projectId ? { projectId } : {}),
      objective,
      origin: payload.origin,
      state: 'understanding',
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: timestamp,
      workspaceId,
      agentProfileId,
      iteration: 0,
      corrections: [],
      planIds: [],
      observations: [],
      artifacts: [],
    };
    options.store.put(run);
    const owner: ActiveObjective = {
      generation: 1,
      controller: new AbortController(),
      preparedPlan: payload.preparedPlan,
    };
    active.set(objectiveRunId, owner);
    await transition(objectiveRunId, 'understanding');
    void processObjective(objectiveRunId, owner.generation, agent);
    return { objectiveRunId, missionId, accepted: true };
  };

  return {
    submit(payload) {
      return submitInternal({
        objective: payload.objective,
        origin: originFromPayload(payload),
        workspaceId: payload.workspaceId,
        agentProfileId: payload.agentProfileId,
        projectId: payload.projectId,
      });
    },

    submitInternal,

    waitForTerminal(objectiveRunId, timeoutMs = limits.maxDurationMs + 5_000) {
      const existing = options.store.get(objectiveRunId);
      if (!existing) return Promise.reject(new Error('Unknown Morpheus objective'));
      if (isObjectiveTerminalState(existing.state)) return Promise.resolve(structuredClone(existing));
      return new Promise<MorpheusObjectiveRun>((resolve, reject) => {
        const waiter = {
          resolve,
          reject,
          timer: setTimeout(() => {
            terminalWaiters.get(objectiveRunId)?.delete(waiter);
            reject(new Error('Timed out waiting for the Morpheus objective'));
          }, timeoutMs),
        };
        waiter.timer.unref?.();
        const waiters = terminalWaiters.get(objectiveRunId) ?? new Set();
        waiters.add(waiter);
        terminalWaiters.set(objectiveRunId, waiters);
      });
    },

    waitForIdle(timeoutMs = limits.maxDurationMs + 5_000) {
      if (active.size === 0) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const waiter = {
          resolve,
          reject,
          timer: setTimeout(() => {
            idleWaiters.delete(waiter);
            reject(new Error('Timed out waiting for Morpheus to become idle'));
          }, timeoutMs),
        };
        waiter.timer.unref?.();
        idleWaiters.add(waiter);
      });
    },

    async correct(payload) {
      const run = options.store.get(payload.objectiveRunId);
      const owner = active.get(payload.objectiveRunId);
      if (!run || !owner || isObjectiveTerminalState(run.state)) return { accepted: false };
      owner.controller.abort(new DOMException('Objective corrected', 'AbortError'));
      if (owner.currentPlanId) await options.runtime.cancelPlan({ planId: owner.currentPlanId });
      options.store.setActivePlan(payload.objectiveRunId, null);
      const correction = payload.correction.trim();
      const timestamp = now().toISOString();
      await transition(payload.objectiveRunId, 'understanding', {
        corrections: [...run.corrections, { text: correction, createdAt: timestamp }],
        clarification: undefined,
        error: undefined,
        completedAt: undefined,
      });
      const agent = options.agents.get(run.agentProfileId ?? 'general');
      if (!agent) return { accepted: false };
      const nextOwner: ActiveObjective = {
        generation: owner.generation + 1,
        controller: new AbortController(),
      };
      active.set(payload.objectiveRunId, nextOwner);
      void processObjective(payload.objectiveRunId, nextOwner.generation, agent);
      return { accepted: true };
    },

    async cancel(payload) {
      const run = options.store.get(payload.objectiveRunId);
      const owner = active.get(payload.objectiveRunId);
      if (!run || !owner || isObjectiveTerminalState(run.state)) return { accepted: false };
      owner.controller.abort(new DOMException('Objective cancelled', 'AbortError'));
      if (owner.currentPlanId) await options.runtime.cancelPlan({ planId: owner.currentPlanId });
      options.store.setActivePlan(payload.objectiveRunId, null);
      await transition(payload.objectiveRunId, 'cancelled');
      finishActive(payload.objectiveRunId);
      return { accepted: true };
    },

    snapshot: () => options.store.snapshot(),

    async onPlanLifecycle(event) {
      const planOwner = planOwners.get(event.planId);
      if (!planOwner || active.get(planOwner.objectiveRunId)?.generation !== planOwner.generation) return;
      const objectiveRunId = planOwner.objectiveRunId;
      const run = options.store.get(objectiveRunId);
      if (!run || isObjectiveTerminalState(run.state)) return;
      if (event.phase === 'waiting-for-approval' && run.state !== 'waiting-for-approval') {
        await transition(objectiveRunId, 'waiting-for-approval');
      } else if ((event.phase === 'preparing' || event.phase === 'executing') && run.state !== 'executing') {
        await transition(objectiveRunId, 'executing');
      }
    },

    dispose() {
      disposed = true;
      for (const owner of active.values()) owner.controller.abort(new DOMException('Morpheus shutting down', 'AbortError'));
      active.clear();
      planOwners.clear();
      for (const waiters of terminalWaiters.values()) {
        for (const waiter of waiters) {
          clearTimeout(waiter.timer);
          waiter.reject(new Error('Morpheus is shutting down'));
        }
      }
      terminalWaiters.clear();
      for (const waiter of idleWaiters) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error('Morpheus is shutting down'));
      }
      idleWaiters.clear();
    },
  };
}
