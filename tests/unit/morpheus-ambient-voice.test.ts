import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  extractMorpheusWakeObjective,
  MorpheusAmbientVoiceCapture,
} from '@/lib/morpheus-ambient-voice';

afterEach(() => vi.unstubAllGlobals());

describe('ambient Morpheus wake phrase', () => {
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
