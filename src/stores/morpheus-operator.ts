import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { hostApi } from '@/lib/host-api';
import type {
  MorpheusInteractionDecision,
  MorpheusInteractionMode,
  MorpheusInteractionSurface,
} from '@shared/morpheus/operator-types';

type PendingConversation = {
  requestId: number;
  text: string;
};

type MorpheusOperatorState = {
  mode: MorpheusInteractionMode;
  lastDecision: MorpheusInteractionDecision | null;
  clarification: string | null;
  pendingConversation: PendingConversation | null;
  setMode: (mode: MorpheusInteractionMode) => void;
  route: (text: string, surface: MorpheusInteractionSurface) => Promise<MorpheusInteractionDecision>;
  queueConversation: (text: string) => void;
  consumeConversation: (requestId: number) => void;
  clearClarification: () => void;
};

let nextConversationRequestId = 1;

export const useMorpheusOperatorStore = create<MorpheusOperatorState>()(
  persist(
    (set) => ({
      mode: 'auto',
      lastDecision: null,
      clarification: null,
      pendingConversation: null,

      setMode: (mode) => set({ mode, clarification: null }),

      route: async (text, surface) => {
        const decision = await hostApi.morpheus.routeInteraction({
          text,
          mode: useMorpheusOperatorStore.getState().mode,
          surface,
        });
        set({
          lastDecision: decision,
          clarification: decision.route === 'clarification' ? decision.text : null,
        });
        return decision;
      },

      queueConversation: (text) => set({
        pendingConversation: { requestId: nextConversationRequestId++, text },
        clarification: null,
      }),

      consumeConversation: (requestId) => set((state) => (
        state.pendingConversation?.requestId === requestId
          ? { pendingConversation: null }
          : state
      )),

      clearClarification: () => set({ clarification: null }),
    }),
    {
      name: 'morpheus-operator-interface',
      partialize: (state) => ({ mode: state.mode }),
    },
  ),
);
