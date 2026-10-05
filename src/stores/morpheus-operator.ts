import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { hostApi } from '@/lib/host-api';
import { stopMorpheusSpeech } from '@/lib/morpheus-speech-player';
import { toast } from 'sonner';
import i18n from 'i18next';
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
  pendingConversations: PendingConversation[];
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
      pendingConversations: [],

      setMode: (mode) => set({ mode, clarification: null }),

      route: async (text, surface) => {
        const decision = await hostApi.morpheus.routeInteraction({
          text,
          // The public interaction is automatic; old persisted Ask/Act choices
          // must not silently change routing after their controls disappear.
          mode: 'auto',
          surface,
        });
        if (decision.route === 'control' && decision.control) {
          if (decision.control === 'speech-stopped') stopMorpheusSpeech();
          toast.info(i18n.t(`dashboard:morpheus.tasks.control.${decision.control}`));
        }
        set({
          lastDecision: decision,
          clarification: decision.route === 'clarification'
            ? i18n.t('dashboard:morpheus.operator.clarification') : null,
        });
        return decision;
      },

      queueConversation: (text) => set((state) => {
        if (state.pendingConversations.length >= 32) throw new Error('Morpheus conversation queue is full');
        const pendingConversations = [
          ...state.pendingConversations,
          { requestId: nextConversationRequestId++, text },
        ];
        return { pendingConversations, pendingConversation: pendingConversations[0], clarification: null };
      }),

      consumeConversation: (requestId) => set((state) => {
        const pendingConversations = state.pendingConversations.filter((pending) => pending.requestId !== requestId);
        if (pendingConversations.length === state.pendingConversations.length) return state;
        return { pendingConversations, pendingConversation: pendingConversations[0] ?? null };
      }),

      clearClarification: () => set({ clarification: null }),
    }),
    {
      name: 'morpheus-operator-interface',
      partialize: (state) => ({ mode: state.mode }),
    },
  ),
);
