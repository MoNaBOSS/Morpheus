/** Logical Renderer preferences only. Main resolves and authorizes every value. */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type MorpheusExecutionContextState = {
  selectedAgentProfileId: string | null;
  selectAgentProfile: (profileId: string | null) => void;
};

export const useMorpheusExecutionContextStore = create<MorpheusExecutionContextState>()(
  persist(
    (set) => ({
      selectedAgentProfileId: null,
      selectAgentProfile: (selectedAgentProfileId) => set({ selectedAgentProfileId }),
    }),
    {
      name: 'morpheus.execution-context',
      // A logical id is convenience state. It is never a permission principal.
      partialize: (state) => ({ selectedAgentProfileId: state.selectedAgentProfileId }),
    },
  ),
);
