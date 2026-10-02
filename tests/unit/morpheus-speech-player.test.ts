import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  synthesizeSpeech: vi.fn(),
  setVoiceSpeaking: vi.fn(),
  cancelSpeech: vi.fn(),
  meterPlayback: vi.fn(),
  stopMeter: vi.fn(),
  createStream: vi.fn(),
  createPcmPlayback: vi.fn(),
  onSpeechChunk: vi.fn(),
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
vi.mock('@/lib/morpheus-pcm-playback', () => ({ createMorpheusPcmPlayback: mocks.createPcmPlayback }));
vi.mock('@/lib/host-events', () => ({ hostEvents: { onMorpheusSpeechChunk: mocks.onSpeechChunk } }));

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
  mocks.onSpeechChunk.mockReturnValue(vi.fn());
  mocks.createPcmPlayback.mockImplementation(() => {
    let finish!: () => void;
    const completed = new Promise<void>((resolve) => { finish = resolve; });
    return { push: vi.fn(), finish: vi.fn(async () => finish()), dispose: vi.fn(finish), completed };
  });
  mocks.synthesizeSpeech.mockResolvedValue({
    audioBase64: window.btoa('mp3-bytes'), mimeType: 'audio/mpeg',
    providerAccountId: 'openai', modelId: 'gpt-4o-mini-tts', voice: 'onyx', providerLatencyMs: 20,
  });
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:morpheus-speech');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});
afterEach(() => { stopMorpheusSpeech(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function pcmHarness() {
  let respond!: (result: unknown) => void;
  mocks.synthesizeSpeech.mockReturnValueOnce(new Promise((resolve) => { respond = resolve; }));
  const pending = playMorpheusSpeech('The full reply.', { neuralAvailable: true, format: 'pcm24' });
  const streamId = mocks.synthesizeSpeech.mock.calls[0][0].streamId as string;
  const player = mocks.createPcmPlayback.mock.results[0].value;
  const emit = (sequence: number, values = [1, 2]) => mocks.onSpeechChunk.mock.calls[0][0]({
    streamId, sequence, mimeType: 'audio/pcm', audioBase64: window.btoa(String.fromCharCode(...values)),
  });
  const result = (chunkCount = 3, byteLength = 6) => ({
    mimeType: 'audio/pcm', audioBase64: '', providerAccountId: 'included-local',
    pcmStream: { streamId, chunkCount, byteLength },
  });
  return { pending, respond, emit, result, player, streamId };
}
async function flushPcmResponse() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }

describe('sequenced PCM delivery completion', () => {
  it('does not finish when the invoke response arrives between the first and later IPC chunks', async () => {
    const h = pcmHarness();
    h.emit(0); h.respond(h.result()); await flushPcmResponse();
    expect(h.player.finish).not.toHaveBeenCalled();
    h.emit(1); await flushPcmResponse(); expect(h.player.finish).not.toHaveBeenCalled();
    h.emit(2);
    await expect(h.pending).resolves.toBe('neural');
    expect(h.player.push.mock.calls.map(([bytes]: [Uint8Array]) => [...bytes])).toEqual([[1, 2], [1, 2], [1, 2]]);
    expect(h.player.finish).toHaveBeenCalledOnce(); expect(mocks.synthesizeSpeech).toHaveBeenCalledOnce();
  });
  it('accepts all chunks before the response and checks their exact completion totals', async () => {
    const h = pcmHarness(); h.emit(0); h.emit(1); h.emit(2);
    expect(h.player.finish).not.toHaveBeenCalled(); h.respond(h.result());
    await expect(h.pending).resolves.toBe('neural'); expect(h.player.push).toHaveBeenCalledTimes(3);
  });
  it('accepts the response before any chunks without treating empty collected audio as completion', async () => {
    const h = pcmHarness(); h.respond(h.result()); await flushPcmResponse();
    expect(h.player.push).not.toHaveBeenCalled(); expect(h.player.finish).not.toHaveBeenCalled();
    h.emit(0); h.emit(1); h.emit(2); await expect(h.pending).resolves.toBe('neural');
  });
  it('keeps collected non-stream PCM working without a stream manifest', async () => {
    const h = pcmHarness(); h.respond({ mimeType: 'audio/pcm', audioBase64: window.btoa('1234') });
    await expect(h.pending).resolves.toBe('neural');
    expect(h.player.push).toHaveBeenCalledWith(new Uint8Array([49, 50, 51, 52]));
    expect(h.player.finish).toHaveBeenCalledOnce();
  });
  it('fails instead of calling finish when the declared chunk count has the wrong byte total', async () => {
    const h = pcmHarness(); h.emit(0); h.emit(1); h.respond(h.result(2, 6));
    await expect(h.pending).rejects.toThrow('Natural speech is unavailable'); expect(h.player.finish).not.toHaveBeenCalled();
  });
  it.each([
    { chunkCount: 0, byteLength: 6 }, { chunkCount: 1.5, byteLength: 6 },
    { chunkCount: 3, byteLength: 5 }, { chunkCount: 3, byteLength: 8 * 1024 * 1024 + 2 },
    { chunkCount: 7, byteLength: 6 }, { chunkCount: 3, byteLength: Number.POSITIVE_INFINITY },
  ])('rejects malformed PCM completion %j before finishing or re-synthesizing', async (totals) => {
    const h = pcmHarness(); h.respond({ ...h.result(), pcmStream: { streamId: h.streamId, ...totals } });
    await expect(h.pending).rejects.toThrow('Natural speech is unavailable');
    expect(h.player.finish).not.toHaveBeenCalled(); expect(mocks.synthesizeSpeech).toHaveBeenCalledOnce();
  });
  it('rejects a completion belonging to another stream', async () => {
    const h = pcmHarness(); h.respond({ ...h.result(), pcmStream: { ...h.result().pcmStream, streamId: 'other-stream' } });
    await expect(h.pending).rejects.toThrow('Natural speech is unavailable'); expect(h.player.finish).not.toHaveBeenCalled();
  });
  it('rejects an empty response lacking completion metadata and cannot silently drop received chunks', async () => {
    const h = pcmHarness(); h.emit(0); h.respond({ mimeType: 'audio/pcm', audioBase64: '' });
    await expect(h.pending).rejects.toThrow('Natural speech is unavailable'); expect(h.player.finish).not.toHaveBeenCalled();
  });
  it('rejects duplicate or out-of-order chunks while Main generation is still pending', async () => {
    const h = pcmHarness(); h.emit(0); h.emit(0);
    await expect(h.pending).rejects.toThrow('Natural speech is unavailable'); expect(h.player.push).toHaveBeenCalledOnce();
    expect(h.player.finish).not.toHaveBeenCalled();
  });
  it('uses the existing playback deadline when a declared final chunk never arrives', async () => {
    vi.useFakeTimers(); const h = pcmHarness(); h.emit(0); h.respond(h.result());
    const rejected = expect(h.pending).rejects.toThrow('Natural speech is unavailable');
    await vi.advanceTimersByTimeAsync(180_000); await rejected;
    expect(h.player.finish).not.toHaveBeenCalled(); expect(h.player.dispose).toHaveBeenCalled();
    expect(mocks.synthesizeSpeech).toHaveBeenCalledOnce();
  });
  it('settles cancellation while waiting for late chunks and never schedules them after stop', async () => {
    const h = pcmHarness(); h.emit(0); h.respond(h.result()); await flushPcmResponse();
    stopMorpheusSpeech(); await expect(h.pending).resolves.toBe('cancelled');
    h.emit(1); h.emit(2); await flushPcmResponse();
    expect(h.player.push).toHaveBeenCalledOnce(); expect(h.player.finish).not.toHaveBeenCalled();
  });
  it('a newer utterance supersedes an incomplete PCM delivery without letting the old chunks finish it', async () => {
    const old = pcmHarness(); old.emit(0); old.respond(old.result()); await flushPcmResponse();
    mocks.synthesizeSpeech.mockResolvedValueOnce({ mimeType: 'audio/pcm', audioBase64: window.btoa('1234') });
    const latest = playMorpheusSpeech('New reply.', { neuralAvailable: true, format: 'pcm24' });
    await expect(old.pending).resolves.toBe('cancelled'); await expect(latest).resolves.toBe('neural');
    old.emit(1); old.emit(2); await flushPcmResponse();
    expect(old.player.push).toHaveBeenCalledOnce(); expect(old.player.finish).not.toHaveBeenCalled();
    expect(mocks.createPcmPlayback.mock.results[1].value.finish).toHaveBeenCalledOnce();
  });
  it('an actual playback failure settles immediately while declared IPC chunks are still missing', async () => {
    let fail!: (error: Error) => void;
    const completed = new Promise<void>((_resolve, reject) => { fail = reject; });
    void completed.catch(() => undefined);
    const player = { push: vi.fn(), finish: vi.fn(), dispose: vi.fn(), completed };
    mocks.createPcmPlayback.mockReturnValueOnce(player);
    const h = pcmHarness(); h.emit(0); h.respond(h.result()); await flushPcmResponse();
    fail(new Error('Actual audio output failed'));
    await expect(h.pending).rejects.toThrow('Natural speech is unavailable');
    h.emit(1); h.emit(2); await flushPcmResponse();
    expect(player.finish).not.toHaveBeenCalled(); expect(player.push).toHaveBeenCalledOnce();
    expect(mocks.cancelSpeech).toHaveBeenCalledTimes(2);
  });
});

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
