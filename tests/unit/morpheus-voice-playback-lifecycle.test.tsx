import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  run: { objectiveRunId: 'voice-one', origin: { type: 'voice' }, state: 'complete', updatedAt: '1', summary: 'Your result is ready.' },
  play: vi.fn(async () => 'neural'), stop: vi.fn(), load: vi.fn(),
  followUp: vi.fn(async () => undefined),
  scope: vi.fn(async () => undefined),
  status: { neuralSpeechAvailable: true, settings: { speakResponses: true } },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/morpheus-speech-player', () => ({ playMorpheusSpeech: mocks.play, stopMorpheusSpeech: mocks.stop }));
vi.mock('@/lib/host-events', () => ({ hostEvents: { onMorpheusVoiceCommand: () => () => undefined } }));
vi.mock('@/stores/morpheus-command', () => ({ useMorpheusCommandStore: (select: (s: unknown) => unknown) => select({ objectiveRun: mocks.run }) }));
vi.mock('@/stores/morpheus-quick-command', () => ({ useMorpheusQuickCommandStore: (select: (s: unknown) => unknown) => select({ show: mocks.load }) }));
vi.mock('@/stores/morpheus-voice', () => {
  const getState = () => ({ phase: 'idle', source: 'quick-command', replyTurn: null, status: mocks.status, loadStatus: mocks.load, startListening: mocks.load, continueAfterResponse: mocks.followUp, setAmbientScope: mocks.scope });
  return { useMorpheusVoiceStore: Object.assign((select: (s: unknown) => unknown) => select(getState()), { getState, subscribe: () => () => undefined }) };
});
vi.mock('@/stores/morpheus-conversation', () => ({ useMorpheusConversationStore: { getState: () => ({ snapshot: null }), subscribe: () => () => undefined } }));
vi.mock('@/stores/acp-chat-session', () => ({ useAcpChatSessionStore: { getState: () => ({}), subscribe: () => () => undefined } }));

import { MorpheusVoiceRuntime } from '@/components/morpheus/MorpheusVoiceRuntime';

afterEach(() => { vi.clearAllMocks(); delete document.documentElement.dataset.morpheusWindowVisible; });

describe('voice playback ownership', () => {
  it('uses native window visibility for audio scope even when a visible window is occluded', async () => {
    const hidden = Object.getOwnPropertyDescriptor(document, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.documentElement.dataset.morpheusWindowVisible = 'true';
    const view = render(<MorpheusVoiceRuntime />);
    expect(mocks.scope).toHaveBeenLastCalledWith('conversation');
    document.documentElement.dataset.morpheusWindowVisible = 'false';
    await waitFor(() => expect(mocks.scope).toHaveBeenLastCalledWith('companion'));
    view.unmount();
    if (hidden) Object.defineProperty(document, 'hidden', hidden);
    else Reflect.deleteProperty(document, 'hidden');
  });
  it('does not synthesize again or cancel playback on a metadata-only update', async () => {
    const view = render(<MorpheusVoiceRuntime />);
    expect(mocks.play).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mocks.followUp).toHaveBeenCalledOnce());
    mocks.run = { ...mocks.run, updatedAt: '2' };
    view.rerender(<MorpheusVoiceRuntime />);
    expect(mocks.play).toHaveBeenCalledTimes(1);
    expect(mocks.stop).not.toHaveBeenCalled();
    view.unmount();
    expect(mocks.stop).toHaveBeenCalledOnce();
  });
});
