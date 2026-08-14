import { create } from 'zustand';

import { hostApi } from '@/lib/host-api';
import type {
  CreateMorpheusSystemFromMissionResult,
  MorpheusSystem,
  MorpheusSystemDraft,
  MorpheusSystemExecutionResult,
  MorpheusSystemsSnapshot,
} from '@shared/morpheus/system-types';

const EMPTY: MorpheusSystemsSnapshot = { systems: [] };

type MorpheusSystemsState = {
  snapshot: MorpheusSystemsSnapshot;
  loading: boolean;
  busySystemId: string | null;
  error: string | null;
  load: () => Promise<void>;
  save: (draft: MorpheusSystemDraft) => Promise<MorpheusSystem | null>;
  remove: (systemId: string) => Promise<boolean>;
  createFromMission: (missionId: string, name?: string) => Promise<CreateMorpheusSystemFromMissionResult>;
  test: (systemId: string) => Promise<MorpheusSystemExecutionResult>;
  activate: (systemId: string) => Promise<MorpheusSystemExecutionResult>;
  pause: (systemId: string) => Promise<MorpheusSystemExecutionResult>;
  run: (systemId: string) => Promise<MorpheusSystemExecutionResult>;
  clearError: () => void;
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Morpheus Systems are unavailable.';
}

const REJECTED: MorpheusSystemExecutionResult = {
  system: null,
  accepted: false,
  message: 'The System request failed.',
};

export const useMorpheusSystemsStore = create<MorpheusSystemsState>((set) => {
  const refresh = async (): Promise<void> => {
    set({ snapshot: await hostApi.morpheus.systems() });
  };
  const execute = async (
    systemId: string,
    action: (id: string) => Promise<MorpheusSystemExecutionResult>,
  ): Promise<MorpheusSystemExecutionResult> => {
    set({ busySystemId: systemId, error: null });
    try {
      const result = await action(systemId);
      await refresh();
      set({ busySystemId: null, error: result.accepted ? null : result.message ?? null });
      return result;
    } catch (error) {
      const detail = message(error);
      set({ busySystemId: null, error: detail });
      return { ...REJECTED, message: detail };
    }
  };

  return {
    snapshot: EMPTY,
    loading: false,
    busySystemId: null,
    error: null,
    async load() {
      set({ loading: true, error: null });
      try { await refresh(); set({ loading: false }); }
      catch (error) { set({ loading: false, error: message(error) }); }
    },
    async save(draft) {
      try {
        const result = await hostApi.morpheus.saveSystem(draft);
        await refresh();
        set({ error: null });
        return result.system;
      } catch (error) { set({ error: message(error) }); return null; }
    },
    async remove(systemId) {
      try {
        await hostApi.morpheus.removeSystem(systemId);
        await refresh();
        set({ error: null });
        return true;
      } catch (error) { set({ error: message(error) }); return false; }
    },
    async createFromMission(missionId, name) {
      try {
        const result = await hostApi.morpheus.createSystemFromMission({ missionId, ...(name ? { name } : {}) });
        await refresh();
        set({ error: result.eligible ? null : result.reason ?? null });
        return result;
      } catch (error) {
        const detail = message(error);
        set({ error: detail });
        return { system: null, eligible: false, reason: detail };
      }
    },
    test: (systemId) => execute(systemId, hostApi.morpheus.testSystem),
    activate: (systemId) => execute(systemId, hostApi.morpheus.activateSystem),
    pause: (systemId) => execute(systemId, hostApi.morpheus.pauseSystem),
    run: (systemId) => execute(systemId, hostApi.morpheus.runSystem),
    clearError: () => set({ error: null }),
  };
});
