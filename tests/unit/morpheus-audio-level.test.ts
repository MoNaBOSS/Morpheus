import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMorpheusAudioLevelSource,
  meterMorpheusMicrophone,
  meterMorpheusPlayback,
  subscribeMorpheusAudioLevel,
} from '@/lib/morpheus-audio-level';

class FakeAnalyser {
  fftSize = 512;
  getByteTimeDomainData = vi.fn((sample: Uint8Array) => sample.fill(132));
  connect = vi.fn();
}

class FakeAudioContext {
  static latest: FakeAudioContext;
  state: AudioContextState = 'running';
  onstatechange: (() => void) | null = null;
  destination = {} as AudioDestinationNode;
  analyser = new FakeAnalyser();
  streamSource = { connect: vi.fn() };
  elementSource = { connect: vi.fn(), disconnect: vi.fn() };
  createAnalyser = vi.fn(() => this.analyser);
  createMediaStreamSource = vi.fn(() => this.streamSource);
  createMediaElementSource = vi.fn(() => this.elementSource);
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  constructor() { FakeAudioContext.latest = this; }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ephemeral audio level', () => {
  it('coalesces concurrent sources to at most 20 Hz and clears stale producers', () => {
    vi.useFakeTimers();
    const emissions: Array<{ level: number; at: number }> = [];
    const unsubscribe = subscribeMorpheusAudioLevel((level) => {
      emissions.push({ level, at: performance.now() });
    });
    const a = createMorpheusAudioLevelSource();
    const b = createMorpheusAudioLevelSource();
    a.update(1);
    b.update(0.1);
    a.dispose();
    expect(emissions.at(-1)?.level).toBe(1);
    vi.advanceTimersByTime(50);
    expect(emissions.at(-1)?.level).toBeCloseTo(0.6);
    a.update(1);
    b.update(Number.NaN);
    vi.advanceTimersByTime(50);
    expect(emissions.at(-1)?.level).toBe(0);
    b.dispose();
    unsubscribe();
    expect(emissions.map(({ level }) => level)).toEqual([0, 1, 0.6000000000000001, 0]);
    for (let index = 2; index < emissions.length; index += 1) {
      expect(emissions[index].at - emissions[index - 1].at).toBeGreaterThanOrEqual(50);
    }
  });

  it('publishes real microphone RMS and releases Web Audio without stopping capture', () => {
    vi.useFakeTimers();
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const listener = vi.fn();
    const unsubscribe = subscribeMorpheusAudioLevel(listener);
    const stream = { getTracks: vi.fn() } as unknown as MediaStream;
    const stop = meterMorpheusMicrophone(stream);
    const context = FakeAudioContext.latest;
    expect(context.createMediaStreamSource).toHaveBeenCalledWith(stream);
    vi.advanceTimersByTime(50);
    expect(listener).toHaveBeenLastCalledWith(0.1875);
    stop();
    vi.advanceTimersByTime(50);
    expect(listener).toHaveBeenLastCalledWith(0);
    expect(context.close).toHaveBeenCalledOnce();
    expect(stream.getTracks).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('resumes a suspended microphone context before measuring speech and finishes once after real silence', async () => {
    vi.useFakeTimers();
    class SuspendedContext extends FakeAudioContext {
      state: AudioContextState = 'suspended';
    }
    vi.stubGlobal('AudioContext', SuspendedContext);
    const onSpeechEnd = vi.fn();
    const onNoSpeech = vi.fn();
    const onUnavailable = vi.fn();
    const stop = meterMorpheusMicrophone({} as MediaStream, { autoStop: true, onSpeechEnd, onNoSpeech, onUnavailable });
    const context = FakeAudioContext.latest;
    await vi.advanceTimersByTimeAsync(150);
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.createMediaStreamSource).toHaveBeenCalledOnce();
    context.analyser.getByteTimeDomainData.mockImplementation((sample) => sample.fill(128));
    await vi.advanceTimersByTimeAsync(850);
    expect(onSpeechEnd).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50);
    expect(onSpeechEnd).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onSpeechEnd).toHaveBeenCalledOnce();
    expect(onNoSpeech).not.toHaveBeenCalled();
    expect(onUnavailable).not.toHaveBeenCalled();
    stop();
  });

  it('bounds a stalled microphone resume and reports repair without submitting silence or owning capture', async () => {
    vi.useFakeTimers();
    class StalledContext extends FakeAudioContext {
      state: AudioContextState = 'suspended';
      resume = vi.fn(() => new Promise<void>(() => undefined));
    }
    vi.stubGlobal('AudioContext', StalledContext);
    const onSpeechEnd = vi.fn();
    const onNoSpeech = vi.fn();
    const onUnavailable = vi.fn();
    const stream = { getTracks: vi.fn() } as unknown as MediaStream;
    const stop = meterMorpheusMicrophone(stream, { autoStop: true, onSpeechEnd, onNoSpeech, onUnavailable });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(onUnavailable).toHaveBeenCalledOnce();
    expect(onSpeechEnd).not.toHaveBeenCalled();
    expect(onNoSpeech).not.toHaveBeenCalled();
    expect(FakeAudioContext.latest.createMediaStreamSource).not.toHaveBeenCalled();
    expect(FakeAudioContext.latest.close).toHaveBeenCalledOnce();
    expect(stream.getTracks).not.toHaveBeenCalled();
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not revive a cancelled microphone meter when pending resume completes', async () => {
    vi.useFakeTimers();
    let completeResume: (() => void) | undefined;
    class PendingContext extends FakeAudioContext {
      state: AudioContextState = 'suspended';
      resume = vi.fn(() => new Promise<void>((resolve) => { completeResume = resolve; }));
    }
    vi.stubGlobal('AudioContext', PendingContext);
    const onUnavailable = vi.fn();
    const stop = meterMorpheusMicrophone({} as MediaStream, { autoStop: true, onUnavailable });
    stop();
    completeResume?.();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(FakeAudioContext.latest.createMediaStreamSource).not.toHaveBeenCalled();
    expect(FakeAudioContext.latest.close).toHaveBeenCalledOnce();
    expect(onUnavailable).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports synchronous microphone-meter startup failure after caller setup and suppresses a cancelled repair', async () => {
    vi.useFakeTimers();
    class BrokenContext { constructor() { throw new Error('No Web Audio device'); } }
    vi.stubGlobal('AudioContext', BrokenContext);
    const onUnavailable = vi.fn();
    meterMorpheusMicrophone({} as MediaStream, { onUnavailable });
    expect(onUnavailable).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(onUnavailable).toHaveBeenCalledOnce();
    const cancelledRepair = vi.fn();
    const stop = meterMorpheusMicrophone({} as MediaStream, { onUnavailable: cancelledRepair });
    stop();
    await vi.advanceTimersByTimeAsync(0);
    expect(cancelledRepair).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects a successful resume promise that leaves the microphone graph suspended', async () => {
    vi.useFakeTimers();
    class StillSuspendedContext extends FakeAudioContext {
      state: AudioContextState = 'suspended';
      resume = vi.fn(async () => undefined);
    }
    vi.stubGlobal('AudioContext', StillSuspendedContext);
    const onUnavailable = vi.fn();
    const stop = meterMorpheusMicrophone({} as MediaStream, { autoStop: true, onUnavailable });
    await vi.advanceTimersByTimeAsync(0);
    expect(onUnavailable).toHaveBeenCalledOnce();
    expect(FakeAudioContext.latest.createMediaStreamSource).not.toHaveBeenCalled();
    expect(FakeAudioContext.latest.close).toHaveBeenCalledOnce();
    stop();
  });

  it('excludes an interrupted audio graph from the speech-end clock', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const onSpeechEnd = vi.fn();
    const stop = meterMorpheusMicrophone({} as MediaStream, { autoStop: true, onSpeechEnd });
    const context = FakeAudioContext.latest;
    await vi.advanceTimersByTimeAsync(150);
    let resume: (() => void) | undefined;
    context.resume.mockImplementation(() => new Promise<void>((resolve) => { resume = () => { context.state = 'running'; resolve(); }; }));
    context.state = 'suspended';
    context.onstatechange?.();
    context.analyser.getByteTimeDomainData.mockImplementation((sample) => sample.fill(128));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(onSpeechEnd).not.toHaveBeenCalled();
    resume?.();
    await vi.advanceTimersByTimeAsync(850);
    expect(onSpeechEnd).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50);
    expect(onSpeechEnd).toHaveBeenCalledOnce();
    stop();
  });

  it('does not reroute or stop playback when no capture stream is available', () => {
    vi.useFakeTimers();
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const listener = vi.fn();
    const unsubscribe = subscribeMorpheusAudioLevel(listener);
    const audio = { pause: vi.fn() } as unknown as HTMLAudioElement;
    const stop = meterMorpheusPlayback(audio);
    const context = FakeAudioContext.latest;
    expect(context.createMediaElementSource).not.toHaveBeenCalled();
    expect(context.createMediaStreamSource).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(listener).toHaveBeenLastCalledWith(0);
    stop();
    expect(listener).toHaveBeenLastCalledWith(0);
    expect(context.close).toHaveBeenCalledOnce();
    expect(audio.pause).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('uses a captured playback stream without rerouting audible output when supported', () => {
    vi.useFakeTimers();
    vi.stubGlobal('AudioContext', FakeAudioContext);
    const listener = vi.fn();
    const unsubscribe = subscribeMorpheusAudioLevel(listener);
    const capture = { getAudioTracks: () => [{}] } as unknown as MediaStream;
    const audio = { captureStream: vi.fn(() => capture), pause: vi.fn() } as unknown as HTMLAudioElement;
    const stop = meterMorpheusPlayback(audio);
    const context = FakeAudioContext.latest;
    expect(context.createMediaStreamSource).toHaveBeenCalledWith(capture);
    expect(context.createMediaElementSource).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(listener).toHaveBeenLastCalledWith(0.1875);
    stop();
    vi.advanceTimersByTime(50);
    expect(listener).toHaveBeenLastCalledWith(0);
    expect(audio.pause).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('does not reroute playback when the audio context cannot run', async () => {
    vi.useFakeTimers();
    class SuspendedAudioContext extends FakeAudioContext {
      state: AudioContextState = 'suspended';
      resume = vi.fn(async () => { throw new Error('Audio context unavailable'); });
    }
    vi.stubGlobal('AudioContext', SuspendedAudioContext);
    const audio = { pause: vi.fn() } as unknown as HTMLAudioElement;
    const stop = meterMorpheusPlayback(audio);
    await Promise.resolve();
    const context = FakeAudioContext.latest;
    expect(context.createMediaElementSource).not.toHaveBeenCalled();
    expect(context.close).toHaveBeenCalledOnce();
    expect(audio.pause).not.toHaveBeenCalled();
    stop();
  });
});
