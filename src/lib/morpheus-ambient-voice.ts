import {
  MORPHEUS_VOICE_MAX_AUDIO_BYTES,
  MORPHEUS_VOICE_MIME_TYPES,
  type MorpheusVoiceMimeType,
} from '@shared/morpheus/voice-types';

type Token = { value: string; start: number; end: number };

function tokens(text: string): Token[] {
  const output: Token[] = [];
  const normalized = text.normalize('NFKC');
  for (const match of normalized.matchAll(/[\p{L}\p{N}]+/gu)) {
    const start = match.index ?? 0;
    output.push({ value: match[0].toLocaleLowerCase(), start, end: start + match[0].length });
  }
  return output;
}

/**
 * Returns only the words after an exact normalized wake-phrase token sequence.
 * A transcript without the phrase—or with no objective after it—creates no work.
 */
export function extractMorpheusWakeObjective(transcript: string, wakePhrase: string): string | null {
  const heard = tokens(transcript);
  const wake = tokens(wakePhrase);
  if (wake.length === 0 || heard.length < wake.length) return null;
  for (let start = 0; start <= heard.length - wake.length; start += 1) {
    if (!wake.every((token, offset) => token.value === heard[start + offset].value)) continue;
    const objective = transcript.slice(heard[start + wake.length - 1].end)
      .replace(/^[\s,.:;!?\-–—]+/u, '')
      .trim();
    return objective || null;
  }
  return null;
}

export async function morpheusBlobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 32 * 1024;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return window.btoa(binary);
}

export type MorpheusAmbientVoiceCaptureOptions = {
  silenceMs: number;
  maxUtteranceMs: number;
  /** Main must audit and publish the visible capture state before bytes are recorded. */
  onCaptureStarted(): Promise<void>;
  /** Balances every audited start, including discarded and failed captures. */
  onCaptureEnded(): Promise<void>;
  onBargeIn(): void;
  onUtterance(blob: Blob, mimeType: MorpheusVoiceMimeType, durationMs: number): Promise<void>;
  onError(error: Error): void;
};

/** Chromium-owned microphone and bounded voice-activity capture. */
export class MorpheusAmbientVoiceCapture {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private recorder: MediaRecorder | null = null;
  private animationFrame: number | null = null;
  private chunks: Blob[] = [];
  private chunkBytes = 0;
  private utteranceStartedAt = 0;
  private lastVoiceAt = 0;
  private voiceFrames = 0;
  private noiseFloor = 0.008;
  private processing = false;
  private suppressed = false;
  private stopped = true;
  private maxTimer: number | null = null;
  private discardCurrent = false;

  constructor(private readonly options: MorpheusAmbientVoiceCaptureOptions) {}

  async start(): Promise<void> {
    if (!this.stopped) return;
    const mimeType = this.supportedMimeType();
    if (!mimeType || !navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') {
      throw new Error('Ambient voice is not supported by this Windows audio environment.');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    try {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.35;
      context.createMediaStreamSource(stream).connect(analyser);
      this.stream = stream;
      this.context = context;
      this.analyser = analyser;
      this.stopped = false;
      this.monitor(mimeType);
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      throw error;
    }
  }

  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
    if (suppressed && this.recorder?.state === 'recording') this.finishUtterance(true);
  }

  stop(): void {
    this.stopped = true;
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    if (this.recorder?.state === 'recording') this.finishUtterance(true);
    if (this.maxTimer !== null) window.clearTimeout(this.maxTimer);
    this.maxTimer = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.analyser = null;
    this.processing = false;
  }

  private supportedMimeType(): MorpheusVoiceMimeType | null {
    if (typeof MediaRecorder === 'undefined') return null;
    return MORPHEUS_VOICE_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? null;
  }

  private monitor(mimeType: MorpheusVoiceMimeType): void {
    const sample = new Uint8Array(this.analyser?.fftSize ?? 1024);
    const frame = (): void => {
      if (this.stopped || !this.analyser) return;
      this.analyser.getByteTimeDomainData(sample);
      let energy = 0;
      for (const value of sample) {
        const amplitude = (value - 128) / 128;
        energy += amplitude * amplitude;
      }
      const rms = Math.sqrt(energy / sample.length);
      const threshold = Math.max(0.025, this.noiseFloor * 3.2);
      const now = performance.now();
      if (!this.recorder && !this.processing && !this.suppressed) {
        if (rms > threshold) this.voiceFrames += 1;
        else {
          this.voiceFrames = 0;
          this.noiseFloor = this.noiseFloor * 0.98 + Math.min(rms, 0.04) * 0.02;
        }
        if (this.voiceFrames >= 3) {
          this.processing = true;
          this.voiceFrames = 0;
          void this.startUtterance(mimeType);
        }
      } else if (this.recorder?.state === 'recording') {
        if (rms > threshold) this.lastVoiceAt = now;
        if (now - this.lastVoiceAt >= this.options.silenceMs) this.finishUtterance(false);
      }
      this.animationFrame = requestAnimationFrame(frame);
    };
    this.animationFrame = requestAnimationFrame(frame);
  }

  private async startUtterance(mimeType: MorpheusVoiceMimeType): Promise<void> {
    if (!this.stream || this.recorder || this.suppressed || this.stopped) {
      this.processing = false;
      return;
    }
    let audited = false;
    try {
      await this.options.onCaptureStarted();
      audited = true;
      if (!this.stream || this.recorder || this.suppressed || this.stopped) {
        await this.options.onCaptureEnded();
        return;
      }
      const recorder = new MediaRecorder(this.stream, { mimeType });
      this.recorder = recorder;
      this.chunks = [];
      this.chunkBytes = 0;
      this.discardCurrent = false;
      this.utteranceStartedAt = performance.now();
      this.lastVoiceAt = this.utteranceStartedAt;
      recorder.ondataavailable = (event) => {
        if (!event.data.size) return;
        this.chunkBytes += event.data.size;
        if (this.chunkBytes > MORPHEUS_VOICE_MAX_AUDIO_BYTES) {
          this.options.onError(new Error('Ambient utterance exceeded the safe audio limit.'));
          this.finishUtterance(true);
          return;
        }
        this.chunks.push(event.data);
      };
      recorder.onerror = () => {
        this.options.onError(new Error('Ambient microphone recording failed.'));
        this.finishUtterance(true);
      };
      recorder.onstop = () => { void this.handleStopped(recorder, mimeType); };
      recorder.start(250);
      this.options.onBargeIn();
      this.maxTimer = window.setTimeout(() => this.finishUtterance(false), this.options.maxUtteranceMs);
    } catch (error) {
      if (audited) await this.options.onCaptureEnded().catch(() => undefined);
      this.options.onError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.processing = false;
    }
  }

  private finishUtterance(discard: boolean): void {
    const recorder = this.recorder;
    if (!recorder || recorder.state !== 'recording') return;
    this.discardCurrent ||= discard;
    if (this.maxTimer !== null) window.clearTimeout(this.maxTimer);
    this.maxTimer = null;
    recorder.stop();
  }

  private async handleStopped(recorder: MediaRecorder, mimeType: MorpheusVoiceMimeType): Promise<void> {
    if (this.recorder !== recorder) return;
    const chunks = this.chunks;
    const bytes = this.chunkBytes;
    const discard = this.discardCurrent;
    const durationMs = Math.max(100, Math.round(performance.now() - this.utteranceStartedAt));
    this.recorder = null;
    this.chunks = [];
    this.chunkBytes = 0;
    this.discardCurrent = false;
    this.processing = true;
    try {
      await this.options.onCaptureEnded();
      if (discard || this.stopped || this.suppressed || bytes === 0 || bytes > MORPHEUS_VOICE_MAX_AUDIO_BYTES) return;
      const blob = new Blob(chunks, { type: mimeType });
      await this.options.onUtterance(blob, mimeType, durationMs);
    } catch (error) {
      this.options.onError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.processing = false;
      this.voiceFrames = 0;
    }
  }
}
