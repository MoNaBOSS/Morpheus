import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  run: { objectiveRunId: 'voice-one', origin: { type: 'voice' }, state: 'complete', updatedAt: '1', summary: 'Your result is ready.' },
  play: vi.fn(async () => 'neural'), stop: vi.fn(), load: vi.fn(),
  followUp: vi.fn(async () => undefined),
  status: { neuralSpeechAvailable: true, settings: { speakResponses: true } },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/morpheus-speech-player', () => ({ playMorpheusSpeech: mocks.play, stopMorpheusSpeech: mocks.stop }));
vi.mock('@/lib/host-events', () => ({ hostEvents: { onMorpheusVoiceCommand: () => () => undefined } }));
vi.mock('@/stores/morpheus-command', () => ({ useMorpheusCommandStore: (select: (s: unknown) => unknown) => select({ objectiveRun: mocks.run }) }));
vi.mock('@/stores/morpheus-quick-command', () => ({ useMorpheusQuickCommandStore: (select: (s: unknown) => unknown) => select({ show: mocks.load }) }));
vi.mock('@/stores/morpheus-voice', () => {
  const getState = () => ({ phase: 'idle', source: 'quick-command', replyTurn: null, status: mocks.status, loadStatus: mocks.load, startListening: mocks.load, continueAfterResponse: mocks.followUp });
  return { useMorpheusVoiceStore: Object.assign((select: (s: unknown) => unknown) => select(getState()), { getState, subscribe: () => () => undefined }) };
});
vi.mock('@/stores/morpheus-conversation', () => ({ useMorpheusConversationStore: { getState: () => ({ snapshot: null }), subscribe: () => () => undefined } }));
vi.mock('@/stores/acp-chat-session', () => ({ useAcpChatSessionStore: { getState: () => ({}), subscribe: () => () => undefined } }));

import { MorpheusVoiceRuntime } from '@/components/morpheus/MorpheusVoiceRuntime';

describe('voice playback ownership', () => {
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
