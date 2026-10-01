/**
 * Command Center state: interpretation, plans, artifacts and permission policy.
 *
 * Not persisted — every value here is Main-owned. Rehydrating a stale plan or a
 * stale grant list across a restart would show trust the main process no longer
 * has.
 */
import { create } from 'zustand';

import { hostApi } from '@/lib/host-api';
import { hostEvents } from '@/lib/host-events';
import type { MorpheusPlanConsentEvent } from '@shared/host-events/contract';
import type {
  ExecutionArtifact,
  ExecutionPlan,
  UnsupportedCommand,
} from '@shared/morpheus/execution-types';
import type { MorpheusPlanExecutionResult } from '@shared/host-api/contract';
import {
  isObjectiveTerminalState,
  type MorpheusObjectiveEvent,
  type MorpheusObjectiveRun,
  type MorpheusObjectiveSnapshot,
  type SubmitMorpheusObjectivePayload,
} from '@shared/morpheus/core/objective-types';
import type {
  PermissionCenterSnapshot,
  PermissionProfile,
} from '@shared/morpheus/permission-types';
import type { MorpheusAuditEntry, MorpheusRun } from '@shared/morpheus/action-types';
import { isMorpheusActionId, type MorpheusActionId } from '@shared/morpheus/actions/registry';
import { useMorpheusWorkspacesStore } from './morpheus-workspaces';
import { useMorpheusExecutionContextStore } from './morpheus-execution-context';
import { useMorpheusActionsStore } from './morpheus-actions';

const MAX_ARTIFACTS = 50;

function supportedCapabilityIds(): MorpheusActionId[] {
  return Object.entries(useMorpheusActionsStore.getState().supportedActions)
    .filter((entry): entry is [MorpheusActionId, boolean] => isMorpheusActionId(entry[0]) && entry[1])
    .map(([capabilityId]) => capabilityId)
    .sort();
}

export type MorpheusCommandState = {
  /** Raw text in the command bar. */
  input: string;
  /** Plan produced by the last interpretation, if any. */
  plan: ExecutionPlan | null;
  /** Truthful refusal for the last unsupported command. */
  unsupported: UnsupportedCommand | null;
  interpreting: boolean;
  submitting: boolean;
  selectedObjectiveRunId: string | null;
  /** True while Main is executing the plan. */
  executing: boolean;
  /** Per-step outcome of the last execution. Empty until one finishes. */
  planResult: MorpheusPlanExecutionResult | null;
  /**
   * The displayed request. Other tasks' requests stay queued and retain their
   * plan identity; answering one cannot approve another.
   */
  consent: MorpheusPlanConsentEvent | null;
  consentQueue: MorpheusPlanConsentEvent[];
  artifacts: ExecutionArtifact[];
  filesRoot: string | null;
  permission: PermissionCenterSnapshot | null;
  /** Main-owned objective state shared by Command Center, Quick Command and Chat execution. */
  objectiveRun: MorpheusObjectiveRun | null;
  objectiveHistory: MorpheusObjectiveSnapshot | null;

  setInput: (input: string) => void;
  submit: () => Promise<void>;
  runObjective: (
    objective: string,
    originType?: SubmitMorpheusObjectivePayload['originType'],
  ) => Promise<boolean>;
  clearPlan: () => void;
  subscribeObjectives: () => () => void;
  loadObjectives: () => Promise<void>;
  selectObjective: (objectiveRunId: string) => void;
  cancelObjective: () => Promise<void>;
  correctObjective: (correction: string) => Promise<void>;
  /** Subscribes to plan consent requests. Returns the unsubscribe function. */
  subscribeConsent: () => () => void;
  /** Answers every boundary in the outstanding request with one decision. */
  answerConsent: (decision: string) => Promise<void>;
  /** Answers each boundary individually. */
  answerConsentPerBoundary: (decisions: Record<string, string>) => Promise<void>;
  loadPermissionCenter: () => Promise<void>;
  setProfile: (profile: PermissionProfile) => Promise<void>;
  revokeGrant: (grantId: string) => Promise<void>;
  revokeAllSession: () => Promise<void>;
  resetPolicy: () => Promise<void>;
  loadFilesRoot: () => Promise<void>;
  /** Rebuilds recent artifacts from the privacy-safe append-only ledger. */
  loadArtifacts: () => Promise<void>;
  openFilesRoot: () => Promise<void>;
  /** Records a durable output produced by a completed run. */
  captureArtifact: (run: MorpheusRun) => void;
};

function executionResultFromObjective(run: MorpheusObjectiveRun): MorpheusPlanExecutionResult | null {
  const observation = run.observations.at(-1);
  if (!observation) return null;
  const artifacts = new Map(run.artifacts.map((artifact) => [artifact.artifactId, artifact]));
  return {
    planId: observation.planId,
    status: observation.status,
    steps: observation.steps.map((step) => ({
      stepId: step.stepId,
      status: step.status,
      durationMs: step.durationMs,
      error: step.errorCode
        ? { code: step.errorCode, message: step.errorMessage ?? step.errorCode }
        : undefined,
      skippedBecauseOf: step.skippedBecauseOf,
      artifact: step.artifactIds.length > 0 ? artifacts.get(step.artifactIds[0]) : undefined,
    })),
  };
}

function mergeObjectiveArtifacts(
  existing: readonly ExecutionArtifact[],
  incoming: readonly ExecutionArtifact[],
): ExecutionArtifact[] {
  const byId = new Map(existing.map((artifact) => [artifact.artifactId, artifact]));
  for (const artifact of incoming) byId.set(artifact.artifactId, artifact);
  return [...byId.values()]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, MAX_ARTIFACTS);
}

function objectiveStatePatch(
  event: MorpheusObjectiveEvent,
  previous: MorpheusCommandState,
): Partial<MorpheusCommandState> {
  const terminal = isObjectiveTerminalState(event.run.state);
  const consentQueue = previous.consentQueue.filter((request) => !terminal || !event.run.planIds.includes(request.planId));
  const history = previous.objectiveHistory;
  const objectiveHistory: MorpheusObjectiveSnapshot = {
    activeObjectiveRunId: history?.activeObjectiveRunId ?? null,
    runOrder: [event.objectiveRunId, ...(history?.runOrder ?? []).filter((id) => id !== event.objectiveRunId)],
    runsById: { ...history?.runsById, [event.objectiveRunId]: event.run },
    plansByObjectiveRunId: { ...history?.plansByObjectiveRunId, ...(event.plan ? { [event.objectiveRunId]: event.plan } : {}) },
  };
  objectiveHistory.activeObjectiveRunId = objectiveHistory.runOrder.find((id) => !isObjectiveTerminalState(objectiveHistory.runsById[id].state)) ?? null;
  const shared = {
    objectiveHistory, consentQueue, consent: consentQueue[0] ?? null,
    artifacts: mergeObjectiveArtifacts(previous.artifacts, event.run.artifacts),
  };
  if (previous.selectedObjectiveRunId && previous.selectedObjectiveRunId !== event.objectiveRunId) return shared;
  const interpreting = ['understanding', 'planning', 'replanning'].includes(event.run.state);
  const priorPlan = previous.objectiveRun?.objectiveRunId === event.objectiveRunId
    ? previous.plan
    : null;
  return {
    ...shared,
    selectedObjectiveRunId: event.objectiveRunId,
    objectiveRun: event.run,
    plan: event.plan ?? priorPlan,
    planResult: executionResultFromObjective(event.run),
    interpreting,
    executing: !terminal && !interpreting,
    unsupported: event.run.state === 'needs-clarification'
      ? {
          objective: event.run.objective,
          reason: 'not-understood',
          supportedCapabilities: supportedCapabilityIds(),
        }
      : null,
    artifacts: mergeObjectiveArtifacts(previous.artifacts, event.run.artifacts),
  };
}

/** Derives an artifact from a terminal run, or null when it produced none. */
export function artifactFromRun(run: MorpheusRun): ExecutionArtifact | null {
  if (run.phase !== 'succeeded' || !run.result) return null;
  const createdAt = run.updatedAt;
  if (run.result.kind === 'audio-control') return { kind: 'report', artifactId: run.runId, createdAt, data: { controlKind: 'volume', level: run.result.level, observed: 1 } };
  if (run.result.kind === 'desktop-control') return { kind: 'report', artifactId: run.runId, createdAt,
    data: { controlKind: 'app', applicationKey: run.result.applicationKey, operation: run.result.operation, observed: 1 } };

  if (run.result.kind === 'file') {
    return {
      kind: 'file',
      artifactId: run.runId,
      path: run.result.path,
      bytes: run.result.bytes,
      contentSha256: run.result.contentSha256,
      createdAt,
    };
  }
  if (run.result.kind === 'launch') {
    return {
      kind: 'process',
      artifactId: run.runId,
      executablePath: run.result.executablePath,
      pid: run.result.pid,
      createdAt,
    };
  }
  if (run.result.kind === 'system') {
    return {
      kind: 'report',
      artifactId: run.runId,
      createdAt,
      data: {
        platform: run.result.info.platform,
        release: run.result.info.release,
        arch: run.result.info.arch,
        cpuCount: run.result.info.cpuCount,
      },
    };
  }

  if (run.result.kind === 'text') {
    return {
      kind: 'report',
      artifactId: run.runId,
      createdAt,
      // The text itself is NOT carried into the artifact list: it is a
      // transient result for display, not a durable record of file contents.
      data: { path: run.result.path, bytes: run.result.bytes },
    };
  }

  if (run.result.kind === 'listing') {
    return {
      kind: 'report',
      artifactId: run.runId,
      createdAt,
      data: { path: run.result.path, entries: run.result.entries.length },
    };
  }

  if (run.result.kind === 'deletion') {
    // A deletion is a durable, irreversible change, so it belongs in history
    // even though nothing was produced.
    return {
      kind: 'report',
      artifactId: run.runId,
      createdAt,
      data: { deleted: run.result.relativePath, folder: run.result.wasFolder ? 1 : 0 },
    };
  }

  if (run.result.kind === 'storage') {
    return {
      kind: 'report', artifactId: run.runId, createdAt,
      data: {
        root: run.result.root,
        freeBytes: run.result.freeBytes,
        totalBytes: run.result.totalBytes,
      },
    };
  }

  if (run.result.kind === 'processes') {
    return {
      kind: 'report', artifactId: run.runId, createdAt,
      data: { processes: run.result.processes.length, truncated: run.result.truncated ? 1 : 0 },
    };
  }

  if (run.result.kind === 'project-launch') {
    return {
      kind: 'process', artifactId: run.runId, createdAt,
      executablePath: run.result.executablePath, pid: run.result.pid,
    };
  }

  if (run.result.kind === 'url') {
    let origin = run.result.url;
    try { origin = new URL(run.result.url).origin; } catch { /* validated by Main */ }
    return { kind: 'report', artifactId: run.runId, createdAt, data: { origin } };
  }

  if (run.result.kind === 'notification') {
    return {
      kind: 'report', artifactId: run.runId, createdAt,
      data: { notification: 'delivered' },
    };
  }

  if (run.result.kind === 'scheduled-reminder') {
    return {
      kind: 'schedule', artifactId: run.runId, createdAt,
      scheduleId: run.result.scheduleId,
      workflowId: run.result.workflowId,
      triggerType: run.result.triggerType,
      ...(run.result.nextRunAt ? { nextRunAt: run.result.nextRunAt } : {}),
    };
  }

  if (run.result.kind === 'website') {
    return {
      kind: 'website', artifactId: run.runId, createdAt,
      projectPath: run.result.manifest.projectPath,
      workspaceRoot: run.result.manifest.workspaceRoot,
      entryPath: run.result.manifest.entryPath,
      relativeEntryPath: run.result.manifest.relativeEntryPath,
      ...(run.result.manifest.interactiveTemplate ? { interactiveTemplate: run.result.manifest.interactiveTemplate } : {}),
      fileCount: run.result.manifest.fileCount,
      totalBytes: run.result.manifest.totalBytes,
      ...(run.result.manifest.revision ? { revision: run.result.manifest.revision } : {}),
      ...(run.result.manifest.revisionId ? { revisionId: run.result.manifest.revisionId } : {}),
    };
  }

  return null;
}

/** Reconstructs an artifact without replaying sensitive transient results. */
export function artifactFromAuditEntry(entry: MorpheusAuditEntry): ExecutionArtifact | null {
  if (entry.phase !== 'succeeded' || !entry.outcome) return null;
  const outcome = entry.outcome;
  const createdAt = entry.ts;

  switch (outcome.kind) {
    case 'audio-control':
      return { kind: 'report', artifactId: entry.runId, createdAt, data: { controlKind: 'volume', level: outcome.level, observed: 1 } };
    case 'desktop-control':
      return { kind: 'report', artifactId: entry.runId, createdAt, data: { controlKind: 'app', applicationKey: outcome.applicationKey, operation: outcome.operation, observed: 1 } };
    case 'browser':
      return { kind: 'report', artifactId: entry.runId, createdAt, data: { origin: outcome.origin, digest: outcome.contentSha256, controls: outcome.controls } };
    case 'source':
      // Audit deliberately omits source content/queries. It cannot reconstruct a citation.
      return { kind: 'report', artifactId: entry.runId, createdAt, data: { origin: outcome.origin, bytes: outcome.bytes, digest: outcome.contentSha256, usageStatus: outcome.usageStatus } };
    case 'file':
      return {
        kind: 'file', artifactId: entry.runId, path: outcome.path,
        bytes: outcome.bytes, contentSha256: outcome.contentSha256, createdAt,
      };
    case 'launch':
      return {
        kind: 'process', artifactId: entry.runId, executablePath: outcome.executablePath,
        pid: outcome.pid, createdAt,
      };
    case 'project-launch':
      return {
        kind: 'process', artifactId: entry.runId, executablePath: outcome.executablePath,
        pid: outcome.pid, createdAt,
      };
    case 'system':
      return {
        kind: 'report', artifactId: entry.runId, createdAt,
        data: {
          platform: outcome.info.platform, release: outcome.info.release,
          arch: outcome.info.arch, cpuCount: outcome.info.cpuCount,
        },
      };
    case 'text':
      return {
        kind: 'report', artifactId: entry.runId, createdAt,
        data: { path: outcome.path, bytes: outcome.bytes },
      };
    case 'listing':
      return {
        kind: 'report', artifactId: entry.runId, createdAt,
        data: { path: outcome.path, entries: outcome.entryCount },
      };
    case 'deletion':
      return {
        kind: 'report', artifactId: entry.runId, createdAt,
        data: { deleted: outcome.relativePath, folder: outcome.wasFolder ? 1 : 0 },
      };
    case 'storage':
      return {
        kind: 'report', artifactId: entry.runId, createdAt,
        data: { root: outcome.root, freeBytes: outcome.freeBytes, totalBytes: outcome.totalBytes },
      };
    case 'processes':
      return {
        kind: 'report', artifactId: entry.runId, createdAt,
        data: { processes: outcome.processCount, truncated: outcome.truncated ? 1 : 0 },
      };
    case 'url':
      return {
        kind: 'report', artifactId: entry.runId, createdAt,
        data: { origin: outcome.origin },
      };
    case 'notification':
      return {
        kind: 'report', artifactId: entry.runId, createdAt,
        data: { notification: 'delivered' },
      };
    case 'scheduled-reminder':
      return {
        kind: 'schedule', artifactId: entry.runId, createdAt,
        scheduleId: outcome.scheduleId,
        workflowId: outcome.workflowId,
        triggerType: outcome.triggerType,
        ...(outcome.nextRunAt ? { nextRunAt: outcome.nextRunAt } : {}),
      };
    case 'website':
      return {
        kind: 'website', artifactId: entry.runId, createdAt,
        projectPath: outcome.projectPath,
        workspaceRoot: outcome.workspaceRoot,
        entryPath: outcome.entryPath,
        relativeEntryPath: outcome.relativeEntryPath,
        ...(outcome.interactiveTemplate ? { interactiveTemplate: outcome.interactiveTemplate } : {}),
        fileCount: outcome.fileCount,
        totalBytes: outcome.totalBytes,
        ...(outcome.revision ? { revision: outcome.revision } : {}),
        ...(outcome.revisionId ? { revisionId: outcome.revisionId } : {}),
      };
  }
}

export const useMorpheusCommandStore = create<MorpheusCommandState>((set, get) => ({
  input: '',
  plan: null,
  unsupported: null,
  interpreting: false,
  submitting: false,
  selectedObjectiveRunId: null,
  executing: false,
  planResult: null,
  consent: null,
  consentQueue: [],
  artifacts: [],
  filesRoot: null,
  permission: null,
  objectiveRun: null,
  objectiveHistory: null,

  setInput: (input) => set({ input }),

  submit: async () => {
    const objective = get().input.trim();
    if (!objective) return;
    await get().runObjective(objective, 'command-bar');
  },

  runObjective: async (objectiveInput, originType = 'command-bar') => {
    const objective = objectiveInput.trim();
    if (!objective || get().submitting) return false;

    set({ submitting: true, unsupported: null });
    try {
      // Every interactive surface enters the same Main-owned objective state
      // machine. Renderer never receives authority to execute plan steps.
      const workspaceId = useMorpheusWorkspacesStore.getState().selectedWorkspaceId;
      const agentProfileId = useMorpheusExecutionContextStore.getState().selectedAgentProfileId;
      const projectId = useMorpheusExecutionContextStore.getState().selectedProjectId;
      const result = await hostApi.morpheus.submitObjective({
        objective,
        originType,
        workspaceId,
        ...(agentProfileId ? { agentProfileId } : {}),
        ...(projectId ? { projectId } : {}),
      });
      if (!result.accepted) {
        set({
          unsupported: {
            objective,
            reason: 'not-understood',
            supportedCapabilities: supportedCapabilityIds(),
          },
          plan: null,
          interpreting: false,
        });
        return false;
      }
      set({ input: '', selectedObjectiveRunId: result.objectiveRunId });
      await get().loadObjectives();
      return true;
    } catch (error) {
      set({
        interpreting: false,
        executing: false,
        unsupported: { objective, reason: 'not-understood', supportedCapabilities: supportedCapabilityIds() },
      });
      console.error('[morpheus] command failed', error);
      return false;
    } finally {
      set({ submitting: false });
    }
  },

  clearPlan: () => set({
    plan: null,
    unsupported: null,
    planResult: null,
    objectiveRun: null,
    selectedObjectiveRunId: null,
  }),

  subscribeObjectives: () => hostEvents.onMorpheusObjectiveEvent((event) => {
    set((state) => objectiveStatePatch(event, state));
  }),

  loadObjectives: async () => {
    try {
      const before = get();
      const incoming = await hostApi.morpheus.objectiveSnapshot();
      const snapshot = { ...incoming, runsById: { ...incoming.runsById }, runOrder: [...incoming.runOrder],
        plansByObjectiveRunId: { ...incoming.plansByObjectiveRunId } };
      // Events delivered during this round trip are fresher than the snapshot.
      // Preserve them so a completed/cancelled task cannot turn active again.
      const current = get();
      for (const [id, value] of Object.entries(current.objectiveHistory?.runsById ?? {})) {
        if (value !== before.objectiveHistory?.runsById[id]) {
          snapshot.runsById[id] = value;
          if (!snapshot.runOrder.includes(id)) snapshot.runOrder.unshift(id);
          const plan = current.objectiveHistory?.plansByObjectiveRunId[id];
          if (plan) snapshot.plansByObjectiveRunId[id] = plan;
        }
      }
      snapshot.activeObjectiveRunId = snapshot.runOrder.find((id) => !isObjectiveTerminalState(snapshot.runsById[id].state)) ?? null;
      const preferred = current.selectedObjectiveRunId;
      const selectedId = preferred && snapshot.runsById[preferred] ? preferred : snapshot.activeObjectiveRunId ?? snapshot.runOrder[0];
      const run = selectedId ? snapshot.runsById[selectedId] ?? null : null;
      const plan = selectedId ? snapshot.plansByObjectiveRunId[selectedId] ?? null : null;
      set((state) => ({
        objectiveHistory: snapshot,
        selectedObjectiveRunId: selectedId ?? null,
        objectiveRun: run,
        plan: plan ?? (state.objectiveRun?.objectiveRunId === selectedId ? state.plan : null),
        planResult: run ? executionResultFromObjective(run) : null,
        interpreting: run ? ['understanding', 'planning', 'replanning'].includes(run.state) : false,
        executing: run ? !isObjectiveTerminalState(run.state)
          && !['understanding', 'planning', 'replanning'].includes(run.state) : false,
        unsupported: run?.state === 'needs-clarification'
          ? { objective: run.objective, reason: 'not-understood', supportedCapabilities: supportedCapabilityIds() }
          : null,
        artifacts: run ? mergeObjectiveArtifacts(state.artifacts, run.artifacts) : state.artifacts,
        ...(snapshot.pendingPlanConsents && current.consentQueue === before.consentQueue ? {
          consentQueue: [...snapshot.pendingPlanConsents], consent: snapshot.pendingPlanConsents[0] ?? null,
        } : {}),
      }));
    } catch {
      // A transient snapshot failure must not erase the last real event.
    }
  },

  selectObjective: (objectiveRunId) => {
    const state = get();
    const run = state.objectiveHistory?.runsById[objectiveRunId];
    if (!run) return;
    set({ selectedObjectiveRunId: objectiveRunId });
    set((previous) => objectiveStatePatch({
      v: 1, seq: 0, ts: run.updatedAt, objectiveRunId, state: run.state, run,
      plan: state.objectiveHistory?.plansByObjectiveRunId[objectiveRunId],
    }, previous));
  },

  cancelObjective: async () => {
    const run = get().objectiveRun;
    if (!run || isObjectiveTerminalState(run.state)) return;
    await hostApi.morpheus.cancelObjective({ objectiveRunId: run.objectiveRunId });
  },

  correctObjective: async (correction) => {
    const run = get().objectiveRun;
    const text = correction.trim();
    if (!run || !text) return;
    await hostApi.morpheus.correctObjective({ objectiveRunId: run.objectiveRunId, correction: text });
  },

  subscribeConsent: () => hostEvents.onMorpheusPlanConsent((event) => {
    set((state) => {
      const queue = [...state.consentQueue.filter((entry) => entry.planId !== event.planId), event];
      return { consentQueue: queue, consent: queue[0] ?? null };
    });
  }),

  answerConsent: async (decision) => {
    const request = get().consent;
    if (!request) return;
    await get().answerConsentPerBoundary(
      Object.fromEntries(request.boundaries.map((boundary) => [boundary.boundaryId, decision])),
    );
  },

  answerConsentPerBoundary: async (decisions) => {
    const request = get().consent;
    if (!request) return;
    // Cleared before the round-trip so a second click cannot answer twice; Main
    // also treats a repeated response as a no-op.
    set((state) => {
      const queue = state.consentQueue.filter((entry) => entry.planId !== request.planId);
      return { consentQueue: queue, consent: queue[0] ?? null };
    });
    try {
      await hostApi.morpheus.respondPlanPermission(request.planId, decisions);
    } catch (error) {
      console.error('[morpheus] consent response failed', error);
      await get().loadObjectives();
    }
    await get().loadPermissionCenter();
  },

  loadPermissionCenter: async () => {
    try {
      set({ permission: await hostApi.morpheus.permissionCenter() });
    } catch {
      set({ permission: null });
    }
  },

  setProfile: async (profile) => {
    await hostApi.morpheus.setPermissionProfile(profile).catch(() => undefined);
    await get().loadPermissionCenter();
  },

  revokeGrant: async (grantId) => {
    await hostApi.morpheus.revokeGrant(grantId).catch(() => undefined);
    await get().loadPermissionCenter();
  },

  revokeAllSession: async () => {
    await hostApi.morpheus.revokeAllSessionGrants().catch(() => undefined);
    await get().loadPermissionCenter();
  },

  resetPolicy: async () => {
    await hostApi.morpheus.resetPermissionPolicy().catch(() => undefined);
    await get().loadPermissionCenter();
  },

  loadFilesRoot: async () => {
    try {
      set({ filesRoot: (await hostApi.morpheus.filesRoot()).path });
    } catch {
      set({ filesRoot: null });
    }
  },

  loadArtifacts: async () => {
    try {
      const result = await hostApi.morpheus.auditQuery({
        category: 'execution', phase: 'succeeded', limit: MAX_ARTIFACTS,
      });
      const artifacts = result.entries.flatMap((entry) => {
        if (!('actionId' in entry)) return [];
        const artifact = artifactFromAuditEntry(entry);
        return artifact ? [artifact] : [];
      });
      set({ artifacts });
    } catch {
      // Keep session artifacts if the durable ledger is temporarily unavailable.
    }
  },

  openFilesRoot: async () => {
    await hostApi.morpheus.openFilesRoot().catch(() => undefined);
  },

  captureArtifact: (run) => {
    const artifact = artifactFromRun(run);
    if (!artifact) return;
    set((state) => {
      if (state.artifacts.some((existing) => existing.artifactId === artifact.artifactId)) return state;
      return { ...state, artifacts: [artifact, ...state.artifacts].slice(0, MAX_ARTIFACTS) };
    });
  },
}));
