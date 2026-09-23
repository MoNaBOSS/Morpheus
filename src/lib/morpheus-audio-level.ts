/** Ephemeral amplitude only. Never audio, transcript, persistence or IPC. */
const sources = new Map<symbol, number>();
const listeners = new Set<(level: number) => void>();
let current = 0;

export function subscribeMorpheusAudioLevel(listener: (level: number) => void): () => void {
  listeners.add(listener);
  listener(current);
  return () => { listeners.delete(listener); };
}

export function createMorpheusAudioLevelSource() {
  const id = Symbol('audio-level');
  let disposed = false;
  const publish = () => {
    current = Math.max(0, ...sources.values());
    for (const listener of listeners) listener(current);
  };
  return {
    update(rms: number) {
      if (disposed) return;
      sources.set(id, Number.isFinite(rms) ? Math.min(1, Math.max(0, rms * 6)) : 0);
      publish();
    },
    dispose() {
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
  const detector = options.autoStop
    ? new MorpheusUtteranceDetector(performance.now(), options.silenceMs, options.noSpeechMs)
    : null;
  const dispose = () => {
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
