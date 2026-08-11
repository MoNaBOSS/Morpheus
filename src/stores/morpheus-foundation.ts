/** Renderer projection of Main-owned Morpheus 0.5 product models. */
import { create } from 'zustand';

import { hostApi } from '@/lib/host-api';
import { useMorpheusWorkspacesStore } from './morpheus-workspaces';
import type {
  AgentProfileSummary,
  MorpheusAgentProfile,
  MorpheusAgentProfileDraft,
} from '@shared/morpheus/agent-profile-types';
import type { MorpheusWorkflow, MorpheusWorkflowDraft } from '@shared/morpheus/workflow-types';
import type {
  MorpheusSchedule,
  MorpheusScheduleDraft,
  MorpheusScheduleRunResult,
} from '@shared/morpheus/schedule-types';
import type {
  MorpheusAuditQueryPayload,
  MorpheusAuditRecord,
} from '@shared/morpheus/action-types';

export type MorpheusFoundationState = {
  agentProfiles: readonly AgentProfileSummary[];
  workflows: readonly MorpheusWorkflow[];
  schedules: readonly MorpheusSchedule[];
  activity: readonly MorpheusAuditRecord[];
  activityCursor: string | null;
  activityTruncated: boolean;
  loading: boolean;
  error: string | null;
  loadModels: () => Promise<void>;
  getAgentProfile: (profileId: string) => Promise<MorpheusAgentProfile | null>;
  saveAgentProfile: (draft: MorpheusAgentProfileDraft) => Promise<MorpheusAgentProfile | null>;
  removeAgentProfile: (profileId: string) => Promise<void>;
  resetAgentProfiles: () => Promise<void>;
  saveWorkflow: (draft: MorpheusWorkflowDraft) => Promise<MorpheusWorkflow | null>;
  removeWorkflow: (workflowId: string) => Promise<void>;
  runWorkflow: (workflowId: string) => Promise<void>;
  saveSchedule: (draft: MorpheusScheduleDraft) => Promise<void>;
  removeSchedule: (scheduleId: string) => Promise<void>;
  runSchedule: (scheduleId: string) => Promise<MorpheusScheduleRunResult>;
  loadActivity: (payload?: MorpheusAuditQueryPayload, append?: boolean) => Promise<void>;
};

export const useMorpheusFoundationStore = create<MorpheusFoundationState>((set, get) => ({
  agentProfiles: [],
  workflows: [],
  schedules: [],
  activity: [],
  activityCursor: null,
  activityTruncated: false,
  loading: false,
  error: null,

  loadModels: async () => {
    set({ loading: true, error: null });
    try {
      const [agents, workflows, schedules] = await Promise.all([
        hostApi.morpheus.agentProfiles(),
        hostApi.morpheus.workflows(),
        hostApi.morpheus.schedules(),
      ]);
      set({
        agentProfiles: agents.profiles,
        workflows: workflows.workflows,
        schedules: schedules.schedules,
        loading: false,
      });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'Morpheus models are unavailable' });
    }
  },

  getAgentProfile: async (profileId) => (
    (await hostApi.morpheus.agentProfile(profileId)).profile
  ),

  saveAgentProfile: async (draft) => {
    try {
      const result = await hostApi.morpheus.saveAgentProfile(draft);
      await get().loadModels();
      return result.profile;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Agent Profile could not be saved' });
      return null;
    }
  },

  removeAgentProfile: async (profileId) => {
    try {
      await hostApi.morpheus.removeAgentProfile(profileId);
      await get().loadModels();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Agent Profile could not be removed' });
    }
  },

  resetAgentProfiles: async () => {
    await hostApi.morpheus.resetAgentProfiles();
    await get().loadModels();
  },

  saveWorkflow: async (draft) => {
    try {
      const result = await hostApi.morpheus.saveWorkflow(draft);
      await get().loadModels();
      return result.workflow;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Workflow could not be saved' });
      return null;
    }
  },

  removeWorkflow: async (workflowId) => {
    try {
      await hostApi.morpheus.removeWorkflow(workflowId);
      await get().loadModels();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Workflow could not be removed' });
    }
  },

  runWorkflow: async (workflowId) => {
    const workspaceId = useMorpheusWorkspacesStore.getState().selectedWorkspaceId;
    const result = await hostApi.morpheus.runWorkflow(workflowId, workspaceId);
    if (!result.accepted) set({ error: result.message ?? 'Morpheus could not start this workflow' });
  },

  saveSchedule: async (draft) => {
    await hostApi.morpheus.saveSchedule({
      ...draft,
      workspaceId: draft.workspaceId
        ?? useMorpheusWorkspacesStore.getState().selectedWorkspaceId,
    });
    set({ schedules: (await hostApi.morpheus.schedules()).schedules });
  },

  removeSchedule: async (scheduleId) => {
    await hostApi.morpheus.removeSchedule(scheduleId);
    set({ schedules: (await hostApi.morpheus.schedules()).schedules });
  },

  runSchedule: async (scheduleId) => {
    const result = await hostApi.morpheus.runSchedule(scheduleId);
    set({ schedules: (await hostApi.morpheus.schedules()).schedules });
    return result;
  },

  loadActivity: async (payload = {}, append = false) => {
    try {
      const result = await hostApi.morpheus.auditQuery({
        ...payload,
        ...(append && get().activityCursor ? { cursor: get().activityCursor as string } : {}),
      });
      set((state) => ({
        activity: append ? [...state.activity, ...result.entries] : result.entries,
        activityCursor: result.nextCursor ?? null,
        activityTruncated: result.truncated,
        error: null,
      }));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Activity is unavailable' });
    }
  },
}));
