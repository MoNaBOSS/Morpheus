import { create } from 'zustand';

import { hostApi } from '@/lib/host-api';
import type { MorpheusGoal, MorpheusGoalDraft, MorpheusGoalsSnapshot } from '@shared/morpheus/goal-types';
import type {
  CreateMorpheusReminderPayload,
  MorpheusAttentionItem,
  MorpheusProactiveSettingsPatch,
  MorpheusProactiveSnapshot,
} from '@shared/morpheus/proactive-types';

const EMPTY_GOALS: MorpheusGoalsSnapshot = { goals: [] };
const EMPTY_PROACTIVE: MorpheusProactiveSnapshot = {
  settings: {
    v: 1, enabled: true, notificationsEnabled: false, quietHoursEnabled: true,
    quietHoursStart: '22:00', quietHoursEnd: '08:00',
    categories: { mission: true, goal: true, schedule: true, routine: true, reminder: true },
  },
  items: [], generatedAt: new Date(0).toISOString(),
};

type MorpheusIntelligenceState = {
  goals: MorpheusGoalsSnapshot;
  proactive: MorpheusProactiveSnapshot;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  refreshToday: () => Promise<void>;
  saveGoal: (draft: MorpheusGoalDraft) => Promise<MorpheusGoal | null>;
  removeGoal: (goalId: string) => Promise<boolean>;
  continueGoal: (goalId: string) => Promise<boolean>;
  updateProactiveSettings: (patch: MorpheusProactiveSettingsPatch) => Promise<boolean>;
  createReminder: (payload: CreateMorpheusReminderPayload) => Promise<MorpheusAttentionItem | null>;
  dismissAttention: (attentionId: string) => Promise<void>;
  snoozeAttention: (attentionId: string, until: string) => Promise<void>;
  removeReminder: (attentionId: string) => Promise<void>;
  actOnAttention: (attentionId: string) => Promise<boolean>;
  clearError: () => void;
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Morpheus intelligence state is unavailable';
}

export const useMorpheusIntelligenceStore = create<MorpheusIntelligenceState>((set, get) => ({
  goals: EMPTY_GOALS,
  proactive: EMPTY_PROACTIVE,
  loading: false,
  error: null,
  async load() {
    set({ loading: true, error: null });
    try {
      const [goals, proactive] = await Promise.all([
        hostApi.morpheus.goals(), hostApi.morpheus.refreshProactive(),
      ]);
      set({ goals, proactive, loading: false });
    } catch (error) {
      set({ loading: false, error: message(error) });
    }
  },
  async refreshToday() {
    try { set({ proactive: await hostApi.morpheus.refreshProactive(), error: null }); }
    catch (error) { set({ error: message(error) }); }
  },
  async saveGoal(draft) {
    try {
      const { goal } = await hostApi.morpheus.saveGoal(draft);
      set({ goals: await hostApi.morpheus.goals(), error: null });
      return goal;
    } catch (error) { set({ error: message(error) }); return null; }
  },
  async removeGoal(goalId) {
    try {
      await hostApi.morpheus.removeGoal(goalId);
      set({ goals: await hostApi.morpheus.goals(), error: null });
      return true;
    } catch (error) { set({ error: message(error) }); return false; }
  },
  async continueGoal(goalId) {
    try {
      const result = await hostApi.morpheus.continueGoal(goalId);
      set({ goals: await hostApi.morpheus.goals(), error: result.accepted ? null : result.message ?? null });
      return result.accepted;
    } catch (error) { set({ error: message(error) }); return false; }
  },
  async updateProactiveSettings(patch) {
    try {
      const settings = await hostApi.morpheus.updateProactiveSettings(patch);
      set((state) => ({ proactive: { ...state.proactive, settings }, error: null }));
      return true;
    } catch (error) { set({ error: message(error) }); return false; }
  },
  async createReminder(payload) {
    try {
      const item = await hostApi.morpheus.createReminder(payload);
      await get().refreshToday();
      return item;
    } catch (error) { set({ error: message(error) }); return null; }
  },
  async dismissAttention(attentionId) {
    try { await hostApi.morpheus.dismissAttention(attentionId); await get().refreshToday(); }
    catch (error) { set({ error: message(error) }); }
  },
  async snoozeAttention(attentionId, until) {
    try { await hostApi.morpheus.snoozeAttention(attentionId, until); await get().refreshToday(); }
    catch (error) { set({ error: message(error) }); }
  },
  async removeReminder(attentionId) {
    try { await hostApi.morpheus.removeReminder(attentionId); await get().refreshToday(); }
    catch (error) { set({ error: message(error) }); }
  },
  async actOnAttention(attentionId) {
    try {
      const result = await hostApi.morpheus.actOnAttention(attentionId);
      await get().refreshToday();
      if (!result.accepted) set({ error: result.message ?? 'Morpheus could not start this action.' });
      return result.accepted;
    } catch (error) { set({ error: message(error) }); return false; }
  },
  clearError: () => set({ error: null }),
}));
