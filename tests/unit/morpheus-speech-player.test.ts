import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  synthesizeSpeech: vi.fn(),
  setVoiceSpeaking: vi.fn(),
  cancelSpeech: vi.fn(),
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
afterEach(() => { stopMorpheusSpeech(); vi.restoreAllMocks(); });

describe('Morpheus speech player', () => {
  it('settles immediately on stop and ignores late provider audio', async () => {
    let deliver!: (value: unknown) => void;
    mocks.synthesizeSpeech.mockReturnValue(new Promise((resolve) => { deliver = resolve; }));
    const pending = playMorpheusSpeech('Delayed greeting', { neuralAvailable: true });
    stopMorpheusSpeech();
    await expect(pending).resolves.toBe('cancelled');
    deliver({ audioBase64: window.btoa('late'), mimeType: 'audio/mpeg' });
    await Promise.resolve();
    await Promise.resolve();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(mocks.setVoiceSpeaking).not.toHaveBeenCalledWith({ speaking: true });
  });

  it('never falls back to Windows after a cancelled provider request fails', async () => {
    let fail!: (error: Error) => void;
    mocks.synthesizeSpeech.mockReturnValue(new Promise((_, reject) => { fail = reject; }));
    const speak = vi.fn();
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel: vi.fn(), speak } });
    const pending = playMorpheusSpeech('Old response', { neuralAvailable: true });
    stopMorpheusSpeech();
    fail(new Error('Late failure'));
    await expect(pending).resolves.toBe('cancelled');
    await Promise.resolve();
    expect(speak).not.toHaveBeenCalled();
  });

  it('settles stopped playback and clears the original speaking callback', async () => {
    vi.spyOn(FakeAudio.prototype, 'play').mockImplementation(function (this: FakeAudio) {
      this.onplay?.();
      return Promise.resolve();
    });
    const state = vi.fn();
    const pending = playMorpheusSpeech('Long response', { neuralAvailable: true, onSpeakingChange: state });
    await vi.waitFor(() => expect(state).toHaveBeenCalledWith(true));
    stopMorpheusSpeech();
    await expect(pending).resolves.toBe('cancelled');
    expect(state).toHaveBeenLastCalledWith(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });

  it('a newer greeting supersedes a pending older greeting', async () => {
    let deliver!: (value: unknown) => void;
    mocks.synthesizeSpeech.mockReturnValueOnce(new Promise((resolve) => { deliver = resolve; }));
    const old = playMorpheusSpeech('Old', { neuralAvailable: true });
    const latest = playMorpheusSpeech('New', { neuralAvailable: true });
    await expect(old).resolves.toBe('cancelled');
    await expect(latest).resolves.toBe('neural');
    deliver({ audioBase64: window.btoa('old'), mimeType: 'audio/mpeg' });
    await Promise.resolve();
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
  });
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
