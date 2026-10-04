import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MorpheusObjectiveRun } from '@shared/morpheus/core/objective-types';

const mocks = vi.hoisted(() => ({
  run: { v: 1, objectiveRunId: 'voice-one', objective: 'A bounded voice task', origin: { type: 'voice', commandText: 'A bounded voice task' }, state: 'complete', createdAt: '1', updatedAt: '1', iteration: 1, corrections: [], planIds: [], observations: [], artifacts: [], summary: 'Your result is ready.' } as MorpheusObjectiveRun,
  play: vi.fn(async () => 'neural'), stop: vi.fn(), load: vi.fn(),
  followUp: vi.fn(async () => undefined),
  scope: vi.fn(async () => undefined),
  status: { neuralSpeechAvailable: true, settings: { speakResponses: true } },
  language: 'en',
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, values?: { target?: string }) => key === 'morpheus.actionOutcome.openedWebsite' ? `${mocks.language}: ${values?.target}` : key }) }));
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
  it('does not replay a completed task when its displayed language changes', async () => {
    const previousRun = mocks.run;
    mocks.run = { ...previousRun, summary: 'Done. Your result is ready.',
      observations: [{ iteration: 1, planId: 'plan-one', status: 'completed', observedAt: '1', steps: [{ stepId: 'step-one', capabilityId: 'web.openUrl', status: 'succeeded', artifactIds: ['artifact-one'] }] }],
      artifacts: [{ kind: 'report', artifactId: 'artifact-one', createdAt: '1', data: { origin: 'https://www.youtube.com' } }],
    };
    const view = render(<MorpheusVoiceRuntime />);
    await waitFor(() => expect(mocks.followUp).toHaveBeenCalledOnce());
    expect(mocks.play).toHaveBeenCalledExactlyOnceWith('en: YouTube', expect.any(Object));
    mocks.language = 'ja';
    view.rerender(<MorpheusVoiceRuntime />);
    expect(mocks.play).toHaveBeenCalledTimes(1);
    view.unmount();
    mocks.language = 'en'; mocks.run = previousRun;
  });
  it('keeps ongoing PCM playback alive across a display-language change', async () => {
    const previousRun = mocks.run;
    mocks.run = { ...previousRun, summary: 'Done. Your result is ready.',
      observations: [{ iteration: 1, planId: 'plan-one', status: 'completed', observedAt: '1', steps: [{ stepId: 'step-one', capabilityId: 'web.openUrl', status: 'succeeded', artifactIds: ['artifact-one'] }] }],
      artifacts: [{ kind: 'report', artifactId: 'artifact-one', createdAt: '1', data: { origin: 'https://www.youtube.com' } }],
    };
    let finish!: (value: 'neural') => void;
    mocks.play.mockImplementationOnce(() => new Promise<'neural'>((resolve) => { finish = resolve; }));
    const view = render(<MorpheusVoiceRuntime />);
    expect(mocks.play).toHaveBeenCalledExactlyOnceWith('en: YouTube', expect.any(Object));
    mocks.language = 'ja';
    view.rerender(<MorpheusVoiceRuntime />);
    expect(mocks.play).toHaveBeenCalledTimes(1);
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(mocks.followUp).not.toHaveBeenCalled();
    finish('neural');
    await waitFor(() => expect(mocks.followUp).toHaveBeenCalledOnce());
    view.unmount();
    expect(mocks.stop).toHaveBeenCalledOnce();
    mocks.language = 'en'; mocks.run = previousRun;
  });
});
