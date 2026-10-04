import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MorpheusObjectiveRun } from '@shared/morpheus/core/objective-types';
import type { MorpheusReplySpeechOrigin, MorpheusReplySpeechMode } from '@shared/morpheus/voice-types';

const mocks = vi.hoisted(() => ({
  run: { v: 1, objectiveRunId: 'voice-one', objective: 'A bounded voice task', origin: { type: 'voice', commandText: 'A bounded voice task' }, state: 'complete', createdAt: '1', updatedAt: '1', iteration: 1, corrections: [], planIds: [], observations: [], artifacts: [], summary: 'Your result is ready.' } as MorpheusObjectiveRun,
  play: vi.fn(async (_text: string, _options: { signal: AbortSignal }) => 'neural'), stop: vi.fn(), load: vi.fn(),
  followUp: vi.fn(async () => undefined),
  scope: vi.fn(async () => undefined),
  status: { neuralSpeechAvailable: true, settings: { enabled: true, speakResponses: true, replySpeechMode: 'orb' as MorpheusReplySpeechMode } },
  origin: { surface: 'compact', input: 'voice' } as MorpheusReplySpeechOrigin,
  live: true, claimed: new Set<string>(),
  language: 'en',
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, values?: { target?: string }) => key === 'morpheus.actionOutcome.openedWebsite' ? `${mocks.language}: ${values?.target}` : key }) }));
// Appearance is a separate settings owner; playback tests keep its boundary
// fixed without initializing the application i18n/settings side effects.
vi.mock('@/stores/settings', () => ({ useSettingsStore: (select: (state: { morpheusAppearance: 'green' }) => unknown) => select({ morpheusAppearance: 'green' }) }));
vi.mock('@/lib/morpheus-speech-player', () => ({ playMorpheusSpeech: mocks.play, stopMorpheusSpeech: mocks.stop }));
vi.mock('@/lib/host-events', () => ({ hostEvents: { onMorpheusVoiceCommand: () => () => undefined } }));
vi.mock('@/stores/morpheus-command', () => {
  const getState = () => ({ objectiveRun: mocks.run, objectiveSpeech: mocks.live
    ? { objectiveRunId: mocks.run.objectiveRunId, origin: mocks.origin, claimedStates: [...mocks.claimed] } : null,
    claimObjectiveSpeech: (_id: string, key: string) => {
      if (!mocks.live || mocks.claimed.has(key)) return false;
      mocks.claimed.add(key); return true;
    } });
  return { useMorpheusCommandStore: Object.assign((select: (s: unknown) => unknown) => select(getState()), { getState }) };
});
vi.mock('@/stores/morpheus-quick-command', () => ({ useMorpheusQuickCommandStore: (select: (s: unknown) => unknown) => select({ show: mocks.load }) }));
vi.mock('@/stores/morpheus-voice', () => {
  const getState = () => ({ phase: 'idle', source: 'quick-command', replyTurn: null, status: mocks.status, loadStatus: mocks.load, startListening: mocks.load, continueAfterResponse: mocks.followUp, setAmbientScope: mocks.scope });
  return { useMorpheusVoiceStore: Object.assign((select: (s: unknown) => unknown) => select(getState()), { getState, subscribe: () => () => undefined }) };
});
vi.mock('@/stores/morpheus-conversation', () => ({ useMorpheusConversationStore: { getState: () => ({ snapshot: null }), subscribe: () => () => undefined } }));
vi.mock('@/stores/acp-chat-session', () => ({ useAcpChatSessionStore: { getState: () => ({}), subscribe: () => () => undefined } }));

import { MorpheusVoiceRuntime } from '@/components/morpheus/MorpheusVoiceRuntime';

afterEach(() => { vi.clearAllMocks(); delete document.documentElement.dataset.morpheusWindowVisible; });
beforeEach(() => { mocks.claimed.clear(); mocks.live = true; mocks.origin = { surface: 'compact', input: 'voice' }; mocks.status.settings.enabled = true; mocks.status.settings.speakResponses = true; mocks.status.settings.replySpeechMode = 'orb'; });

describe('voice playback ownership', () => {
  it('keeps historical objectives silent and speaks only an exact live typed orb target', async () => {
    mocks.live = false;
    const view = render(<MorpheusVoiceRuntime />);
    await Promise.resolve(); expect(mocks.play).not.toHaveBeenCalled();
    mocks.live = true; mocks.origin = { surface: 'compact', input: 'typed' };
    view.rerender(<MorpheusVoiceRuntime />);
    await waitFor(() => expect(mocks.play).toHaveBeenCalledOnce());
    expect(mocks.followUp).not.toHaveBeenCalled(); view.unmount();
  });
  it('speaks a new typed orb objective with microphone mute still selected', async () => {
    mocks.status.settings.enabled = false; mocks.origin = { surface: 'compact', input: 'typed' };
    const view = render(<MorpheusVoiceRuntime />);
    await waitFor(() => expect(mocks.play).toHaveBeenCalledOnce());
    expect(mocks.followUp).not.toHaveBeenCalled();
    expect(mocks.status.settings.enabled).toBe(false); view.unmount();
  });
  it('consumes an expanded voice result quietly and never replays it after enabling speech', async () => {
    mocks.origin = { surface: 'full', input: 'voice' };
    const view = render(<MorpheusVoiceRuntime />);
    await waitFor(() => expect(mocks.followUp).toHaveBeenCalledOnce());
    expect(mocks.play).not.toHaveBeenCalled();
    mocks.status.settings.replySpeechMode = 'all'; view.rerender(<MorpheusVoiceRuntime />);
    await Promise.resolve(); expect(mocks.play).not.toHaveBeenCalled(); view.unmount();
  });
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
    await waitFor(() => expect(mocks.play).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.followUp).toHaveBeenCalledOnce());
    mocks.run = { ...mocks.run, updatedAt: '2' };
    view.rerender(<MorpheusVoiceRuntime />);
    expect(mocks.play).toHaveBeenCalledTimes(1);
    expect(mocks.stop).not.toHaveBeenCalled();
    view.unmount();
    expect(mocks.play.mock.calls[0][1].signal.aborted).toBe(true);
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
    await waitFor(() => expect(mocks.play).toHaveBeenCalledExactlyOnceWith('en: YouTube', expect.any(Object)));
    mocks.language = 'ja';
    view.rerender(<MorpheusVoiceRuntime />);
    expect(mocks.play).toHaveBeenCalledTimes(1);
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(mocks.followUp).not.toHaveBeenCalled();
    finish('neural');
    await waitFor(() => expect(mocks.followUp).toHaveBeenCalledOnce());
    view.unmount();
    expect(mocks.play.mock.calls[0][1].signal.aborted).toBe(true);
    mocks.language = 'en'; mocks.run = previousRun;
  });
});
