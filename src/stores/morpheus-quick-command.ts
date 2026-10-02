/** UI-only visibility state for the global Quick Command surface. */
import { create } from 'zustand';
import type { MorpheusCompanionTrigger } from '@shared/morpheus/companion-types';
import { hostApi } from '@/lib/host-api';

type MorpheusQuickCommandState = {
  open: boolean;
  trigger: MorpheusCompanionTrigger | null;
  show: (trigger?: MorpheusCompanionTrigger) => void;
  hide: () => void;
};

export const useMorpheusQuickCommandStore = create<MorpheusQuickCommandState>((set, get) => ({
  open: false,
  trigger: null,
  show: (trigger) => {
    set({ open: true, trigger: trigger ?? null });
    if (!trigger && window.electron?.platform === 'win32') void Promise.resolve().then(() => hostApi.morpheus.showCompanionSurface()).then((status) => {
      if (get().open && status.mode === 'compact') set({ trigger: status.trigger ?? 'global-shortcut' });
    }).catch(() => undefined);
  },
  hide: () => set({ open: false, trigger: null }),
}));
