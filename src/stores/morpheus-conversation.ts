import { create } from 'zustand';
import { hostApi } from '@/lib/host-api';
import { hostEvents } from '@/lib/host-events';
import { resolveEffectiveWorkspace } from '@/lib/workspace-context';
import i18n from '@/i18n';
import { ensureAcpChatSubscriptions, useAcpChatSessionStore } from './acp-chat-session';
import { useChatStore } from './chat';
import { useSettingsStore } from './settings';
import type {
  MorpheusAssistantSnapshot,
  MorpheusAssistantTurnSource,
} from '@shared/morpheus/assistant-session-types';

type MorpheusConversationState = {
  snapshot: MorpheusAssistantSnapshot | null;
  draftText: string;
  loading: boolean;
  submitting: boolean;
  dispatchError: string | null;
  blockedTurnId: string | null;
  start: () => () => void;
  refresh: () => Promise<void>;
  setDraft: (text: string) => void;
  submit: (text: string, source: MorpheusAssistantTurnSource) => Promise<boolean>;
  selectConversation: (conversationId: string) => Promise<void>;
  retryPending: () => void;
  restoreHistory: (conversationId: string) => Promise<void>;
};

let activeListeners = 0;
let unsubscribeSession: (() => void) | null = null;
let unsubscribeChat: (() => void) | null = null;
let unsubscribeAcp: (() => void) | null = null;
let refreshRequest = 0;
let inFlightTurnId: string | null = null;
let draining = false;
let draftWriterActive = false;
const queuedDrafts = new Map<string, string>();
const dirtyDrafts = new Map<string, string>();
let applyingMainSelection = false;
const sessionLoads = new Map<string, Promise<{ cwd: string } | null>>();

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function flushDrafts(): Promise<void> {
  if (draftWriterActive) return;
  draftWriterActive = true;
  try {
    while (queuedDrafts.size) {
      const entry = queuedDrafts.entries().next().value as [string, string] | undefined;
      if (!entry) break;
      const [conversationId, text] = entry;
      queuedDrafts.delete(conversationId);
      try {
        const current = await hostApi.morpheus.assistantSnapshot({ conversationId });
        const updated = await hostApi.morpheus.updateAssistantDraft({
          conversationId,
          expectedRevision: current.draft.revision,
          text,
        });
        const state = useMorpheusConversationStore.getState();
        if (!queuedDrafts.has(conversationId) && dirtyDrafts.get(conversationId) === text) {
          dirtyDrafts.delete(conversationId);
        }
        if (state.snapshot?.selectedConversationId === conversationId && !queuedDrafts.has(conversationId)) {
          useMorpheusConversationStore.setState({
            snapshot: { ...state.snapshot, draft: updated },
            draftText: state.draftText === text ? updated.text : state.draftText,
            dispatchError: null,
          });
        }
      } catch (error) {
        // Revision conflicts preserve the local draft visibly. They are never
        // resolved by silently overwriting a newer draft from another surface.
        useMorpheusConversationStore.setState({ dispatchError: messageFromError(error) });
      }
    }
  } finally {
    draftWriterActive = false;
  }
}

async function loadSelectedAcpSession(conversationId: string, allowCreate = true): Promise<{ cwd: string } | null> {
  const existing = sessionLoads.get(conversationId);
  if (existing) return existing;
  const pending = loadAcpSession(conversationId, allowCreate);
  sessionLoads.set(conversationId, pending);
  try { return await pending; }
  finally { if (sessionLoads.get(conversationId) === pending) sessionLoads.delete(conversationId); }
}

async function loadAcpSession(conversationId: string, allowCreate: boolean): Promise<{ cwd: string } | null> {
  const chat = useChatStore.getState();
  const session = chat.sessions.find((entry) => entry.key === conversationId);
  const cwd = resolveEffectiveWorkspace({
    session,
    globalWorkspace: useSettingsStore.getState().chatWorkspacePath,
  }).cwd;
  const resolved = await hostApi.files.resolveWorkspaceContext({
    workspaceRoot: cwd,
    executionCwd: cwd,
  });
  if (!resolved.ok || !resolved.workspaceRoot || !resolved.executionCwd) {
    throw new Error(i18n.t('dashboard:morpheus.conversation.workspaceUnavailable'));
  }
  const acp = useAcpChatSessionStore.getState();
  if (acp.activeSessionKey === conversationId && acp.workspaceRoot === resolved.workspaceRoot
    && acp.cwd === resolved.executionCwd && !acp.loading && !acp.error) {
    return acp.sending ? null : { cwd: resolved.executionCwd };
  }
  if (acp.activeSessionKey === conversationId && acp.loading) return null;

  const createIfMissing = allowCreate && (!session || !!session.createdLocally);
  const loaded = await acp.loadSession({
    sessionKey: conversationId,
    workspaceRoot: resolved.workspaceRoot,
    cwd: resolved.executionCwd,
    ...(createIfMissing ? { createIfMissing: true } : {}),
  });
  if (!loaded) throw new Error(useAcpChatSessionStore.getState().error
    ?? i18n.t('dashboard:morpheus.conversation.deliveryFailed'));
  if (createIfMissing) chat.acknowledgeAcpSessionCreated(conversationId, resolved.executionCwd);
  return { cwd: resolved.executionCwd };
}

async function drainPendingTurns(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (true) {
      const state = useMorpheusConversationStore.getState();
      const conversationId = state.snapshot?.selectedConversationId;
      const pending = state.snapshot?.pendingTurns.find((turn) => turn.conversationId === conversationId);
      if (!conversationId || !pending || state.blockedTurnId === pending.turnId) return;
      if (inFlightTurnId) return;
      inFlightTurnId = pending.turnId;
      try {
        const loaded = await loadSelectedAcpSession(conversationId);
        if (!loaded) return;
        if (useMorpheusConversationStore.getState().snapshot?.selectedConversationId !== conversationId) return;
        // Main may have consumed this admission while a fresh renderer awaited
        // the original prompt's history. Re-read its owner before dispatching.
        await useMorpheusConversationStore.getState().refresh();
        if (!useMorpheusConversationStore.getState().snapshot?.pendingTurns.some((turn) =>
          turn.conversationId === conversationId && turn.turnId === pending.turnId
          && turn.generation === pending.generation && turn.text === pending.text)) continue;
        const success = await useAcpChatSessionStore.getState().sendPrompt({
          sessionKey: conversationId,
          cwd: loaded.cwd,
          message: pending.text,
          messageId: pending.turnId,
        });
        if (!success) {
          useMorpheusConversationStore.setState({
            blockedTurnId: pending.turnId,
            dispatchError: useAcpChatSessionStore.getState().error
              ?? i18n.t('dashboard:morpheus.conversation.deliveryFailed'),
          });
          return;
        }
        await hostApi.morpheus.ackAssistantTurn({ conversationId, turnId: pending.turnId });
        await useMorpheusConversationStore.getState().refresh();
      } catch (error) {
        useMorpheusConversationStore.setState({
          blockedTurnId: pending.turnId,
          dispatchError: messageFromError(error),
        });
        return;
      } finally {
        inFlightTurnId = null;
      }
    }
  } finally {
    draining = false;
  }
}

function applySnapshot(snapshot: MorpheusAssistantSnapshot): void {
  const current = useMorpheusConversationStore.getState();
  if (current.snapshot && snapshot.sequence < current.snapshot.sequence) return;
  const selected = snapshot.selectedConversationId;
  if (!current.snapshot && current.draftText) {
    queuedDrafts.set(selected, current.draftText);
    dirtyDrafts.set(selected, current.draftText);
    void flushDrafts();
  }
  useMorpheusConversationStore.setState({
    snapshot,
    draftText: dirtyDrafts.get(selected) ?? snapshot.draft.text,
    loading: false,
  });
  if (useChatStore.getState().currentSessionKey !== selected) {
    applyingMainSelection = true;
    try { useChatStore.getState().switchSession(selected); }
    finally { applyingMainSelection = false; }
  }
  void drainPendingTurns();
}

export const useMorpheusConversationStore = create<MorpheusConversationState>((set, get) => ({
  snapshot: null,
  draftText: '',
  loading: false,
  submitting: false,
  dispatchError: null,
  blockedTurnId: null,

  start: () => {
    activeListeners += 1;
    if (activeListeners === 1) {
      ensureAcpChatSubscriptions();
      unsubscribeSession = hostEvents.onMorpheusAssistantSessionChanged(() => {
        void get().refresh();
      });
      unsubscribeChat = useChatStore.subscribe((state, previous) => {
        if (applyingMainSelection || !get().snapshot || state.currentSessionKey === previous.currentSessionKey) return;
        void get().selectConversation(state.currentSessionKey);
      });
      unsubscribeAcp = useAcpChatSessionStore.subscribe((state, previous) => {
        if ((previous.loading && !state.loading) || (previous.sending && !state.sending)) {
          void drainPendingTurns();
        }
      });
      void get().refresh();
    }
    return () => {
      activeListeners = Math.max(0, activeListeners - 1);
      if (activeListeners === 0) {
        unsubscribeSession?.();
        unsubscribeChat?.();
        unsubscribeAcp?.();
        unsubscribeSession = null;
        unsubscribeChat = null;
        unsubscribeAcp = null;
      }
    };
  },

  refresh: async () => {
    const request = ++refreshRequest;
    set({ loading: get().snapshot === null });
    try {
      const snapshot = await hostApi.morpheus.assistantSnapshot();
      if (request !== refreshRequest) return;
      applySnapshot(snapshot);
    } catch (error) {
      if (request === refreshRequest) set({ loading: false, dispatchError: messageFromError(error) });
    }
  },

  setDraft: (text) => {
    const conversationId = get().snapshot?.selectedConversationId;
    set({ draftText: text });
    if (!conversationId) return;
    queuedDrafts.set(conversationId, text);
    dirtyDrafts.set(conversationId, text);
    void flushDrafts();
  },

  submit: async (text, source) => {
    const normalized = text.trim();
    if (!get().snapshot) await get().refresh();
    const conversationId = get().snapshot?.selectedConversationId;
    if (!conversationId || !normalized) return false;
    set({ submitting: true, dispatchError: null });
    try {
      await hostApi.morpheus.admitAssistantTurn({
        conversationId,
        clientRequestId: crypto.randomUUID(),
        text: normalized,
        source,
      });
      if (get().draftText.trim() === normalized) get().setDraft('');
      await get().refresh();
      return true;
    } catch (error) {
      set({ dispatchError: messageFromError(error) });
      return false;
    } finally {
      set({ submitting: false });
    }
  },

  selectConversation: async (conversationId) => {
    if (!conversationId || get().snapshot?.selectedConversationId === conversationId) return;
    try {
      const snapshot = await hostApi.morpheus.assistantSelectConversation({ conversationId });
      applySnapshot(snapshot);
    } catch (error) {
      set({ dispatchError: messageFromError(error) });
    }
  },

  restoreHistory: async (conversationId) => {
    const snapshot = get().snapshot;
    if (snapshot?.selectedConversationId !== conversationId
      || snapshot.pendingTurns.some((turn) => turn.conversationId === conversationId)) return;
    const hasHistory = snapshot.turns.some((turn) => turn.conversationId === conversationId
      && turn.status !== 'admitted') || useChatStore.getState().sessions.some((session) =>
      session.key === conversationId && !session.createdLocally);
    if (!hasHistory) return;
    const previousError = get().dispatchError;
    try {
      // Replay the original owner. No prompt, second history or empty-session creation.
      await loadSelectedAcpSession(conversationId, false);
      if (get().snapshot?.selectedConversationId === conversationId && get().dispatchError === previousError) {
        set({ dispatchError: null });
      }
    } catch (error) {
      if (get().snapshot?.selectedConversationId === conversationId) {
        set({ dispatchError: messageFromError(error) });
      }
    }
  },

  retryPending: () => {
    set({ blockedTurnId: null, dispatchError: null });
    void drainPendingTurns();
  },
}));
