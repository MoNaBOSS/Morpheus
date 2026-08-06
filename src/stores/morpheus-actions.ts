/**
 * Morpheus action run store.
 *
 * Deliberately NOT persisted: run state is Main-owned. Rehydrating a stale run
 * across a restart would show a pending confirmation for a run the Main process
 * no longer knows about.
 *
 * Every entry originates from a real `morpheus:action-event` emission. There is
 * no seeded, simulated or optimistic transition here — the Renderer projects
 * what Main reports and nothing else.
 */
import { create } from 'zustand';

import { hostApi } from '@/lib/host-api';
import { hostEvents } from '@/lib/host-events';
import type { PermissionDecisionKind } from '@shared/morpheus/permission-types';
import type {
  MorpheusActionEvent,
  MorpheusActionSnapshot,
  MorpheusAuditEntry,
  MorpheusRun,
  MorpheusSystemInfo,
} from '@shared/morpheus/action-types';
import { isMorpheusTerminalPhase } from '@shared/morpheus/action-types';
import type { MorpheusActionId } from '@shared/morpheus/actions/registry';

/** Bound on retained runs so a long session cannot grow the timeline forever. */
const MAX_RETAINED_RUNS = 100;

export type MorpheusActionsState = MorpheusActionSnapshot & {
  subscribed: boolean;
  systemInfo: MorpheusSystemInfo | null;
  systemInfoError: string | null;
  supportedActions: Record<string, boolean>;
  platform: string | null;
  auditEntries: MorpheusAuditEntry[];
  auditLoading: boolean;
  requestError: string | null;

  subscribe: () => () => void;
  applyEvent: (event: MorpheusActionEvent) => void;
  loadSystemInfo: () => Promise<void>;
  loadCapabilities: () => Promise<void>;
  loadAudit: (limit?: number) => Promise<void>;
  requestAction: (actionId: MorpheusActionId, params?: Record<string, string>) => Promise<string | null>;
  respondPermission: (runId: string, decision: PermissionDecisionKind) => Promise<void>;
  cancelAction: (runId: string) => Promise<void>;
  clearRequestError: () => void;
  reset: () => void;
};

function toRun(previous: MorpheusRun | undefined, event: MorpheusActionEvent): MorpheusRun {
  return {
    runId: event.runId,
    actionId: event.actionId,
    phase: event.phase,
    seq: event.seq,
    requestedAt: previous?.requestedAt ?? event.ts,
    updatedAt: event.ts,
    // A later phase may omit a field an earlier one carried; keep the richer value.
    target: event.target ?? previous?.target,
    result: event.result ?? previous?.result,
    error: event.error ?? previous?.error,
    durationMs: event.durationMs ?? previous?.durationMs,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useMorpheusActionsStore = create<MorpheusActionsState>((set, get) => ({
  runOrder: [],
  runsById: {},
  subscribed: false,
  systemInfo: null,
  systemInfoError: null,
  supportedActions: {},
  platform: null,
  auditEntries: [],
  auditLoading: false,
  requestError: null,

  subscribe: () => {
    const unsubscribe = hostEvents.onMorpheusActionEvent((event) => {
      get().applyEvent(event);
    });
    set({ subscribed: true });
    return () => {
      set({ subscribed: false });
      unsubscribe();
    };
  },

  applyEvent: (event) => {
    if (!event || typeof event.runId !== 'string' || !event.runId) return;

    set((state) => {
      const previous = state.runsById[event.runId];
      // Main assigns a monotonic sequence. An out-of-order or duplicated
      // delivery must never move a run backwards.
      if (previous && previous.seq >= event.seq) return state;

      const runsById = { ...state.runsById, [event.runId]: toRun(previous, event) };
      let runOrder = previous ? state.runOrder : [...state.runOrder, event.runId];

      if (runOrder.length > MAX_RETAINED_RUNS) {
        const dropped = runOrder.slice(0, runOrder.length - MAX_RETAINED_RUNS);
        runOrder = runOrder.slice(-MAX_RETAINED_RUNS);
        for (const runId of dropped) delete runsById[runId];
      }

      return { ...state, runsById, runOrder };
    });

    // The audit view is a projection of the durable log, so refresh it once a
    // run reaches a terminal phase rather than guessing at its contents.
    if (isMorpheusTerminalPhase(event.phase)) {
      void get().loadAudit();
    }
  },

  loadSystemInfo: async () => {
    try {
      set({ systemInfo: await hostApi.morpheus.systemInfo(), systemInfoError: null });
    } catch (error) {
      set({ systemInfo: null, systemInfoError: errorMessage(error) });
    }
  },

  loadCapabilities: async () => {
    try {
      const described = await hostApi.morpheus.describeActions();
      const supportedActions: Record<string, boolean> = {};
      for (const entry of described.actions) supportedActions[entry.actionId] = entry.supported;
      set({ supportedActions, platform: described.platform });
    } catch {
      set({ supportedActions: {}, platform: null });
    }
  },

  loadAudit: async (limit = 25) => {
    set({ auditLoading: true });
    try {
      const result = await hostApi.morpheus.auditRecent(limit);
      set({ auditEntries: [...result.entries].reverse(), auditLoading: false });
    } catch {
      set({ auditLoading: false });
    }
  },

  requestAction: async (actionId, params) => {
    set({ requestError: null });
    try {
      const result = await hostApi.morpheus.requestAction({ actionId, params });
      return result.runId;
    } catch (error) {
      set({ requestError: errorMessage(error) });
      return null;
    }
  },

  respondPermission: async (runId, decision) => {
    try {
      await hostApi.morpheus.respondPermission({ runId, decision });
    } catch (error) {
      set({ requestError: errorMessage(error) });
    }
  },

  cancelAction: async (runId) => {
    try {
      await hostApi.morpheus.cancelAction({ runId });
    } catch (error) {
      set({ requestError: errorMessage(error) });
    }
  },

  clearRequestError: () => set({ requestError: null }),

  reset: () => set({
    runOrder: [],
    runsById: {},
    auditEntries: [],
    requestError: null,
  }),
}));

/**
 * The run currently awaiting a confirmation, if any.
 *
 * Safe to pass directly to `useMorpheusActionsStore`: it returns an existing
 * run reference or null, so the identity check settles.
 */
export function selectPendingPermissionRun(snapshot: MorpheusActionSnapshot): MorpheusRun | null {
  for (let index = snapshot.runOrder.length - 1; index >= 0; index -= 1) {
    const run = snapshot.runsById[snapshot.runOrder[index]];
    if (run?.phase === 'awaiting-permission') return run;
  }
  return null;
}

/**
 * Runs newest-first for display.
 *
 * NOT safe to pass directly to the store hook — it builds a new array on every
 * call, which would never satisfy zustand's `Object.is` check and would loop.
 * Select `runOrder` and `runsById` and memoise around this instead.
 */
export function selectRunsNewestFirst(snapshot: MorpheusActionSnapshot): MorpheusRun[] {
  const runs: MorpheusRun[] = [];
  for (let index = snapshot.runOrder.length - 1; index >= 0; index -= 1) {
    const run = snapshot.runsById[snapshot.runOrder[index]];
    if (run) runs.push(run);
  }
  return runs;
}
