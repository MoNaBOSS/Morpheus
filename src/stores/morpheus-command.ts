/**
 * Command Center state: interpretation, plans, artifacts and permission policy.
 *
 * Not persisted — every value here is Main-owned. Rehydrating a stale plan or a
 * stale grant list across a restart would show trust the main process no longer
 * has.
 */
import { create } from 'zustand';

import { hostApi } from '@/lib/host-api';
import type {
  ExecutionArtifact,
  ExecutionPlan,
  UnsupportedCommand,
} from '@shared/morpheus/execution-types';
import type {
  PermissionCenterSnapshot,
  PermissionProfile,
} from '@shared/morpheus/permission-types';
import type { MorpheusRun } from '@shared/morpheus/action-types';

const MAX_ARTIFACTS = 50;

export type MorpheusCommandState = {
  /** Raw text in the command bar. */
  input: string;
  /** Plan produced by the last interpretation, if any. */
  plan: ExecutionPlan | null;
  /** Truthful refusal for the last unsupported command. */
  unsupported: UnsupportedCommand | null;
  interpreting: boolean;
  artifacts: ExecutionArtifact[];
  filesRoot: string | null;
  permission: PermissionCenterSnapshot | null;

  setInput: (input: string) => void;
  submit: () => Promise<void>;
  clearPlan: () => void;
  loadPermissionCenter: () => Promise<void>;
  setProfile: (profile: PermissionProfile) => Promise<void>;
  revokeGrant: (grantId: string) => Promise<void>;
  revokeAllSession: () => Promise<void>;
  resetPolicy: () => Promise<void>;
  loadFilesRoot: () => Promise<void>;
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

export const useMorpheusCommandStore = create<MorpheusCommandState>((set, get) => ({
  input: '',
  plan: null,
  unsupported: null,
  interpreting: false,
  artifacts: [],
  filesRoot: null,
  permission: null,

  setInput: (input) => set({ input }),

  submit: async () => {
    const objective = get().input.trim();
    if (!objective) return;

    set({ interpreting: true, plan: null, unsupported: null });
    try {
      // Interpretation happens in Main so the plan's resource scope is the
      // canonical approved root rather than anything the renderer chose.
      const result = await hostApi.morpheus.interpretCommand(objective, 'command-bar');
      if (result.ok) {
        set({ plan: result.plan, unsupported: null, interpreting: false, input: '' });
        // The plan's single step is dispatched immediately; the policy engine
        // decides whether it runs or prompts.
        const step = result.plan.steps[0];
        if (step) {
          await hostApi.morpheus.requestAction({
            actionId: step.capabilityId,
            params: step.params,
            originType: 'command-bar',
          });
        }
      } else {
        set({ unsupported: result.unsupported, plan: null, interpreting: false });
      }
    } catch (error) {
      set({
        interpreting: false,
        unsupported: { objective, reason: 'not-understood', supportedCapabilities: [] },
      });
      console.error('[morpheus] command failed', error);
    }
  },

  clearPlan: () => set({ plan: null, unsupported: null }),

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
