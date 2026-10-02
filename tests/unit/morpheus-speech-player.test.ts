import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  synthesizeSpeech: vi.fn(),
  setVoiceSpeaking: vi.fn(),
  cancelSpeech: vi.fn(),
  meterPlayback: vi.fn(),
  stopMeter: vi.fn(),
  createStream: vi.fn(),
}));

vi.mock('@/lib/host-api', () => ({
  hostApi: { morpheus: mocks },
}));
vi.mock('@/lib/morpheus-audio-level', () => ({
  meterMorpheusPlayback: mocks.meterPlayback,
}));
vi.mock('@/lib/morpheus-speech-stream', () => ({
  createMorpheusSpeechStream: mocks.createStream,
}));

import { playMorpheusSpeech, stopMorpheusSpeech } from '@/lib/morpheus-speech-player';

class FakeAudio {
  static latest: FakeAudio;
  onplay: (() => void) | null = null;
  onplaying: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn();
  constructor() { FakeAudio.latest = this; }

  play(): Promise<void> {
    this.onplay?.();
    this.onplaying?.();
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
  mocks.meterPlayback.mockReturnValue(mocks.stopMeter);
  mocks.createStream.mockReturnValue({ url: 'blob:morpheus-stream', finish: vi.fn(), dispose: vi.fn() });
  mocks.synthesizeSpeech.mockResolvedValue({
    audioBase64: window.btoa('mp3-bytes'), mimeType: 'audio/mpeg',
    providerAccountId: 'openai', modelId: 'gpt-4o-mini-tts', voice: 'onyx', providerLatencyMs: 20,
  });
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:morpheus-speech');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});
afterEach(() => { stopMorpheusSpeech(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Morpheus speech player', () => {
  it('plays local WAV through real playback callbacks without starting an MPEG stream', async () => {
    vi.stubGlobal('MediaSource', { isTypeSupported: () => true });
    mocks.synthesizeSpeech.mockResolvedValueOnce({ audioBase64: window.btoa('wav-bytes'), mimeType: 'audio/wav', providerAccountId: 'included-local', modelId: 'kokoro-int8', voice: 'cedar', providerLatencyMs: 20 });
    await expect(playMorpheusSpeech('Hello.', { neuralAvailable: true, format: 'wav' })).resolves.toBe('neural');
    expect(mocks.createStream).not.toHaveBeenCalled(); expect(mocks.meterPlayback).toHaveBeenCalledOnce();
    expect(mocks.setVoiceSpeaking).toHaveBeenCalledWith({ speaking: true }); expect(mocks.setVoiceSpeaking).toHaveBeenCalledWith({ speaking: false });
  });
  it('does not silently substitute Windows narration when included neural speech fails', async () => {
    mocks.synthesizeSpeech.mockRejectedValueOnce(new Error('Voice engine failed'));
    await expect(playMorpheusSpeech('Hello.', { neuralAvailable: true, format: 'wav' })).rejects.toThrow('Natural speech is unavailable');
  });
  it('an aborted social utterance cannot cancel a newer task response', async () => {
    const controller = new AbortController();
    mocks.synthesizeSpeech.mockReturnValueOnce(new Promise(() => {}));
    const social = playMorpheusSpeech('How is your day?', { neuralAvailable: true, signal: controller.signal });
    const response = playMorpheusSpeech('Your work is ready.', { neuralAvailable: true });
    controller.abort();
    await expect(social).resolves.toBe('cancelled');
    await expect(response).resolves.toBe('neural');
    const calls = mocks.synthesizeSpeech.mock.calls.length;
    await expect(playMorpheusSpeech('Stale', { neuralAvailable: true, signal: controller.signal })).resolves.toBe('cancelled');
    expect(mocks.synthesizeSpeech).toHaveBeenCalledTimes(calls);
  });

  it('aborting the owned utterance settles a pending provider request', async () => {
    const controller = new AbortController();
    mocks.synthesizeSpeech.mockReturnValueOnce(new Promise(() => {}));
    const social = playMorpheusSpeech('How is your day?', { neuralAvailable: true, signal: controller.signal });
    controller.abort();
    await expect(social).resolves.toBe('cancelled');
    expect(mocks.cancelSpeech).toHaveBeenCalledTimes(2);
  });
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
    expect(mocks.meterPlayback).not.toHaveBeenCalled();
    FakeAudio.latest.onplaying?.();
    expect(mocks.meterPlayback).toHaveBeenCalledWith(FakeAudio.latest);
    stopMorpheusSpeech();
    await expect(pending).resolves.toBe('cancelled');
    expect(state).toHaveBeenLastCalledWith(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
    expect(mocks.stopMeter).toHaveBeenCalledOnce();
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
    expect(mocks.meterPlayback).toHaveBeenCalledOnce();
    expect(mocks.stopMeter).toHaveBeenCalledOnce();
  });

  it('meters streaming speech from actual playback and releases its meter', async () => {
    vi.stubGlobal('MediaSource', { isTypeSupported: vi.fn(() => true) });
    await expect(playMorpheusSpeech('Streamed response.', { neuralAvailable: true })).resolves.toBe('neural');
    expect(mocks.createStream).toHaveBeenCalledOnce();
    expect(mocks.meterPlayback).toHaveBeenCalledWith(FakeAudio.latest);
    expect(mocks.stopMeter).toHaveBeenCalledOnce();
    expect(mocks.createStream.mock.results[0].value.dispose).toHaveBeenCalledOnce();
  });

  it('clears streaming playback level when audio ends before the provider settles', async () => {
    vi.stubGlobal('MediaSource', { isTypeSupported: vi.fn(() => true) });
    let deliver!: (value: unknown) => void;
    mocks.synthesizeSpeech.mockReturnValueOnce(new Promise((resolve) => { deliver = resolve; }));
    const pending = playMorpheusSpeech('Short stream.', { neuralAvailable: true });
    await vi.waitFor(() => expect(mocks.stopMeter).toHaveBeenCalledOnce());
    expect(mocks.setVoiceSpeaking).toHaveBeenLastCalledWith({ speaking: false });
    deliver({ audioBase64: window.btoa('tail'), mimeType: 'audio/mpeg' });
    await expect(pending).resolves.toBe('neural');
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

  it('cancels provider generation when audio playback fails before falling back', async () => {
    vi.spyOn(FakeAudio.prototype, 'play').mockRejectedValueOnce(new Error('Decoder failed'));
    const speak = vi.fn((utterance: FakeUtterance) => utterance.onend?.(new Event('end')));
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel: vi.fn(), speak } });
    await expect(playMorpheusSpeech('Short response.', { neuralAvailable: true })).resolves.toBe('windows');
    // One cancellation clears previous playback, the second aborts the failed request.
    expect(mocks.cancelSpeech).toHaveBeenCalledTimes(2);
    expect(speak).toHaveBeenCalledOnce();
  });

  it('keeps first-run natural voice previews silent instead of switching to robotic speech', async () => {
    mocks.synthesizeSpeech.mockRejectedValueOnce(new Error('Provider offline'));
    const speak = vi.fn();
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel: vi.fn(), speak } });
    await expect(playMorpheusSpeech('Welcome.', { neuralAvailable: true, allowWindowsFallback: false })).rejects.toThrow(/Natural speech/);
    expect(speak).not.toHaveBeenCalled();
  });
});
