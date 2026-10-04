import {
  MORPHEUS_VOICE_MAX_AUDIO_BYTES,
  MORPHEUS_VOICE_MIME_TYPES,
  type MorpheusVoiceMimeType,
} from '@shared/morpheus/voice-types';
import { createMorpheusAudioLevelSource } from './morpheus-audio-level';
import { matchMorpheusAddress } from './morpheus-voice-dialogue';
import { MORPHEUS_WAKE_FRAME_BYTES } from '@shared/morpheus/wake-audio-types';

/**
 * Returns only the words after an exact normalized wake-phrase token sequence.
 * A transcript without the phrase—or with no objective after it—creates no work.
 */
export function extractMorpheusWakeObjective(transcript: string, wakePhrase: string): string | null {
  const address = matchMorpheusAddress(transcript, wakePhrase);
  return address.kind === 'command' ? address.text : null;
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
  inputDeviceId?: string;
  silenceMs: number;
  maxUtteranceMs: number;
  /** Local wake mode must not record background speech before an addressed window. */
  shouldCapture?(): boolean;
  /** Ephemeral selected-mic PCM for the local recognizer, never a recording. */
  onAudioFrame?(pcm: Uint8Array): Promise<void>;
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
  private readonly level = createMorpheusAudioLevelSource();
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private recorder: MediaRecorder | null = null;
  private monitorTimer: number | null = null;
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
  private generation = 0;
  private wakeProcessor: AudioWorkletNode | null = null;
  private wakeSink: GainNode | null = null;
  private inputLifetime: AbortController | null = null;

  constructor(private readonly options: MorpheusAmbientVoiceCaptureOptions) {}

  async start(): Promise<void> {
    if (!this.stopped) return;
    const generation = ++this.generation;
    const mimeType = this.supportedMimeType();
    if (!mimeType || !navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') {
      throw new Error('Ambient voice is not supported by this Windows audio environment.');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { ...(this.options.inputDeviceId ? { deviceId: { exact: this.options.inputDeviceId } } : {}), channelCount: 1, echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    let ownsStream = false;
    try {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.35;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      this.stream = stream;
      ownsStream = true;
      this.context = context;
      this.analyser = analyser;
      this.stopped = false;
      const lifetime = new AbortController();
      this.inputLifetime = lifetime;
      await this.inputStep(context.resume(), lifetime.signal,
        'Microphone audio could not start. Reopen Morpheus and restart companion voice.');
      if (generation !== this.generation) return;
      if (context.state !== 'running') throw new Error('Microphone audio could not start. Reopen Morpheus and restart companion voice.');
      let resuming = false;
      context.onstatechange = () => {
        if (generation !== this.generation || this.stopped || context.state === 'running' || resuming) return;
        resuming = true;
        void this.inputStep(context.resume(), lifetime.signal,
          'Microphone audio paused. Reopen Morpheus and restart companion voice.').then(() => {
          if (context.state !== 'running') throw new Error('Microphone audio paused. Reopen Morpheus and restart companion voice.');
        }).catch((error) => {
          if (generation !== this.generation || this.stopped) return;
          this.stop();
          this.options.onError(error instanceof Error ? error : new Error(String(error)));
        }).finally(() => { resuming = false; });
      };
      if (this.options.onAudioFrame) {
        // Keep the fixed module on the application's own origin. An inlined
        // data URL would be rejected by the packaged script-src 'self' policy.
        await this.inputStep(context.audioWorklet.addModule(new URL('./morpheus-wake-audio-worklet.js?no-inline', import.meta.url).href), lifetime.signal,
          'Local microphone audio could not start. Restart companion voice.');
        if (generation !== this.generation) return;
        const processor = new AudioWorkletNode(context, 'morpheus-wake-audio');
        const sink = context.createGain();
        sink.gain.value = 0; // Keep the graph active without playing microphone audio.
        source.connect(processor);
        processor.connect(sink).connect(context.destination);
        this.wakeProcessor = processor;
        this.wakeSink = sink;
        let first = true, sending = false;
        let pending: Uint8Array | null = null;
        await new Promise<void>((resolve, reject) => {
          const cancel = (): void => { window.clearTimeout(timeout); reject(new DOMException('Voice input stopped', 'AbortError')); };
          const finish = (): void => { window.clearTimeout(timeout); lifetime.signal.removeEventListener('abort', cancel); };
          const timeout = window.setTimeout(() => { finish(); reject(new Error('The selected microphone supplied no audio. Reconnect it and restart companion voice.')); }, 15_000);
          lifetime.signal.addEventListener('abort', cancel, { once: true });
          const send = async (pcm: Uint8Array): Promise<void> => {
            sending = true;
            try {
              if (generation !== this.generation || this.stopped) return;
              await this.options.onAudioFrame!(pcm);
              if (first) { first = false; finish(); resolve(); }
            } catch (error) {
              finish();
              const failure = error instanceof Error ? error : new Error(String(error));
              if (first) reject(failure);
              else if (generation === this.generation) { this.stop(); this.options.onError(failure); }
            } finally {
              sending = false;
              if (pending && generation === this.generation && !this.stopped) {
                const next = pending; pending = null;
                void send(next);
              }
            }
          };
          processor.port.onmessage = (event: MessageEvent<unknown>) => {
            if (generation !== this.generation || this.stopped) return;
            if (!(event.data instanceof ArrayBuffer) || event.data.byteLength !== MORPHEUS_WAKE_FRAME_BYTES) {
              const error = new Error('Local microphone audio failed. Restart companion voice.');
              finish(); reject(error); this.stop(); this.options.onError(error); return;
            }
            const pcm = new Uint8Array(event.data);
            if (this.suppressed) pcm.fill(0);
            if (sending) {
              // Recognition startup may take seconds. Discard pre-ready frames;
              // after readiness allow only one queued 200-ms frame.
              if (first) return;
              if (pending) {
                this.stop(); this.options.onError(new Error('Local microphone audio stalled. Restart companion voice.')); return;
              }
              pending = pcm;
            } else void send(pcm);
          };
          processor.onprocessorerror = () => {
            const error = new Error('Local microphone audio stopped. Restart companion voice.');
            finish(); reject(error); this.stop(); this.options.onError(error);
          };
        });
        if (generation !== this.generation) return;
      }
      for (const track of stream.getAudioTracks()) {
        track.addEventListener('ended', () => {
          if (generation !== this.generation || this.stopped) return;
          this.stop();
          this.options.onError(new Error('Microphone disconnected. Reconnect it and restart ambient voice.'));
        }, { once: true });
      }
      this.monitor(mimeType);
    } catch (error) {
      if (!ownsStream) stream.getTracks().forEach((track) => track.stop());
      if (generation === this.generation) this.stop();
      else return;
      throw error;
    }
  }

  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
    if (suppressed && this.recorder?.state === 'recording') this.finishUtterance(true);
  }

  stop(): void {
    this.generation += 1;
    this.stopped = true;
    this.inputLifetime?.abort();
    this.inputLifetime = null;
    this.level.dispose();
    if (this.monitorTimer !== null) window.clearTimeout(this.monitorTimer);
    this.monitorTimer = null;
    if (this.recorder?.state === 'recording') this.finishUtterance(true);
    if (this.maxTimer !== null) window.clearTimeout(this.maxTimer);
    this.maxTimer = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.wakeProcessor) { this.wakeProcessor.port.onmessage = null; this.wakeProcessor.disconnect(); }
    this.wakeProcessor = null;
    this.wakeSink?.disconnect();
    this.wakeSink = null;
    if (this.context) this.context.onstatechange = null;
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.analyser = null;
    this.processing = false;
  }

  private supportedMimeType(): MorpheusVoiceMimeType | null {
    if (typeof MediaRecorder === 'undefined') return null;
    return MORPHEUS_VOICE_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? null;
  }

  private inputStep(step: Promise<void>, signal: AbortSignal, message: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const finish = (): void => { window.clearTimeout(timeout); signal.removeEventListener('abort', abort); };
      const abort = (): void => { finish(); reject(new DOMException('Voice input stopped', 'AbortError')); };
      const timeout = window.setTimeout(() => { finish(); reject(new Error(message)); }, 5_000);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); return; }
      step.then(() => { finish(); resolve(); }, (error) => { finish(); reject(error); });
    });
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
      this.level.update(this.recorder?.state === 'recording' && !this.suppressed ? rms : 0);
      const threshold = Math.max(0.025, this.noiseFloor * 3.2);
      const now = performance.now();
      if (!this.recorder && !this.processing && !this.suppressed && (this.options.shouldCapture?.() ?? true)) {
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
      } else this.voiceFrames = 0;
      // Audio activity is not visual animation. rAF stops when the window hides.
      this.monitorTimer = window.setTimeout(frame, 50);
    };
    this.monitorTimer = window.setTimeout(frame, 50);
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
      if (!this.stream || this.recorder || this.suppressed || this.stopped
        || !(this.options.shouldCapture?.() ?? true)) {
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
