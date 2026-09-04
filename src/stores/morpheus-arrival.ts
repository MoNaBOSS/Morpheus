import { create } from 'zustand';

/** Presentation only. Never writes onboarding, microphone or trust settings. */
export const useMorpheusArrivalStore = create<{
  welcomeOpen: boolean;
  openWelcome: () => void;
  closeWelcome: () => void;
}>((set) => ({
  welcomeOpen: false,
  openWelcome: () => set({ welcomeOpen: true }),
  closeWelcome: () => set({ welcomeOpen: false }),
}));
