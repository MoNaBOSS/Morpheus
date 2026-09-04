import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  run: { objectiveRunId: 'voice-one', origin: { type: 'voice' }, state: 'complete', updatedAt: '1', summary: 'Your result is ready.' },
  play: vi.fn(async () => 'neural'), stop: vi.fn(), load: vi.fn(),
  status: { neuralSpeechAvailable: true, settings: { speakResponses: true } },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/morpheus-speech-player', () => ({ playMorpheusSpeech: mocks.play, stopMorpheusSpeech: mocks.stop }));
vi.mock('@/lib/host-events', () => ({ hostEvents: { onMorpheusVoiceCommand: () => () => undefined } }));
vi.mock('@/stores/morpheus-command', () => ({ useMorpheusCommandStore: (select: (s: unknown) => unknown) => select({ objectiveRun: mocks.run }) }));
vi.mock('@/stores/morpheus-quick-command', () => ({ useMorpheusQuickCommandStore: (select: (s: unknown) => unknown) => select({ show: mocks.load }) }));
vi.mock('@/stores/morpheus-voice', () => ({ useMorpheusVoiceStore: (select: (s: unknown) => unknown) => select({ phase: 'idle', status: mocks.status, loadStatus: mocks.load, startListening: mocks.load }) }));

import { MorpheusVoiceRuntime } from '@/components/morpheus/MorpheusVoiceRuntime';

describe('voice playback ownership', () => {
  it('does not synthesize again or cancel playback on a metadata-only update', () => {
    const view = render(<MorpheusVoiceRuntime />);
    expect(mocks.play).toHaveBeenCalledTimes(1);
    mocks.run = { ...mocks.run, updatedAt: '2' };
    view.rerender(<MorpheusVoiceRuntime />);
    expect(mocks.play).toHaveBeenCalledTimes(1);
    expect(mocks.stop).not.toHaveBeenCalled();
    view.unmount();
    expect(mocks.stop).toHaveBeenCalledOnce();
  });
});
