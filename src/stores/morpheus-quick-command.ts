/** UI-only visibility state for the global Quick Command surface. */
import { create } from 'zustand';
import type { MorpheusCompanionTrigger } from '@shared/morpheus/companion-types';

type MorpheusQuickCommandState = {
  open: boolean;
  trigger: MorpheusCompanionTrigger | null;
  show: (trigger?: MorpheusCompanionTrigger) => void;
  hide: () => void;
};

export const useMorpheusQuickCommandStore = create<MorpheusQuickCommandState>((set) => ({
  open: false,
  trigger: null,
  show: (trigger) => set({ open: true, trigger: trigger ?? null }),
  hide: () => set({ open: false, trigger: null }),
}));
