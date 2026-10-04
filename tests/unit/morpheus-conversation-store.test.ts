import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MorpheusAssistantSessionChanged, MorpheusAssistantSnapshot } from '@shared/morpheus/assistant-session-types';

const mocks = vi.hoisted(() => ({
  workspace: vi.fn(), load: vi.fn(), send: vi.fn(), snapshot: vi.fn(), ack: vi.fn(), admit: vi.fn(),
  sessions: [] as Array<{ key: string; createdLocally?: boolean }>,
  replyGeneration: vi.fn(() => 17), registerReply: vi.fn(),
  sessionListener: null as ((event: MorpheusAssistantSessionChanged) => void) | null,
}));
vi.mock('@/lib/host-api', () => ({ hostApi: { files: { resolveWorkspaceContext: mocks.workspace }, morpheus: { assistantSnapshot: mocks.snapshot, ackAssistantTurn: mocks.ack, admitAssistantTurn: mocks.admit } } }));
vi.mock('@/lib/host-events', () => ({ hostEvents: { onMorpheusAssistantSessionChanged: (listener: (event: MorpheusAssistantSessionChanged) => void) => {
  mocks.sessionListener = listener; return () => { mocks.sessionListener = null; };
} } }));
vi.mock('@/lib/workspace-context', () => ({ resolveEffectiveWorkspace: () => ({ cwd: '/fixture' }) }));
vi.mock('@/i18n', () => ({ default: { t: (key: string) => key } }));
vi.mock('@/stores/chat', () => ({ useChatStore: { getState: () => ({ sessions: mocks.sessions, currentSessionKey: 'agent:main:main', switchSession: vi.fn() }), subscribe: () => () => undefined } }));
vi.mock('@/stores/settings', () => ({ useSettingsStore: { getState: () => ({ chatWorkspacePath: '/fixture' }) } }));
vi.mock('@/stores/morpheus-voice', () => ({ useMorpheusVoiceStore: { getState: () => ({ getReplyGeneration: mocks.replyGeneration, registerReplyTurn: mocks.registerReply }) } }));
vi.mock('@/stores/acp-chat-session', () => ({
  ensureAcpChatSubscriptions: vi.fn(),
  useAcpChatSessionStore: { getState: () => ({ activeSessionKey: null, loading: false,
    loadSession: mocks.load, sendPrompt: mocks.send }), subscribe: () => () => undefined },
}));

import { useMorpheusConversationStore as store } from '@/stores/morpheus-conversation';

function snapshot(id = 'agent:main:main'): MorpheusAssistantSnapshot {
  return { schemaVersion: 1, sequence: 1, selectedConversationId: id, conversationId: id,
    draft: { conversationId: id, revision: 0, text: '' }, turns: [], pendingTurns: [] };
}

describe('Morpheus original-history recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.replyGeneration.mockReturnValue(17);
    mocks.sessions = [{ key: 'agent:main:main' }];
    mocks.workspace.mockResolvedValue({ ok: true, workspaceRoot: '/fixture', executionCwd: '/fixture' });
    mocks.load.mockResolvedValue(true);
    store.setState({ snapshot: snapshot(), dispatchError: null, blockedTurnId: null });
  });

  it('loads existing history without creating a session or dispatching another prompt', async () => {
    await store.getState().restoreHistory('agent:main:main');
    expect(mocks.load).toHaveBeenCalledExactlyOnceWith({ sessionKey: 'agent:main:main', workspaceRoot: '/fixture', cwd: '/fixture' });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not load an untouched local placeholder', async () => {
    mocks.sessions = [{ key: 'agent:main:main', createdLocally: true }];
    await store.getState().restoreHistory('agent:main:main');
    expect(mocks.workspace).not.toHaveBeenCalled();
  });

  it('coalesces simultaneous compact/full loads while workspace resolution is pending', async () => {
    let resolve!: (value: unknown) => void;
    mocks.workspace.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const first = store.getState().restoreHistory('agent:main:main');
    const second = store.getState().restoreHistory('agent:main:main');
    resolve({ ok: true, workspaceRoot: '/fixture', executionCwd: '/fixture' });
    await Promise.all([first, second]);
    expect(mocks.workspace).toHaveBeenCalledTimes(1);
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });

  it('leaves pending admissions to the existing delivery owner', async () => {
    const current = snapshot();
    current.pendingTurns.push({ conversationId: current.conversationId, turnId: 'turn', clientRequestId: 'request',
      source: 'compact', status: 'admitted', generation: 1, admittedAt: '2026-10-02T00:00:00Z', text: 'Hello' });
    store.setState({ snapshot: current });
    await store.getState().restoreHistory(current.conversationId);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('allows an explicit retry and clears only the previous failure after recovery', async () => {
    mocks.load.mockRejectedValueOnce(new Error('History temporarily unavailable'));
    await store.getState().restoreHistory('agent:main:main');
    expect(store.getState().dispatchError).toBe('History temporarily unavailable');
    await store.getState().restoreHistory('agent:main:main');
    expect(store.getState().dispatchError).toBeNull();
  });

  it('does not put a stale restore error on another selected conversation', async () => {
    let reject!: (error: Error) => void;
    mocks.workspace.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    const pending = store.getState().restoreHistory('agent:main:main');
    store.setState({ snapshot: snapshot('agent:main:other') });
    reject(new Error('Old failure'));
    await pending;
    expect(store.getState().dispatchError).toBeNull();
  });

  it('exposes the original admission to live voice presentation before dispatch refresh', async () => {
    const turn = { conversationId: 'agent:main:main', turnId: 'voice', source: 'voice', generation: 1 };
    mocks.admit.mockResolvedValue(turn); mocks.snapshot.mockResolvedValue(snapshot());
    const admitted = vi.fn(() => expect(mocks.snapshot).not.toHaveBeenCalled());
    expect(await store.getState().submit('Hello', 'voice', admitted)).toBe(true);
    expect(admitted).toHaveBeenCalledExactlyOnceWith(turn);
  });
  it.each(['compact', 'full', 'orb'] as const)('binds a typed %s reply to its returned admission and original cancellation generation', async (source) => {
    const turn = { conversationId: 'agent:main:main', turnId: 'typed-live', source, generation: 1 };
    let finish!: (turn: unknown) => void;
    mocks.admit.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    mocks.snapshot.mockResolvedValue(snapshot());
    const submission = store.getState().submit('Hello', source);
    expect(mocks.registerReply).not.toHaveBeenCalled();
    mocks.replyGeneration.mockReturnValue(18); finish(turn); await submission;
    expect(mocks.registerReply).toHaveBeenCalledExactlyOnceWith(turn, source === 'full' ? 'full' : 'compact', 17);
  });
  it('binds only the exact new native-orb admission hint once and never a snapshot or duplicate', async () => {
    const turn = { conversationId: 'agent:main:main', turnId: 'native-live', clientRequestId: 'orb:live',
      source: 'orb' as const, status: 'admitted' as const, generation: 1, admittedAt: '2026-10-04T00:00:00Z' };
    mocks.snapshot.mockResolvedValue({ ...snapshot(), turns: [turn] });
    const stop = store.getState().start();
    try {
      await vi.waitFor(() => expect(mocks.snapshot).toHaveBeenCalled());
      expect(mocks.registerReply).not.toHaveBeenCalled();
      const event: MorpheusAssistantSessionChanged = { schemaVersion: 1, sequence: 100_001, type: 'turn-admitted',
        generation: turn.generation, conversationId: turn.conversationId, timestamp: turn.admittedAt, admittedTurn: turn };
      mocks.sessionListener!(event);
      expect(mocks.registerReply).toHaveBeenCalledExactlyOnceWith(turn, 'compact', 17);
      mocks.replyGeneration.mockReturnValue(18); mocks.sessionListener!(event);
      mocks.sessionListener!({ ...event, sequence: 100_002, type: 'turn-updated' });
      mocks.sessionListener!({ ...event, sequence: 100_003, admittedTurn: undefined });
      mocks.sessionListener!({ ...event, sequence: 100_004, conversationId: 'agent:main:other' });
      expect(mocks.registerReply).toHaveBeenCalledOnce();
    } finally { stop(); }
  });

  it('rechecks Main after reload recovery and never dispatches its already-consumed admission', async () => {
    const current = snapshot();
    current.pendingTurns.push({ conversationId: current.conversationId, turnId: 'turn', clientRequestId: 'request',
      source: 'compact', status: 'admitted', generation: 1, admittedAt: '2026-10-02T00:00:00Z', text: 'Hello' });
    store.setState({ snapshot: current });
    // The original Main prompt completed while the new renderer awaited history.
    mocks.snapshot.mockResolvedValue({ ...snapshot(), sequence: 2 });
    store.getState().retryPending();
    await vi.waitFor(() => expect(mocks.snapshot).toHaveBeenCalledTimes(1));
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.ack).not.toHaveBeenCalled();
    expect(store.getState().snapshot?.pendingTurns).toHaveLength(0);
    expect(mocks.registerReply).not.toHaveBeenCalled();
  });
});
