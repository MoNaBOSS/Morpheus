import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  extractMorpheusWakeObjective,
  MorpheusAmbientVoiceCapture,
} from '@/lib/morpheus-ambient-voice';

afterEach(() => vi.unstubAllGlobals());

function selectedInputFixture() {
  const stop = vi.fn(), close = vi.fn(async () => undefined), onError = vi.fn();
  const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop }], getAudioTracks: () => [] }));
  const context = {
    state: 'running', onstatechange: null as (() => void) | null,
    resume: vi.fn(async () => undefined), audioWorklet: { addModule: vi.fn(async () => undefined) },
    destination: {}, close,
    createAnalyser: () => ({ fftSize: 32, getByteTimeDomainData: (sample: Uint8Array) => sample.fill(128) }),
    createMediaStreamSource: () => ({ connect: vi.fn() }),
    createGain: () => ({ gain: { value: 0 }, connect: vi.fn((node) => node), disconnect: vi.fn() }),
  };
  const port = { onmessage: null as ((event: MessageEvent<unknown>) => void) | null };
  vi.stubGlobal('AudioWorkletNode', class { port = port; connect = vi.fn((node) => node); disconnect = vi.fn(); });
  vi.stubGlobal('AudioContext', class { constructor() { return context; } });
  vi.stubGlobal('MediaRecorder', { isTypeSupported: () => true });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  const onAudioFrame = vi.fn(async () => undefined);
  const capture = new MorpheusAmbientVoiceCapture({ inputDeviceId: 'selected-mic', silenceMs: 1000, maxUtteranceMs: 20000,
    onAudioFrame, onCaptureStarted: vi.fn(async () => undefined), onCaptureEnded: vi.fn(async () => undefined),
    onBargeIn: vi.fn(), onUtterance: vi.fn(async () => undefined), onError });
  const emit = () => port.onmessage?.({ data: new ArrayBuffer(6400) } as MessageEvent<unknown>);
  return { capture, context, port, emit, onAudioFrame, getUserMedia, stop, close, onError };
}

async function flushInputSetup() { for (let i = 0; i < 12; i++) await Promise.resolve(); }

describe('selected microphone acquisition and revocation', () => {
  it('uses the exact selected device and remains pending until Main accepts the first actual PCM frame', async () => {
    const f = selectedInputFixture();
    let accepted!: () => void;
    f.onAudioFrame.mockImplementationOnce(() => new Promise<void>((resolve) => { accepted = resolve; }));
    let ready = false;
    const starting = f.capture.start().then(() => { ready = true; });
    await flushInputSetup();
    expect(f.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: expect.objectContaining({ deviceId: { exact: 'selected-mic' } }) }));
    expect(f.context.resume).toHaveBeenCalledOnce();
    expect(ready).toBe(false); expect(f.onAudioFrame).not.toHaveBeenCalled();
    f.emit(); await flushInputSetup();
    expect(ready).toBe(false); expect(f.onAudioFrame.mock.calls[0][0]).toHaveLength(6400);
    accepted(); await starting;
    expect(ready).toBe(true);
    f.capture.stop();
    expect(f.stop).toHaveBeenCalledOnce(); expect(f.port.onmessage).toBeNull();
  });

  it('immediately cancels a pending AudioContext resume and clears setup timers', async () => {
    vi.useFakeTimers();
    const f = selectedInputFixture();
    f.context.resume.mockImplementationOnce(() => new Promise<void>(() => undefined));
    try {
      const starting = f.capture.start(); await flushInputSetup();
      f.capture.stop(); await starting;
      expect(f.stop).toHaveBeenCalledOnce(); expect(f.close).toHaveBeenCalledOnce();
      expect(f.onAudioFrame).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    } finally { f.capture.stop(); vi.useRealTimers(); }
  });

  it('fails a stalled worklet load with a microphone repair and releases the stream', async () => {
    vi.useFakeTimers(); const f = selectedInputFixture();
    f.context.audioWorklet.addModule.mockImplementationOnce(() => new Promise<void>(() => undefined));
    try {
      const starting = expect(f.capture.start()).rejects.toThrow('Local microphone audio could not start');
      await flushInputSetup(); await vi.advanceTimersByTimeAsync(5000); await starting;
      expect(f.stop).toHaveBeenCalledOnce(); expect(f.close).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    } finally { f.capture.stop(); vi.useRealTimers(); }
  });

  it('cancels a pending first PCM acknowledgement and rejects post-ready queue overflow', async () => {
    const f = selectedInputFixture();
    f.onAudioFrame.mockImplementationOnce(() => new Promise<void>(() => undefined));
    const starting = f.capture.start(); await flushInputSetup(); f.emit();
    f.capture.stop(); await starting;
    expect(f.onError).not.toHaveBeenCalled(); expect(f.stop).toHaveBeenCalledOnce();
    const g = selectedInputFixture();
    const ready = g.capture.start(); await flushInputSetup(); g.emit(); await ready;
    g.onAudioFrame.mockImplementationOnce(() => new Promise<void>(() => undefined));
    g.emit(); g.emit(); g.emit();
    expect(g.onError).toHaveBeenCalledOnce(); expect(g.onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('stalled') }));
    expect(g.stop).toHaveBeenCalledOnce(); expect(g.port.onmessage).toBeNull();
  });
});

describe('ambient Morpheus wake phrase', () => {
  it('releases a microphone returned after cancellation without creating an audio context', async () => {
    let resolveStream!: (stream: MediaStream) => void;
    const stop = vi.fn();
    const audioContext = vi.fn();
    vi.stubGlobal('MediaRecorder', { isTypeSupported: () => true });
    vi.stubGlobal('AudioContext', audioContext);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => new Promise<MediaStream>((resolve) => { resolveStream = resolve; }) } });
    const capture = new MorpheusAmbientVoiceCapture({
      silenceMs: 1000, maxUtteranceMs: 20000,
      onCaptureStarted: vi.fn(async () => undefined), onCaptureEnded: vi.fn(async () => undefined),
      onBargeIn: vi.fn(), onUtterance: vi.fn(async () => undefined), onError: vi.fn(),
    });
    const starting = capture.start();
    capture.stop();
    resolveStream({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    await starting;
    expect(stop).toHaveBeenCalledOnce();
    expect(audioContext).not.toHaveBeenCalled();
  });

  it('releases all microphone resources and reports device loss once', async () => {
    vi.useFakeTimers();
    const track = new EventTarget() as EventTarget & { stop: () => void };
    track.stop = vi.fn();
    const close = vi.fn(async () => undefined);
    const onError = vi.fn();
    vi.stubGlobal('MediaRecorder', { isTypeSupported: () => true });
    vi.stubGlobal('AudioContext', class {
      state = 'running'; resume = vi.fn(async () => undefined);
      createAnalyser() { return { fftSize: 32, getByteTimeDomainData: (sample: Uint8Array) => sample.fill(128) }; }
      createMediaStreamSource() { return { connect: vi.fn() }; }
      close = close;
    });
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track], getAudioTracks: () => [track] }) } });
    const capture = new MorpheusAmbientVoiceCapture({
      silenceMs: 1000, maxUtteranceMs: 20000,
      onCaptureStarted: vi.fn(async () => undefined), onCaptureEnded: vi.fn(async () => undefined),
      onBargeIn: vi.fn(), onUtterance: vi.fn(async () => undefined), onError,
    });
    try {
      await capture.start();
      track.dispatchEvent(new Event('ended'));
      track.dispatchEvent(new Event('ended'));
      expect(track.stop).toHaveBeenCalledOnce();
      expect(close).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledOnce();
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Reconnect') }));
      expect(vi.getTimerCount()).toBe(0);
    } finally { capture.stop(); vi.useRealTimers(); }
  });

  it('monitors audio without animation frames and releases the timer on stop', async () => {
    vi.useFakeTimers();
    const frames = vi.fn();
    vi.stubGlobal('requestAnimationFrame', frames);
    const capture = new MorpheusAmbientVoiceCapture({
      silenceMs: 1_000, maxUtteranceMs: 20_000,
      onCaptureStarted: vi.fn(async () => undefined), onCaptureEnded: vi.fn(async () => undefined),
      onBargeIn: vi.fn(), onUtterance: vi.fn(async () => undefined), onError: vi.fn(),
    });
    const read = vi.fn((sample: Uint8Array) => sample.fill(128));
    const internal = capture as unknown as {
      stopped: boolean; analyser: unknown; monitor(mimeType: 'audio/webm'): void;
    };
    internal.stopped = false;
    internal.analyser = { fftSize: 32, getByteTimeDomainData: read };
    try {
      internal.monitor('audio/webm');
      await vi.advanceTimersByTimeAsync(150);
      expect(read).toHaveBeenCalledTimes(3);
      expect(frames).not.toHaveBeenCalled();
      capture.stop();
      await vi.advanceTimersByTimeAsync(500);
      expect(read).toHaveBeenCalledTimes(3);
    } finally { capture.stop(); vi.useRealTimers(); }
  });
  it('extracts an objective only after the exact normalized token sequence', () => {
    expect(extractMorpheusWakeObjective('Hey, MORPHEUS — open Notepad.', 'hey morpheus'))
      .toBe('open Notepad.');
    expect(extractMorpheusWakeObjective('Morpheus create notes.txt', 'Morpheus'))
      .toBe('create notes.txt');
  });

  it('does not create work for ordinary speech, partial matches, or an empty objective', () => {
    expect(extractMorpheusWakeObjective('Open Notepad please', 'Morpheus')).toBeNull();
    expect(extractMorpheusWakeObjective('Morph us open Notepad', 'Morpheus')).toBeNull();
    expect(extractMorpheusWakeObjective('Morpheus!', 'Morpheus')).toBeNull();
  });

  it('does not begin recording until Main accepts the audited capture transition', async () => {
    const order: string[] = [];
    let acceptAudit: (() => void) | undefined;
    class FakeMediaRecorder {
      state: RecordingState = 'inactive';
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      onstop: (() => void) | null = null;
      start() { this.state = 'recording'; order.push('recording'); }
      stop() { this.state = 'inactive'; this.onstop?.(); }
    }
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    const onCaptureEnded = vi.fn(async () => { order.push('ended'); });
    const capture = new MorpheusAmbientVoiceCapture({
      silenceMs: 1_000,
      maxUtteranceMs: 20_000,
      onCaptureStarted: vi.fn(() => new Promise<void>((resolve) => {
        acceptAudit = () => { order.push('audited'); resolve(); };
      })),
      onCaptureEnded,
      onBargeIn: vi.fn(),
      onUtterance: vi.fn(async () => undefined),
      onError: vi.fn(),
    });
    const internal = capture as unknown as {
      stream: MediaStream;
      stopped: boolean;
      startUtterance(mimeType: 'audio/webm'): Promise<void>;
    };
    internal.stream = { getTracks: () => [] } as unknown as MediaStream;
    internal.stopped = false;

    const starting = internal.startUtterance('audio/webm');
    await vi.waitFor(() => expect(acceptAudit).toBeTypeOf('function'));
    expect(order).toEqual([]);
    acceptAudit?.();
    await starting;
    expect(order).toEqual(['audited', 'recording']);

    capture.stop();
    await vi.waitFor(() => expect(onCaptureEnded).toHaveBeenCalledOnce());
    expect(order).toEqual(['audited', 'recording', 'ended']);
  });

  it('records no bytes when Main rejects the capture transition', async () => {
    const recorderStart = vi.fn();
    class FakeMediaRecorder {
      state: RecordingState = 'inactive';
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      onstop: (() => void) | null = null;
      start() { recorderStart(); this.state = 'recording'; }
      stop() { this.state = 'inactive'; this.onstop?.(); }
    }
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    const onError = vi.fn();
    const capture = new MorpheusAmbientVoiceCapture({
      silenceMs: 1_000,
      maxUtteranceMs: 20_000,
      onCaptureStarted: vi.fn(async () => { throw new Error('Audit unavailable'); }),
      onCaptureEnded: vi.fn(async () => undefined),
      onBargeIn: vi.fn(),
      onUtterance: vi.fn(async () => undefined),
      onError,
    });
    const internal = capture as unknown as {
      stream: MediaStream;
      stopped: boolean;
      startUtterance(mimeType: 'audio/webm'): Promise<void>;
    };
    internal.stream = { getTracks: () => [] } as unknown as MediaStream;
    internal.stopped = false;

    await internal.startUtterance('audio/webm');
    expect(recorderStart).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Audit unavailable' }));
  });
});
