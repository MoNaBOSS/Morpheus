import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MorpheusAssistantSnapshot } from '@shared/morpheus/assistant-session-types';

const mocks = vi.hoisted(() => ({
  workspace: vi.fn(), load: vi.fn(), send: vi.fn(), snapshot: vi.fn(), ack: vi.fn(), admit: vi.fn(),
  sessions: [] as Array<{ key: string; createdLocally?: boolean }>,
}));
vi.mock('@/lib/host-api', () => ({ hostApi: { files: { resolveWorkspaceContext: mocks.workspace }, morpheus: { assistantSnapshot: mocks.snapshot, ackAssistantTurn: mocks.ack, admitAssistantTurn: mocks.admit } } }));
vi.mock('@/lib/host-events', () => ({ hostEvents: {} }));
vi.mock('@/lib/workspace-context', () => ({ resolveEffectiveWorkspace: () => ({ cwd: '/fixture' }) }));
vi.mock('@/i18n', () => ({ default: { t: (key: string) => key } }));
vi.mock('@/stores/chat', () => ({ useChatStore: { getState: () => ({ sessions: mocks.sessions }) } }));
vi.mock('@/stores/settings', () => ({ useSettingsStore: { getState: () => ({ chatWorkspacePath: '/fixture' }) } }));
vi.mock('@/stores/acp-chat-session', () => ({
  ensureAcpChatSubscriptions: vi.fn(),
  useAcpChatSessionStore: { getState: () => ({ activeSessionKey: null, loading: false,
    loadSession: mocks.load, sendPrompt: mocks.send }) },
}));

import { useMorpheusConversationStore as store } from '@/stores/morpheus-conversation';

function snapshot(id = 'agent:main:main'): MorpheusAssistantSnapshot {
  return { schemaVersion: 1, sequence: 1, selectedConversationId: id, conversationId: id,
    draft: { conversationId: id, revision: 0, text: '' }, turns: [], pendingTurns: [] };
}

describe('Morpheus original-history recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });
});
