/** Renderer projection of Main-owned Missions, Projects, memory, and activation. */
import { create } from 'zustand';

import { hostApi } from '@/lib/host-api';
import type { MorpheusMission, MorpheusMissionsSnapshot } from '@shared/morpheus/mission-types';
import type {
  MorpheusProject,
  MorpheusProjectDraft,
  MorpheusProjectsSnapshot,
} from '@shared/morpheus/project-types';
import type { MorpheusMemory, MorpheusMemoryDraft } from '@shared/morpheus/memory-types';
import type {
  CompleteMorpheusOnboardingPayload,
  MorpheusOnboardingStatus,
} from '@shared/morpheus/onboarding-types';

const EMPTY_MISSIONS: MorpheusMissionsSnapshot = {
  activeMissionId: null,
  missionOrder: [],
  missionsById: {},
};

const EMPTY_PROJECTS: MorpheusProjectsSnapshot = {
  defaultProjectId: 'personal',
  projects: [],
};

type MorpheusCompanionState = {
  missions: MorpheusMissionsSnapshot;
  projects: MorpheusProjectsSnapshot;
  memories: readonly MorpheusMemory[];
  onboarding: MorpheusOnboardingStatus | null;
  loading: boolean;
  error: string | null;
  loadAll: () => Promise<void>;
  loadMissions: () => Promise<void>;
  loadContext: () => Promise<void>;
  loadOnboarding: () => Promise<void>;
  getMission: (missionId: string) => MorpheusMission | null;
  rerunMission: (missionId: string) => Promise<boolean>;
  cancelMission: (missionId: string) => Promise<boolean>;
  saveProject: (draft: MorpheusProjectDraft) => Promise<MorpheusProject | null>;
  removeProject: (projectId: string) => Promise<boolean>;
  saveMemory: (draft: MorpheusMemoryDraft) => Promise<MorpheusMemory | null>;
  removeMemory: (memoryId: string) => Promise<boolean>;
  completeOnboarding: (payload: CompleteMorpheusOnboardingPayload) => Promise<boolean>;
  resetOnboarding: () => Promise<void>;
  clearError: () => void;
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Morpheus companion state is unavailable';
}

export const useMorpheusCompanionStore = create<MorpheusCompanionState>((set, get) => ({
  missions: EMPTY_MISSIONS,
  projects: EMPTY_PROJECTS,
  memories: [],
  onboarding: null,
  loading: false,
  error: null,

  loadAll: async () => {
    set({ loading: true, error: null });
    try {
      const [missions, projects, memories, onboarding] = await Promise.all([
        hostApi.morpheus.missions(),
        hostApi.morpheus.projects(),
        hostApi.morpheus.memories(),
        hostApi.morpheus.onboardingStatus(),
      ]);
      set({ missions, projects, memories: memories.memories, onboarding, loading: false });
    } catch (error) {
      set({ loading: false, error: message(error) });
    }
  },

  loadMissions: async () => {
    try {
      set({ missions: await hostApi.morpheus.missions(), error: null });
    } catch (error) {
      set({ error: message(error) });
    }
  },

  loadContext: async () => {
    try {
      const [projects, memories] = await Promise.all([
        hostApi.morpheus.projects(),
        hostApi.morpheus.memories(),
      ]);
      set({ projects, memories: memories.memories, error: null });
    } catch (error) {
      set({ error: message(error) });
    }
  },

  loadOnboarding: async () => {
    try {
      set({ onboarding: await hostApi.morpheus.onboardingStatus(), error: null });
    } catch (error) {
      set({ error: message(error) });
    }
  },

  getMission: (missionId) => get().missions.missionsById[missionId] ?? null,

  rerunMission: async (missionId) => {
    try {
      const result = await hostApi.morpheus.rerunMission(missionId);
      await get().loadMissions();
      return result.accepted;
    } catch (error) {
      set({ error: message(error) });
      return false;
    }
  },

  cancelMission: async (missionId) => {
    const mission = get().missions.missionsById[missionId];
    if (!mission?.activeObjectiveRunId) return false;
    try {
      await hostApi.morpheus.cancelObjective({ objectiveRunId: mission.activeObjectiveRunId });
      await get().loadMissions();
      return true;
    } catch (error) {
      set({ error: message(error) });
      return false;
    }
  },

  saveProject: async (draft) => {
    try {
      const result = await hostApi.morpheus.saveProject(draft);
      await get().loadContext();
      return result.project;
    } catch (error) {
      set({ error: message(error) });
      return null;
    }
  },

  removeProject: async (projectId) => {
    try {
      await hostApi.morpheus.removeProject(projectId);
      await get().loadContext();
      return true;
    } catch (error) {
      set({ error: message(error) });
      return false;
    }
  },

  saveMemory: async (draft) => {
    try {
      const result = await hostApi.morpheus.saveMemory(draft);
      await get().loadContext();
      return result.memory;
    } catch (error) {
      set({ error: message(error) });
      return null;
    }
  },

  removeMemory: async (memoryId) => {
    try {
      await hostApi.morpheus.removeMemory(memoryId);
      await get().loadContext();
      return true;
    } catch (error) {
      set({ error: message(error) });
      return false;
    }
  },

  completeOnboarding: async (payload) => {
    try {
      set({ onboarding: await hostApi.morpheus.completeOnboarding(payload), error: null });
      return true;
    } catch (error) {
      set({ error: message(error) });
      return false;
    }
  },

  resetOnboarding: async () => {
    try {
      set({ onboarding: await hostApi.morpheus.resetOnboarding(), error: null });
    } catch (error) {
      set({ error: message(error) });
    }
  },

  clearError: () => set({ error: null }),
}));
