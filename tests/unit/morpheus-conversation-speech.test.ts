import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyAcpTimeline } from '@/lib/acp/reducer';
import { createMorpheusConversationSpeechOwner, selectMorpheusConversationSpeech,
  type MorpheusConversationSpeechInput } from '@/lib/morpheus-conversation-speech';

function input(): MorpheusConversationSpeechInput {
  const turn = { conversationId: 'chat', turnId: 'voice-turn', clientRequestId: 'request', source: 'voice' as const,
    status: 'dispatched' as const, generation: 1, admittedAt: '2026-10-03T00:00:00Z' };
  const timeline = createEmptyAcpTimeline('chat', 7);
  timeline.itemOrder = ['old:0', 'voice-turn:0', 'thought', 'answer:0'];
  timeline.itemsById = {
    'old:0': { kind: 'message-segment', id: 'old:0', messageId: 'old', role: 'assistant', segmentIndex: 0, parts: [{ kind: 'markdown', text: 'Old reply must stay silent.' }] },
    'voice-turn:0': { kind: 'message-segment', id: 'voice-turn:0', messageId: 'voice-turn', role: 'user', segmentIndex: 0, parts: [{ kind: 'markdown', text: 'How are you?' }] },
    thought: { kind: 'thought', id: 'thought', messageId: 'reasoning', parts: [{ kind: 'markdown', text: 'Private reasoning must not speak.' }] },
    'answer:0': { kind: 'message-segment', id: 'answer:0', messageId: 'answer', role: 'assistant', segmentIndex: 0, parts: [{ kind: 'markdown', text: 'I’m here and ready to help.' }] },
  };
  return { reply: { turn, voiceGeneration: 4, surface: 'compact' }, snapshot: { schemaVersion: 1, sequence: 2, selectedConversationId: 'chat', conversationId: 'chat',
    draft: { conversationId: 'chat', revision: 0, text: '' }, turns: [turn], pendingTurns: [] },
  activeSessionKey: 'chat', generation: 7, loading: false, sending: false, cancelling: false, error: null,
  timeline, timings: { 'voice-turn': { source: 'live', status: 'complete', durationMs: 100 } }, enabled: true, speakResponses: true };
}

describe('original live voice conversation speech', () => {
  let state: MorpheusConversationSpeechInput;
  const play = vi.fn<(text: string, signal: AbortSignal) => Promise<'neural' | 'cancelled'>>();
  const followUp = vi.fn(async () => undefined);
  const failure = vi.fn();
  const clear = vi.fn();
  beforeEach(() => { state = input(); vi.clearAllMocks(); play.mockResolvedValue('neural'); });
  function owner() {
    return createMorpheusConversationSpeechOwner({ read: () => state, play,
      clear: (id) => { clear(id); if (state.reply?.turn.turnId === id) state.reply = null; },
      claim: (id) => { if (state.reply?.turn.turnId !== id || state.reply.speechClaimed) return false; state.reply = { ...state.reply, speechClaimed: true }; return true; },
      continueAfterResponse: followUp, onFailure: failure });
  }
  it('speaks the correlated assistant reply once and follows up only after real playback ends', async () => {
    let finish!: (result: 'neural') => void;
    play.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const runtime = owner(); runtime.sync(); await Promise.resolve();
    expect(play).toHaveBeenCalledExactlyOnceWith('I’m here and ready to help.', expect.any(AbortSignal));
    expect(followUp).not.toHaveBeenCalled();
    runtime.sync(); state.snapshot!.sequence += 1; runtime.sync();
    finish('neural'); await Promise.resolve();
    expect(followUp).toHaveBeenCalledOnce(); expect(play).toHaveBeenCalledOnce(); runtime.dispose();
  });
  it('speaks a live typed orb admission exactly once without opening voice follow-up', async () => {
    state.reply!.turn = { ...state.reply!.turn, source: 'compact' };
    state.snapshot!.turns[0] = state.reply!.turn;
    const runtime = owner(); runtime.sync(); await Promise.resolve(); await Promise.resolve();
    expect(play).toHaveBeenCalledOnce(); expect(followUp).not.toHaveBeenCalled();
    runtime.sync(); expect(play).toHaveBeenCalledOnce(); runtime.dispose();
  });
  it('speaks a new typed orb reply while the microphone is muted without acquiring input', async () => {
    state.reply!.turn = { ...state.reply!.turn, source: 'compact' };
    state.snapshot!.turns[0] = state.reply!.turn; state.enabled = false;
    const runtime = owner(); runtime.sync(); await Promise.resolve(); await Promise.resolve();
    expect(play).toHaveBeenCalledExactlyOnceWith('I’m here and ready to help.', expect.any(AbortSignal));
    expect(followUp).not.toHaveBeenCalled(); runtime.dispose();
  });
  it('consumes a quiet expanded reply without replaying it after settings change', async () => {
    state.reply!.turn = { ...state.reply!.turn, source: 'full' };
    state.reply!.surface = 'full'; state.snapshot!.turns[0] = state.reply!.turn; state.speakResponses = false;
    const runtime = owner(); runtime.sync(); await Promise.resolve();
    expect(play).not.toHaveBeenCalled(); expect(followUp).not.toHaveBeenCalled();
    state.speakResponses = true; runtime.sync(); await Promise.resolve();
    expect(play).not.toHaveBeenCalled(); runtime.dispose();
  });
  it('never speaks a fresh reload, onboarding or historical timing', async () => {
    state.reply!.turn = { ...state.reply!.turn, source: 'onboarding' };
    owner().sync(); await Promise.resolve(); expect(play).not.toHaveBeenCalled();
    state = input(); state.reply = null; owner().sync(); await Promise.resolve(); expect(play).not.toHaveBeenCalled();
    state = input(); state.timings = { 'voice-turn': { source: 'transcript', status: 'complete', durationMs: 100 } };
    owner().sync(); await Promise.resolve(); expect(play).not.toHaveBeenCalled();
  });
  it('waits for completion and does not synthesize token fragments', async () => {
    state.sending = true; state.timings = { 'voice-turn': { source: 'live', status: 'running', startedAtMs: 10 } };
    const runtime = owner(); runtime.sync(); await Promise.resolve(); expect(play).not.toHaveBeenCalled();
    state.sending = false; state.timings = input().timings; runtime.sync(); await Promise.resolve(); expect(play).toHaveBeenCalledOnce(); runtime.dispose();
  });
  it.each(['cancel', 'mute', 'session', 'generation', 'new-turn'] as const)('aborts its owned reply on %s and does not reopen the microphone', async (reason) => {
    let finish!: (result: 'neural') => void;
    play.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const runtime = owner(); runtime.sync(); await Promise.resolve();
    const signal = play.mock.calls[0][1] as AbortSignal;
    if (reason === 'cancel') state.cancelling = true;
    if (reason === 'mute') state.enabled = false;
    if (reason === 'session') state.snapshot!.selectedConversationId = 'other';
    if (reason === 'generation') state.generation += 1;
    if (reason === 'new-turn') state.snapshot!.turns.push({ ...state.reply!.turn, turnId: 'typed', source: 'full' });
    runtime.sync(); expect(signal.aborted).toBe(true); expect(clear).toHaveBeenCalledWith('voice-turn');
    finish('neural'); await Promise.resolve(); expect(followUp).not.toHaveBeenCalled(); runtime.dispose();
  });
  it('rejects stale Main admission generations and failed delivery', () => {
    state.snapshot!.turns[0] = { ...state.reply!.turn, generation: 2, status: 'cancelled' };
    expect(selectMorpheusConversationSpeech(state).kind).toBe('invalid');
    state = input(); state.error = 'Delivery failed'; expect(selectMorpheusConversationSpeech(state).kind).toBe('invalid');
  });
  it('keeps playing through canonical timing/metadata supplementation without replaying history', async () => {
    play.mockReturnValue(new Promise(() => undefined)); const runtime = owner(); runtime.sync(); await Promise.resolve();
    const signal = play.mock.calls[0][1] as AbortSignal;
    state.timings = { 'voice-turn': { source: 'transcript', status: 'complete', durationMs: 100 } };
    runtime.sync(); expect(signal.aborted).toBe(false); expect(play).toHaveBeenCalledOnce(); runtime.dispose();
  });
  it('does not replay an already claimed reply after a real UI remount', async () => {
    const first = owner(); first.sync(); await Promise.resolve(); first.dispose();
    const next = owner(); next.sync(); await Promise.resolve(); expect(play).toHaveBeenCalledOnce(); next.dispose();
  });
  it('does not consume a reply in a discarded StrictMode setup', async () => {
    const discarded = owner(); discarded.sync(); discarded.dispose();
    const live = owner(); live.sync(); await Promise.resolve(); expect(play).toHaveBeenCalledOnce(); live.dispose();
  });
  it('reports failed speech without starting another recording, while the answer remains intact', async () => {
    play.mockRejectedValue(new Error('Natural speech is unavailable')); const runtime = owner(); runtime.sync();
    await vi.waitFor(() => expect(failure).toHaveBeenCalledOnce());
    expect(followUp).not.toHaveBeenCalled(); expect(state.timeline.itemsById['answer:0']).toEqual(input().timeline.itemsById['answer:0']); runtime.dispose();
  });
  it('reads neither code, URLs nor tool/compatibility/error content aloud', () => {
    const item = state.timeline.itemsById['answer:0'];
    if (item.kind !== 'message-segment') throw new Error('fixture');
    item.parts = [{ kind: 'markdown', text: '**Hello.** Read [the report](https://example.com). ```ts\nsecret()\n``` https://example.com/path' }, { kind: 'error', message: 'Diagnostic' }];
    expect(selectMorpheusConversationSpeech(state)).toMatchObject({ kind: 'ready', text: 'Hello. Read the report.' });
    item.compat = { source: 'image-generation', evidenceId: 'image' }; expect(selectMorpheusConversationSpeech(state).kind).toBe('wait');
  });
  it('waits when invocation completion precedes the actual answer IPC', async () => {
    const answer = state.timeline.itemsById['answer:0']; delete state.timeline.itemsById['answer:0'];
    const runtime = owner(); runtime.sync(); await Promise.resolve(); expect(play).not.toHaveBeenCalled(); expect(clear).not.toHaveBeenCalled();
    state.timeline.itemsById['answer:0'] = answer; runtime.sync(); await Promise.resolve(); expect(play).toHaveBeenCalledOnce(); runtime.dispose();
  });
  it('joins fragments within the same assistant message without inventing spaces', () => {
    const item = state.timeline.itemsById['answer:0'];
    if (item.kind !== 'message-segment') throw new Error('fixture');
    item.parts = [{ kind: 'markdown', text: 'Hel' }, { kind: 'markdown', text: 'lo there.' }];
    expect(selectMorpheusConversationSpeech(state)).toMatchObject({ kind: 'ready', text: 'Hello there.' });
  });
});
