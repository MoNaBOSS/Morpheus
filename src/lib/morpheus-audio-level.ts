/** Ephemeral amplitude only. The bounded scalar may cross typed presentation IPC; no raw audio, transcript or persistence. */
const sources = new Map<symbol, number>();
const listeners = new Set<(level: number) => void>();
const LEVEL_INTERVAL_MS = 50;
let current = 0;
let lastPublished = 0;
let lastPublishedAt = Number.NEGATIVE_INFINITY;
let pendingPublish: number | null = null;

function publish(): void {
  current = Math.max(0, ...sources.values());
  if (listeners.size === 0) {
    if (pendingPublish !== null) window.clearTimeout(pendingPublish);
    pendingPublish = null;
    lastPublished = current;
    return;
  }
  if (current === lastPublished) return;
  const elapsed = performance.now() - lastPublishedAt;
  if (elapsed >= 0 && elapsed < LEVEL_INTERVAL_MS) {
    if (pendingPublish === null) {
      pendingPublish = window.setTimeout(() => {
        pendingPublish = null;
        publish();
      }, LEVEL_INTERVAL_MS - elapsed);
    }
    return;
  }
  lastPublished = current;
  lastPublishedAt = performance.now();
  for (const listener of listeners) listener(current);
}

export function subscribeMorpheusAudioLevel(listener: (level: number) => void): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && pendingPublish !== null) {
      window.clearTimeout(pendingPublish);
      pendingPublish = null;
      lastPublished = current;
    }
  };
}

export function createMorpheusAudioLevelSource() {
  const id = Symbol('audio-level');
  let disposed = false;
  return {
    update(rms: number) {
      if (disposed) return;
      sources.set(id, Number.isFinite(rms) ? Math.min(1, Math.max(0, rms * 6)) : 0);
      publish();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      sources.delete(id);
      publish();
    },
  };
}

export type MorpheusUtteranceEvent = 'speech-started' | 'speech-ended' | 'no-speech';

/**
 * Deterministic voice-activity state for one explicit recording.
 *
 * This class receives RMS samples only. It never sees audio bytes and cannot
 * submit work. Keeping the state pure makes silence handling testable without
 * a microphone or a provider fixture.
 */
export class MorpheusUtteranceDetector {
  private noiseFloor = 0.008;
  private voiceFrames = 0;
  private speechStarted = false;
  private lastVoiceAt = 0;
  private completed = false;

  constructor(
    private readonly startedAt: number,
    private readonly silenceMs = 900,
    private readonly noSpeechMs = 10_000,
  ) {}

  sample(rms: number, now: number): MorpheusUtteranceEvent | null {
    if (this.completed) return null;
    const level = Number.isFinite(rms) ? Math.max(0, rms) : 0;
    const threshold = Math.max(0.025, this.noiseFloor * 3.2);

    if (!this.speechStarted) {
      if (level > threshold) this.voiceFrames += 1;
      else {
        this.voiceFrames = 0;
        this.noiseFloor = this.noiseFloor * 0.98 + Math.min(level, 0.04) * 0.02;
      }
      if (this.voiceFrames >= 3) {
        this.speechStarted = true;
        this.lastVoiceAt = now;
        return 'speech-started';
      }
      if (now - this.startedAt >= this.noSpeechMs) {
        this.completed = true;
        return 'no-speech';
      }
      return null;
    }

    if (level > threshold) this.lastVoiceAt = now;
    if (now - this.lastVoiceAt >= this.silenceMs) {
      this.completed = true;
      return 'speech-ended';
    }
    return null;
  }
}

export type MorpheusMicrophoneMeterOptions = {
  autoStop?: boolean;
  silenceMs?: number;
  noSpeechMs?: number;
  onSpeechEnd?(): void;
  onNoSpeech?(): void;
};

/** Metering must never prevent a valid recording if Web Audio is unavailable. */
export function meterMorpheusMicrophone(
  stream: MediaStream,
  options: MorpheusMicrophoneMeterOptions = {},
): () => void {
  const level = createMorpheusAudioLevelSource();
  let context: AudioContext | undefined;
  let timer: number | undefined;
  let disposed = false;
  const detector = options.autoStop
    ? new MorpheusUtteranceDetector(performance.now(), options.silenceMs, options.noSpeechMs)
    : null;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    window.clearInterval(timer);
    level.dispose();
    void context?.close().catch(() => undefined);
  };
  try {
    context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);
    const sample = new Uint8Array(analyser.fftSize);
    timer = window.setInterval(() => {
      analyser.getByteTimeDomainData(sample);
      let energy = 0;
      for (const value of sample) energy += ((value - 128) / 128) ** 2;
      const rms = Math.sqrt(energy / sample.length);
      level.update(rms);
      const event = detector?.sample(rms, performance.now());
      if (event === 'speech-ended') options.onSpeechEnd?.();
      else if (event === 'no-speech') options.onNoSpeech?.();
    }, 50);
  } catch { dispose(); }
  return dispose;
}

/** Reads actual playback while keeping the audible output independent of the analyser. */
export function meterMorpheusPlayback(audio: HTMLAudioElement): () => void {
  const level = createMorpheusAudioLevelSource();
  let context: AudioContext | null = null;
  let timer: number | null = null;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (timer !== null) window.clearInterval(timer);
    level.dispose();
    void context?.close().catch(() => undefined);
  };
  const start = async () => {
    try {
      context = new AudioContext();
      if (context.state !== 'running') await context.resume();
      if (disposed) return;
      if (context.state !== 'running') { dispose(); return; }
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      let capture: MediaStream | null = null;
      const captureElement = audio as HTMLAudioElement & { captureStream?: () => MediaStream };
      try { capture = captureElement.captureStream?.() ?? null; } catch { /* Metering is optional. */ }
      // Never take ownership of the audible output route merely for animation.
      if (!capture?.getAudioTracks().length) { dispose(); return; }
      context.createMediaStreamSource(capture).connect(analyser);
      const sample = new Uint8Array(analyser.fftSize);
      timer = window.setInterval(() => {
        try {
          analyser.getByteTimeDomainData(sample);
          let energy = 0;
          for (const value of sample) energy += ((value - 128) / 128) ** 2;
          level.update(Math.sqrt(energy / sample.length));
        } catch {
          if (timer !== null) window.clearInterval(timer);
          timer = null;
          level.update(0);
        }
      }, LEVEL_INTERVAL_MS);
    } catch {
      dispose();
    }
  };
  void start();
  return dispose;
}
