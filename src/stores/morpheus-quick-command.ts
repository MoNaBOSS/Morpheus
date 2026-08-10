/** UI-only visibility state for the global Quick Command surface. */
import { create } from 'zustand';

type MorpheusQuickCommandState = {
  open: boolean;
  show: () => void;
  hide: () => void;
};

export const useMorpheusQuickCommandStore = create<MorpheusQuickCommandState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));
