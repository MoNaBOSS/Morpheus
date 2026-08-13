/** Logical Renderer preferences only. Main resolves and authorizes every value. */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type MorpheusExecutionContextState = {
  selectedAgentProfileId: string | null;
  selectedProjectId: string | null;
  selectAgentProfile: (profileId: string | null) => void;
  selectProject: (projectId: string | null) => void;
};

export const useMorpheusExecutionContextStore = create<MorpheusExecutionContextState>()(
  persist(
    (set) => ({
      selectedAgentProfileId: null,
      selectedProjectId: 'personal',
      selectAgentProfile: (selectedAgentProfileId) => set({ selectedAgentProfileId }),
      selectProject: (selectedProjectId) => set({ selectedProjectId }),
    }),
    {
      name: 'morpheus.execution-context',
      // A logical id is convenience state. It is never a permission principal.
      partialize: (state) => ({
        selectedAgentProfileId: state.selectedAgentProfileId,
        selectedProjectId: state.selectedProjectId,
      }),
    },
  ),
);
