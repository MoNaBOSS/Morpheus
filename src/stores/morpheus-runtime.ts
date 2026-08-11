import { create } from 'zustand';

import { hostApi } from '@/lib/host-api';
import type { MorpheusRuntimeControlSnapshot } from '@shared/morpheus/runtime-control-types';

type MorpheusRuntimeState = {
  control: MorpheusRuntimeControlSnapshot | null;
  loading: boolean;
  updating: boolean;
  error: string | null;
  load: () => Promise<void>;
  setPaused: (paused: boolean) => Promise<void>;
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useMorpheusRuntimeStore = create<MorpheusRuntimeState>((set) => ({
  control: null,
  loading: false,
  updating: false,
  error: null,

  async load() {
    set({ loading: true });
    try {
      set({ control: await hostApi.morpheus.runtimeControl(), loading: false, error: null });
    } catch (error) {
      set({ loading: false, error: message(error) });
    }
  },

  async setPaused(paused) {
    set({ updating: true });
    try {
      set({ control: await hostApi.morpheus.setRuntimePaused(paused), updating: false, error: null });
    } catch (error) {
      set({ updating: false, error: message(error) });
    }
  },
}));
