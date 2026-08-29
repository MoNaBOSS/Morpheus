import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  synthesizeSpeech: vi.fn(),
  setVoiceSpeaking: vi.fn(),
}));

vi.mock('@/lib/host-api', () => ({
  hostApi: { morpheus: mocks },
}));

import { playMorpheusSpeech, stopMorpheusSpeech } from '@/lib/morpheus-speech-player';

class FakeAudio {
  onplay: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn();

  play(): Promise<void> {
    this.onplay?.();
    queueMicrotask(() => this.onended?.());
    return Promise.resolve();
  }
}

class FakeUtterance {
  onstart: ((event: Event) => void) | null = null;
  onend: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(readonly text: string) {}
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.synthesizeSpeech.mockResolvedValue({
    audioBase64: window.btoa('mp3-bytes'), mimeType: 'audio/mpeg',
    providerAccountId: 'openai', modelId: 'gpt-4o-mini-tts', voice: 'onyx', providerLatencyMs: 20,
  });
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:morpheus-speech');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});

describe('Morpheus speech player', () => {
  it('plays ephemeral Main-generated audio and releases its object URL', async () => {
    await expect(playMorpheusSpeech('Objective complete.', { neuralAvailable: true })).resolves.toBe('neural');
    expect(mocks.synthesizeSpeech).toHaveBeenCalledWith({ text: 'Objective complete.' });
    expect(mocks.setVoiceSpeaking).toHaveBeenCalledWith({ speaking: true });
    expect(mocks.setVoiceSpeaking).toHaveBeenLastCalledWith({ speaking: false });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:morpheus-speech');
  });

  it('does not request provider speech when neural output is unavailable', async () => {
    const speak = vi.fn((utterance: FakeUtterance) => {
      utterance.onstart?.(new Event('start'));
      utterance.onend?.(new Event('end'));
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { cancel: vi.fn(), speak },
    });

    await expect(playMorpheusSpeech('Fallback response.', { neuralAvailable: false })).resolves.toBe('windows');
    expect(mocks.synthesizeSpeech).not.toHaveBeenCalled();
    expect(speak).toHaveBeenCalledOnce();
  });

  it('can stop active output without retaining provider audio', async () => {
    await playMorpheusSpeech('Short response.', { neuralAvailable: true });
    stopMorpheusSpeech();
    expect(mocks.setVoiceSpeaking).toHaveBeenLastCalledWith({ speaking: false });
  });
});
