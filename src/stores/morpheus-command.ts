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
  ExecutionOriginType,
  ExecutionArtifact,
  ExecutionPlan,
  UnsupportedCommand,
} from '@shared/morpheus/execution-types';
import type { MorpheusPlanExecutionResult } from '@shared/host-api/contract';
import type {
  PermissionCenterSnapshot,
  PermissionProfile,
} from '@shared/morpheus/permission-types';
import type { MorpheusAuditEntry, MorpheusRun } from '@shared/morpheus/action-types';

const MAX_ARTIFACTS = 50;

export type MorpheusCommandState = {
  /** Raw text in the command bar. */
  input: string;
  /** Plan produced by the last interpretation, if any. */
  plan: ExecutionPlan | null;
  /** Truthful refusal for the last unsupported command. */
  unsupported: UnsupportedCommand | null;
  interpreting: boolean;
  /** True while Main is executing the plan. */
  executing: boolean;
  /** Per-step outcome of the last execution. Empty until one finishes. */
  planResult: MorpheusPlanExecutionResult | null;
  /**
   * The single outstanding consent request, or null.
   *
   * At most one: Main allows one plan in flight, and a second dialog would let
   * a user approve boundaries for a plan they are no longer looking at.
   */
  consent: MorpheusPlanConsentEvent | null;
  artifacts: ExecutionArtifact[];
  filesRoot: string | null;
  permission: PermissionCenterSnapshot | null;

  setInput: (input: string) => void;
  submit: () => Promise<void>;
  runObjective: (objective: string, originType?: ExecutionOriginType) => Promise<void>;
  executePreparedPlan: (plan: ExecutionPlan) => Promise<void>;
  clearPlan: () => void;
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

/** Derives an artifact from a terminal run, or null when it produced none. */
export function artifactFromRun(run: MorpheusRun): ExecutionArtifact | null {
  if (run.phase !== 'succeeded' || !run.result) return null;
  const createdAt = run.updatedAt;

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

  return null;
}

/** Reconstructs an artifact without replaying sensitive transient results. */
export function artifactFromAuditEntry(entry: MorpheusAuditEntry): ExecutionArtifact | null {
  if (entry.phase !== 'succeeded' || !entry.outcome) return null;
  const outcome = entry.outcome;
  const createdAt = entry.ts;

  switch (outcome.kind) {
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
  }
}

export const useMorpheusCommandStore = create<MorpheusCommandState>((set, get) => ({
  input: '',
  plan: null,
  unsupported: null,
  interpreting: false,
  executing: false,
  planResult: null,
  consent: null,
  artifacts: [],
  filesRoot: null,
  permission: null,

  setInput: (input) => set({ input }),

  submit: async () => {
    const objective = get().input.trim();
    if (!objective) return;
    await get().runObjective(objective, 'command-bar');
  },

  runObjective: async (objectiveInput, originType = 'command-bar') => {
    const objective = objectiveInput.trim();
    if (!objective) return;

    set({ interpreting: true, plan: null, unsupported: null, planResult: null });
    try {
      // Interpretation happens in Main so the plan's resource scope is the
      // canonical approved root rather than anything the renderer chose.
      const result = await hostApi.morpheus.interpretCommand(objective, originType);
      if (!result.ok) {
        set({ unsupported: result.unsupported, plan: null, interpreting: false });
        return;
      }

      set({ input: '' });
      await get().executePreparedPlan(result.plan);
    } catch (error) {
      set({
        interpreting: false,
        executing: false,
        unsupported: { objective, reason: 'not-understood', supportedCapabilities: [] },
      });
      console.error('[morpheus] command failed', error);
    }
  },

  executePreparedPlan: async (plan) => {
    set({ plan, unsupported: null, interpreting: false, executing: true, planResult: null });
    try {
      // The renderer names the plan Main authored; it does not orchestrate it.
      const execution = await hostApi.morpheus.executePlan(plan.planId);
      set({ planResult: execution, executing: false });
    } catch (error) {
      set({ executing: false });
      console.error('[morpheus] plan execution failed', error);
    }
  },

  clearPlan: () => set({ plan: null, unsupported: null, planResult: null }),

  subscribeConsent: () => hostEvents.onMorpheusPlanConsent((event) => {
    set({ consent: event });
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
    set({ consent: null });
    try {
      await hostApi.morpheus.respondPlanPermission(request.planId, decisions);
    } catch (error) {
      console.error('[morpheus] consent response failed', error);
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
