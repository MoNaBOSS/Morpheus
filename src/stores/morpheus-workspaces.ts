/** Renderer projection of the Main-owned workspace registry. */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { hostApi } from '@/lib/host-api';
import {
  MORPHEUS_DEFAULT_WORKSPACE_ID,
  type AddMorpheusWorkspacePayload,
  type MorpheusWorkspace,
  type MorpheusWorkspacesSnapshot,
  type UpdateMorpheusWorkspacePayload,
} from '@shared/morpheus/workspace-types';

export type MorpheusWorkspacesState = {
  snapshot: MorpheusWorkspacesSnapshot | null;
  selectedWorkspaceId: string;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  select: (workspaceId: string) => void;
  add: (payload?: AddMorpheusWorkspacePayload) => Promise<MorpheusWorkspace | null>;
  update: (payload: UpdateMorpheusWorkspacePayload) => Promise<void>;
  remove: (workspaceId: string) => Promise<void>;
  open: (workspaceId?: string) => Promise<void>;
};

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useMorpheusWorkspacesStore = create<MorpheusWorkspacesState>()(
  persist(
    (set, get) => ({
      snapshot: null,
      selectedWorkspaceId: MORPHEUS_DEFAULT_WORKSPACE_ID,
      loading: false,
      error: null,

      load: async () => {
        set({ loading: true, error: null });
        try {
          const snapshot = await hostApi.morpheus.workspaces();
          const current = snapshot.workspaces.find(
            (workspace) => workspace.workspaceId === get().selectedWorkspaceId
              && workspace.enabled && workspace.available,
          );
          const fallback = snapshot.workspaces.find(
            (workspace) => workspace.workspaceId === snapshot.defaultWorkspaceId
              && workspace.enabled && workspace.available,
          ) ?? snapshot.workspaces.find((workspace) => workspace.enabled && workspace.available);
          set({
            snapshot,
            selectedWorkspaceId: current?.workspaceId
              ?? fallback?.workspaceId
              ?? MORPHEUS_DEFAULT_WORKSPACE_ID,
            loading: false,
          });
        } catch (error) {
          set({ loading: false, error: messageFrom(error) });
        }
      },

      select: (workspaceId) => {
        const workspace = get().snapshot?.workspaces.find(
          (candidate) => candidate.workspaceId === workspaceId,
        );
        if (workspace?.enabled && workspace.available) set({ selectedWorkspaceId: workspaceId });
      },

      add: async (payload = {}) => {
        set({ error: null });
        try {
          const result = await hostApi.morpheus.addWorkspace(payload);
          await get().load();
          if (result.workspace) set({ selectedWorkspaceId: result.workspace.workspaceId });
          return result.workspace;
        } catch (error) {
          set({ error: messageFrom(error) });
          return null;
        }
      },

      update: async (payload) => {
        set({ error: null });
        try {
          await hostApi.morpheus.updateWorkspace(payload);
          await get().load();
        } catch (error) {
          set({ error: messageFrom(error) });
        }
      },

      remove: async (workspaceId) => {
        set({ error: null });
        try {
          await hostApi.morpheus.removeWorkspace(workspaceId);
          if (get().selectedWorkspaceId === workspaceId) {
            set({ selectedWorkspaceId: MORPHEUS_DEFAULT_WORKSPACE_ID });
          }
          await get().load();
        } catch (error) {
          set({ error: messageFrom(error) });
        }
      },

      open: async (workspaceId = get().selectedWorkspaceId) => {
        await hostApi.morpheus.openWorkspace(workspaceId).catch((error) => {
          set({ error: messageFrom(error) });
        });
      },
    }),
    {
      name: 'morpheus.workspace-selection',
      // A logical selection is convenience state, never execution authority.
      partialize: (state) => ({ selectedWorkspaceId: state.selectedWorkspaceId }),
    },
  ),
);
