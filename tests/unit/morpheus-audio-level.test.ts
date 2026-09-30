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
