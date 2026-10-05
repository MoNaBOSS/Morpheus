import WebSocket, { type ClientOptions, type RawData } from 'ws';
import {
  MORPHEUS_SPEECH_MAX_AUDIO_BYTES, MORPHEUS_SPEECH_MAX_TEXT_CHARS,
  MORPHEUS_VOICE_MAX_TRANSCRIPT_CHARS,
} from '@shared/morpheus/voice-types';
import { MorpheusNoSpeechError, validateMorpheusLocalRecording, validateMorpheusLocalTranscript } from './local-input';
import { localSpeechWav } from './local-speech';

export type MorpheusDeepgramRecognitionModel = 'nova-3' | 'flux-general-en';
export type DeepgramVoiceFailureKind = 'authentication' | 'access' | 'rate-limit' | 'endpoint' | 'unavailable';
export type DeepgramVoiceFailureCode = DeepgramVoiceFailureKind | 'timeout' | 'protocol' | 'invalid-audio' | 'invalid-text' | 'backpressure';

/** Fixed messages only: websocket errors, response bodies and keys never escape. */
export class DeepgramVoiceError extends Error {
  readonly kind: DeepgramVoiceFailureKind;
  constructor(readonly code: DeepgramVoiceFailureCode) {
    const messages: Record<DeepgramVoiceFailureCode, string> = {
      authentication: 'Deepgram rejected the voice credential. Repair it in Voice connections.',
      access: 'The Deepgram account cannot access this voice service. Check its permissions and balance.',
      'rate-limit': 'Deepgram voice is busy. Wait briefly and try again.',
      endpoint: 'This Deepgram voice model is unavailable for the account. Check the Voice connection.',
      unavailable: 'Deepgram voice could not connect. Check the internet connection and try again.',
      timeout: 'Deepgram voice took too long. Try a shorter request or Included voice.',
      protocol: 'Deepgram returned an incomplete voice turn. Please speak again.',
      'invalid-audio': 'Deepgram voice needs a bounded mono 16 kHz recording. Retry the microphone test.',
      'invalid-text': 'Speech text is empty or exceeds the permitted length.',
      backpressure: 'The voice connection could not keep up with the microphone. Please speak again.',
    };
    super(messages[code]); this.name = 'DeepgramVoiceError';
    this.kind = ['authentication', 'access', 'rate-limit', 'endpoint'].includes(code)
      ? code as DeepgramVoiceFailureKind : 'unavailable';
  }
}

export type DeepgramVoiceSocket = Pick<WebSocket, 'on' | 'send' | 'readyState' | 'bufferedAmount' | 'close' | 'terminate'>;
export interface MorpheusDeepgramVoiceOptions {
  /** Main-only protected storage callback. Never a renderer credential. */
  getKey: () => string | null | Promise<string | null>;
  createSocket?: (url: string, options: ClientOptions) => DeepgramVoiceSocket;
  fetch?: typeof globalThis.fetch;
}
export interface MorpheusDeepgramRecognitionSession {
  /** One validated final turn only; Update/Eager/close-flush are never results. */
  result: Promise<string>;
  writePcm(pcm: Buffer): void;
  /** Deliberate Main-authorized stop; wait for provider final, never use interim. */
  finish(): void;
  cancel(): void;
}
export interface MorpheusDeepgramVoice {
  createRecognitionSession(options: { signal: AbortSignal; model?: MorpheusDeepgramRecognitionModel; onStartOfTurn?: () => void }): Promise<MorpheusDeepgramRecognitionSession>;
  transcribe(wav: Buffer, signal: AbortSignal, options?: { model?: MorpheusDeepgramRecognitionModel }): Promise<string>;
  /** The native wake/VAD already ended this recording; no paced replay. */
  transcribeRecorded(wav: Buffer, signal: AbortSignal): Promise<string>;
  synthesize(text: string, signal: AbortSignal): Promise<Buffer>;
  synthesizeStream(text: string, signal: AbortSignal, onPcm: (audio: Buffer) => void): Promise<void>;
  /** Recognition admission and real generated PCM; not a microphone test. */
  testConnection(signal?: AbortSignal, options?: { model?: MorpheusDeepgramRecognitionModel }): Promise<void>;
  test(signal?: AbortSignal, options?: { model?: MorpheusDeepgramRecognitionModel }): Promise<void>;
  dispose(): void;
}

const FRAME_BYTES = 2_560; // 80 ms mono PCM16 at 16 kHz.
const MAX_INPUT_BYTES = 38 * 32_000; // 30 s utterance + bounded natural endpoint silence.
const MAX_FRAME_BYTES = 6_400; // Existing Main microphone packets are 200 ms.
const MAX_BACKPRESSURE_BYTES = 64 * 1_024;
const MAX_JSON_BYTES = 64 * 1_024;
const CONNECTION_TIMEOUT_MS = 10_000;
const RECOGNITION_TIMEOUT_MS = 48_000;
const SYNTHESIS_TIMEOUT_MS = 30_000;
const KEY_TIMEOUT_MS = 3_000;
const SPEECH_MODEL = 'flux-kit-en';

function abortError(): Error { const error = new Error('Voice operation was cancelled.'); error.name = 'AbortError'; return error; }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function id(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value); }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function fraction(value: unknown): value is number { return finite(value) && value >= 0 && value <= 1; }
function decode(data: RawData): Record<string, unknown> {
  const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
  if (bytes.length > MAX_JSON_BYTES) throw new DeepgramVoiceError('protocol');
  let result: unknown;
  try { result = JSON.parse(bytes.toString('utf8')); } catch { throw new DeepgramVoiceError('protocol'); }
  if (!object(result) || typeof result.type !== 'string') throw new DeepgramVoiceError('protocol');
  return result;
}
function listenUrl(model: MorpheusDeepgramRecognitionModel): string {
  if (model !== 'nova-3' && model !== 'flux-general-en') throw new DeepgramVoiceError('endpoint');
  const url = new URL(model === 'nova-3' ? 'wss://api.deepgram.com/v1/listen' : 'wss://api.deepgram.com/v2/listen');
  url.searchParams.set('model', model); url.searchParams.set('encoding', 'linear16'); url.searchParams.set('sample_rate', '16000');
  if (model === 'nova-3') {
    url.searchParams.set('language', 'en'); url.searchParams.set('channels', '1');
    url.searchParams.set('interim_results', 'true'); url.searchParams.set('endpointing', '500');
  }
  return url.toString();
}
function failureForStatus(status: number): DeepgramVoiceError {
  return new DeepgramVoiceError(status === 401 ? 'authentication' : status === 403 ? 'access'
    : status === 429 ? 'rate-limit' : status === 400 || status === 404 ? 'endpoint' : 'unavailable');
}

/** A single operation owns its socket and deadlines. No reconnect/replay or ambient idle loop. */
class Exchange<T> {
  readonly result: Promise<T>;
  readonly ready: Promise<void>;
  private resolveResult!: (value: T) => void;
  private rejectResult!: (error: Error) => void;
  private resolveReady!: () => void;
  private rejectReady!: (error: Error) => void;
  private connected = false;
  done = false;
  private readonly connectionTimer: ReturnType<typeof setTimeout>;
  private readonly operationTimer: ReturnType<typeof setTimeout>;
  private readonly abort = () => this.fail(abortError());
  constructor(
    readonly socket: DeepgramVoiceSocket,
    private readonly signal: AbortSignal,
    timeoutMs: number,
    private readonly remove: () => void,
    onOpen: (exchange: Exchange<T>) => void,
    onMessage: (exchange: Exchange<T>, data: RawData, binary: boolean) => void,
  ) {
    this.result = new Promise<T>((resolve, reject) => { this.resolveResult = resolve; this.rejectResult = reject; });
    this.ready = new Promise<void>((resolve, reject) => { this.resolveReady = resolve; this.rejectReady = reject; });
    // A caller can still be awaiting Connected when the operation fails.
    void this.result.catch(() => {}); void this.ready.catch(() => {});
    this.connectionTimer = setTimeout(() => this.fail(new DeepgramVoiceError('timeout')), CONNECTION_TIMEOUT_MS);
    this.operationTimer = setTimeout(() => this.fail(new DeepgramVoiceError('timeout')), timeoutMs);
    this.connectionTimer.unref?.(); this.operationTimer.unref?.();
    socket.on('open', () => { if (!this.done) this.guard(() => onOpen(this)); });
    socket.on('message', (data: RawData, binary: boolean) => { if (!this.done) this.guard(() => onMessage(this, data, binary)); });
    socket.on('error', () => this.fail(new DeepgramVoiceError('unavailable')));
    socket.on('unexpected-response', (_request, response) => { response.destroy(); this.fail(failureForStatus(response.statusCode ?? 0)); });
    socket.on('close', () => { if (!this.done) this.fail(new DeepgramVoiceError('protocol')); });
    signal.addEventListener('abort', this.abort, { once: true });
    if (signal.aborted) this.abort();
  }
  private guard(callback: () => void): void {
    try { callback(); } catch (error) { this.fail(error instanceof DeepgramVoiceError || error instanceof MorpheusNoSpeechError ? error : new DeepgramVoiceError('protocol')); }
  }
  markReady(): void {
    if (this.done || this.connected || this.socket.readyState !== WebSocket.OPEN) throw new DeepgramVoiceError('protocol');
    this.connected = true; clearTimeout(this.connectionTimer); this.resolveReady();
  }
  send(value: Buffer | string): void {
    if (this.done || this.signal.aborted) throw abortError();
    if (!this.connected || this.socket.readyState !== WebSocket.OPEN) throw new DeepgramVoiceError('unavailable');
    if (this.socket.bufferedAmount + Buffer.byteLength(value) > MAX_BACKPRESSURE_BYTES) throw new DeepgramVoiceError('backpressure');
    try { this.socket.send(value, error => { if (error) this.fail(new DeepgramVoiceError('unavailable')); }); }
    catch { throw new DeepgramVoiceError('unavailable'); }
  }
  complete(value: T): void { if (!this.done) { this.cleanup(); this.resolveResult(value); } }
  fail(error: Error): void { if (!this.done) { this.cleanup(); this.rejectReady(error); this.rejectResult(error); } }
  cancel(): void { this.fail(abortError()); }
  private cleanup(): void {
    this.done = true; clearTimeout(this.connectionTimer); clearTimeout(this.operationTimer);
    this.signal.removeEventListener('abort', this.abort); this.remove();
    // Immediate disconnect stops paid audio and prevents trailing/stale messages.
    // A terminal result was already received; CloseStream cannot create a result.
    this.socket.terminate();
  }
}

export function createMorpheusDeepgramVoice(options: MorpheusDeepgramVoiceOptions): MorpheusDeepgramVoice {
  const active = new Set<Exchange<unknown>>();
  const activeFetch = new Set<AbortController>();
  let disposed = false;
  const socketFactory = options.createSocket ?? ((url: string, config: ClientOptions) => new WebSocket(url, config));
  const readKey = async (signal: AbortSignal): Promise<string> => {
    if (signal.aborted || disposed) throw abortError();
    // Local vault access is also bounded; a hung callback cannot open a late socket.
    const key = await new Promise<string | null>((resolve, reject) => {
      const abort = () => { cleanup(); reject(abortError()); };
      const timer = setTimeout(() => { cleanup(); reject(new DeepgramVoiceError('timeout')); }, KEY_TIMEOUT_MS); timer.unref?.();
      const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); };
      signal.addEventListener('abort', abort, { once: true });
      Promise.resolve().then(options.getKey).then(value => { cleanup(); resolve(value); }, () => { cleanup(); reject(new DeepgramVoiceError('authentication')); });
    });
    if (signal.aborted || disposed) throw abortError();
    if (typeof key !== 'string' || !key.trim() || key.length > 2_000 || !/^[\x21-\x7e]+$/.test(key.trim())) throw new DeepgramVoiceError('authentication');
    return key.trim();
  };
  const exchange = async <T>(url: string, signal: AbortSignal, timeoutMs: number,
    onOpen: (wire: Exchange<T>) => void, onMessage: (wire: Exchange<T>, data: RawData, binary: boolean) => void) => {
    const key = await readKey(signal);
    let socket: DeepgramVoiceSocket;
    try { socket = socketFactory(url, { headers: { Authorization: `Token ${key}` }, handshakeTimeout: CONNECTION_TIMEOUT_MS,
      maxPayload: 1_024 * 1_024, followRedirects: false, perMessageDeflate: false }); }
    catch { throw new DeepgramVoiceError('unavailable'); }
    let current: Exchange<T> | undefined;
    const wire = current = new Exchange<T>(socket, signal, timeoutMs, () => { if (current) active.delete(current as Exchange<unknown>); }, onOpen, onMessage);
    active.add(wire as Exchange<unknown>);
    if (wire.done) active.delete(wire as Exchange<unknown>);
    return wire;
  };

  const transcribeRecorded: MorpheusDeepgramVoice['transcribeRecorded'] = async (wav, signal) => {
    if (!Buffer.isBuffer(wav) || wav.length > 30 * 32_000 + 44) throw new DeepgramVoiceError('invalid-audio');
    validateMorpheusLocalRecording(wav);
    const key = await readKey(signal);
    const controller = new AbortController(); activeFetch.add(controller);
    let timedOut = false;
    const abort = () => controller.abort(); signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 30_000); timer.unref?.();
    const request = options.fetch ?? globalThis.fetch;
    try {
      if (signal.aborted || disposed) throw abortError();
      const response = await awaitAbort(request('https://api.deepgram.com/v1/listen?model=nova-3&language=en', {
        method: 'POST', headers: { Authorization: `Token ${key}`, 'Content-Type': 'audio/wav' },
        body: new Uint8Array(wav), signal: controller.signal, redirect: 'error',
      }), controller.signal);
      if (!response.ok) { void response.body?.cancel().catch(() => {}); throw failureForStatus(response.status); }
      if (!response.body || !response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new DeepgramVoiceError('protocol');
      const declared = response.headers.get('content-length');
      if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_JSON_BYTES)) throw new DeepgramVoiceError('protocol');
      const reader = response.body.getReader(); const parts: Buffer[] = []; let bytes = 0;
      try {
        while (true) {
          const item = await awaitAbort(reader.read(), controller.signal); if (item.done) break;
          bytes += item.value.byteLength; if (bytes > MAX_JSON_BYTES) throw new DeepgramVoiceError('protocol');
          parts.push(Buffer.from(item.value));
        }
      } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
      if (signal.aborted || controller.signal.aborted || disposed) throw abortError();
      let result: unknown;
      try { result = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw new DeepgramVoiceError('protocol'); }
      const duration = (wav.length - 44) / 32_000;
      if (!object(result) || !object(result.metadata) || result.metadata.channels !== 1 || !id(result.metadata.request_id)
        || !finite(result.metadata.duration) || result.metadata.duration <= 0 || Math.abs(result.metadata.duration - duration) > 0.25
        || !object(result.results) || !Array.isArray(result.results.channels) || result.results.channels.length !== 1
        || !object(result.results.channels[0]) || !Array.isArray(result.results.channels[0].alternatives)
        || !object(result.results.channels[0].alternatives[0])) throw new DeepgramVoiceError('protocol');
      const alternative = result.results.channels[0].alternatives[0];
      if (typeof alternative.transcript !== 'string' || alternative.transcript.length > MORPHEUS_VOICE_MAX_TRANSCRIPT_CHARS
        || !fraction(alternative.confidence) || !Array.isArray(alternative.words)
        || !alternative.words.every(word => object(word) && typeof word.word === 'string' && fraction(word.confidence)
          && finite(word.start) && finite(word.end) && word.start >= 0 && word.end >= word.start && word.end <= duration + 0.25)) throw new DeepgramVoiceError('protocol');
      return validateMorpheusLocalTranscript(alternative.transcript);
    } catch (error) {
      if (timedOut) throw new DeepgramVoiceError('timeout');
      if (signal.aborted || disposed || controller.signal.aborted) throw abortError();
      if (error instanceof DeepgramVoiceError || error instanceof MorpheusNoSpeechError) throw error;
      throw new DeepgramVoiceError('unavailable');
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); controller.abort(); activeFetch.delete(controller); }
  };

  const createRecognitionSession: MorpheusDeepgramVoice['createRecognitionSession'] = async ({ signal, model = 'nova-3', onStartOfTurn }) => {
    let requestId = '', sequence = -1, turnIndex: number | null = null;
    let pending = Buffer.alloc(0), inputBytes = 0, manualFinish = false;
    const segments: string[] = [], seenSegments = new Map<string, string>();
    let finalSegmentEnd = -1;
    const wire = await exchange<string>(listenUrl(model), signal, RECOGNITION_TIMEOUT_MS,
      wire => { if (model === 'nova-3') wire.markReady(); },
      (wire, data, binary) => {
        if (binary) throw new DeepgramVoiceError('protocol');
        const message = decode(data);
        if (message.type === 'Error' || message.type === 'ConfigureFailure') throw new DeepgramVoiceError('unavailable');
        if (model === 'flux-general-en') {
          if (message.type === 'Connected') {
            if (!id(message.request_id) || message.sequence_id !== 0 || requestId) throw new DeepgramVoiceError('protocol');
            requestId = message.request_id; sequence = 0; wire.markReady(); return;
          }
          if (message.type !== 'TurnInfo') return;
          if (!requestId || !inputBytes || message.request_id !== requestId || !Number.isSafeInteger(message.sequence_id)
            || (message.sequence_id as number) < 0 || !Number.isSafeInteger(message.turn_index) || (message.turn_index as number) < 0
            || !finite(message.audio_window_start) || !finite(message.audio_window_end) || message.audio_window_start < 0
            || message.audio_window_end < message.audio_window_start || message.audio_window_end > inputBytes / 32_000 + 1
            || typeof message.transcript !== 'string' || message.transcript.length > MORPHEUS_VOICE_MAX_TRANSCRIPT_CHARS
            || !fraction(message.end_of_turn_confidence) || !Array.isArray(message.words)
            || !message.words.every(word => object(word) && typeof word.word === 'string' && fraction(word.confidence)
              && (word.start === undefined || (finite(word.start) && word.start >= 0))
              && (word.end === undefined || (finite(word.end) && word.end >= 0))
              && (word.start === undefined || word.end === undefined || (word.end as number) >= (word.start as number)))) throw new DeepgramVoiceError('protocol');
          if ((message.sequence_id as number) <= sequence) return;
          sequence = message.sequence_id as number;
          if (turnIndex === null) turnIndex = message.turn_index as number;
          if (message.turn_index !== turnIndex) throw new DeepgramVoiceError('protocol');
          if (message.event === 'StartOfTurn') onStartOfTurn?.();
          if (message.event !== 'EndOfTurn') return;
          if (message.trigger !== 'model' && message.trigger !== 'timeout' && !(message.trigger === 'manual' && manualFinish)) throw new DeepgramVoiceError('protocol');
          wire.complete(validateMorpheusLocalTranscript(message.transcript)); return;
        }
        if (message.type === 'SpeechStarted') { onStartOfTurn?.(); return; }
        if (message.type !== 'Results') return;
        if (!inputBytes || typeof message.is_final !== 'boolean' || typeof message.speech_final !== 'boolean'
          || !object(message.channel) || !Array.isArray(message.channel.alternatives) || !object(message.channel.alternatives[0])
          || !finite(message.start) || message.start < 0 || !finite(message.duration) || message.duration < 0
          || message.start + message.duration > inputBytes / 32_000 + 1
          || !Array.isArray(message.channel_index) || message.channel_index[0] !== 0
          || !object(message.metadata) || !id(message.metadata.request_id)) throw new DeepgramVoiceError('protocol');
        if (requestId && message.metadata.request_id !== requestId) throw new DeepgramVoiceError('protocol');
        requestId = message.metadata.request_id;
        const transcript = message.channel.alternatives[0].transcript;
        if (typeof transcript !== 'string' || transcript.length > MORPHEUS_VOICE_MAX_TRANSCRIPT_CHARS) throw new DeepgramVoiceError('protocol');
        if (!message.is_final || (message.from_finalize === true && !manualFinish)) return;
        const segmentId = `${message.start}:${message.duration}`;
        if (seenSegments.has(segmentId) && seenSegments.get(segmentId) !== transcript.trim()) throw new DeepgramVoiceError('protocol');
        if (!seenSegments.has(segmentId)) {
          if (message.start < finalSegmentEnd - 0.01) throw new DeepgramVoiceError('protocol');
          finalSegmentEnd = message.start + message.duration; seenSegments.set(segmentId, transcript.trim());
          if (transcript.trim()) segments.push(transcript.trim());
        }
        if (segments.join(' ').length > MORPHEUS_VOICE_MAX_TRANSCRIPT_CHARS) throw new DeepgramVoiceError('protocol');
        if (message.speech_final === true || (manualFinish && message.from_finalize === true)) wire.complete(validateMorpheusLocalTranscript(segments.join(' ')));
      });
    await wire.ready;
    const send = (pcm: Buffer) => {
      try { wire.send(pcm); } catch (error) { wire.fail(error instanceof Error ? error : new DeepgramVoiceError('unavailable')); throw error; }
    };
    return {
      result: wire.result,
      writePcm(pcm) {
        if (wire.done || manualFinish || signal.aborted) throw abortError();
        if (!Buffer.isBuffer(pcm) || !pcm.length || pcm.length % 2 || pcm.length > MAX_FRAME_BYTES || inputBytes + pcm.length > MAX_INPUT_BYTES) {
          const error = new DeepgramVoiceError('invalid-audio'); wire.fail(error); throw error;
        }
        inputBytes += pcm.length;
        pending = Buffer.concat([pending, pcm]);
        while (pending.length >= FRAME_BYTES) { send(pending.subarray(0, FRAME_BYTES)); pending = pending.subarray(FRAME_BYTES); }
      },
      finish() {
        if (wire.done || manualFinish) return;
        manualFinish = true;
        try {
          if (pending.length) { const last = Buffer.alloc(FRAME_BYTES); pending.copy(last); pending = Buffer.alloc(0); send(last); }
          wire.send(JSON.stringify({ type: model === 'flux-general-en' ? 'ForceEndTurn' : 'Finalize' }));
        } catch (error) { wire.fail(error instanceof Error ? error : new DeepgramVoiceError('unavailable')); }
      },
      cancel() { pending = Buffer.alloc(0); wire.cancel(); },
    };
  };

  const synthesizeStream: MorpheusDeepgramVoice['synthesizeStream'] = async (text, signal, onPcm) => {
    if (!text.trim() || text.length > MORPHEUS_SPEECH_MAX_TEXT_CHARS) throw new DeepgramVoiceError('invalid-text');
    let connected = false, speechId = '', bytes = 0;
    const wire = await exchange<void>(`wss://api.deepgram.com/v2/speak?model=${SPEECH_MODEL}&encoding=linear16&sample_rate=24000`, signal, SYNTHESIS_TIMEOUT_MS,
      () => {}, (wire, data, binary) => {
        if (binary) {
          const pcm = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
          if (!speechId || !pcm.length || pcm.length % 2 || bytes + pcm.length > MORPHEUS_SPEECH_MAX_AUDIO_BYTES) throw new DeepgramVoiceError('protocol');
          bytes += pcm.length; onPcm(pcm); return;
        }
        const message = decode(data);
        if (message.type === 'Error' || message.type === 'ConfigureFailure') throw new DeepgramVoiceError('unavailable');
        if (message.type === 'Connected') {
          // The live API resolves the fixed flux-kit-en request to "kit";
          // its published examples use the request alias as model_name.
          if (connected || !id(message.request_id) || (message.model_name !== SPEECH_MODEL && message.model_name !== 'kit')) throw new DeepgramVoiceError('protocol');
          connected = true; wire.markReady(); wire.send(JSON.stringify({ type: 'Speak', text })); wire.send(JSON.stringify({ type: 'Flush' })); return;
        }
        if (!connected) throw new DeepgramVoiceError('protocol');
        if (message.type === 'SpeechStarted') {
          if (speechId || !id(message.speech_id)) throw new DeepgramVoiceError('protocol'); speechId = message.speech_id; return;
        }
        if (message.type === 'SpeechInterrupted') throw new DeepgramVoiceError('protocol');
        if (message.type === 'Flushed') {
          if (!speechId || message.speech_id !== speechId) throw new DeepgramVoiceError('protocol');
          return; // Flux can still emit remaining PCM after Flushed.
        }
        if (message.type === 'SpeechMetadata') {
          if (!speechId || message.speech_id !== speechId || !bytes || !finite(message.audio_duration_ms)
            || message.audio_duration_ms <= 0 || message.audio_duration_ms > MORPHEUS_SPEECH_MAX_AUDIO_BYTES / 48
            || Math.abs(message.audio_duration_ms - bytes / 48) > 250
            || !Number.isSafeInteger(message.input_character_count) || (message.input_character_count as number) < 0
            || !Number.isSafeInteger(message.billable_character_count) || (message.billable_character_count as number) < 0) throw new DeepgramVoiceError('protocol');
          wire.complete();
        }
      });
    await wire.ready; await wire.result;
  };
  const testConnection: MorpheusDeepgramVoice['testConnection'] = async (signal = new AbortController().signal, settings) => {
    const session = await createRecognitionSession({ signal, model: settings?.model });
    session.cancel();
    let bytes = 0;
    await synthesizeStream('Morpheus is connected.', signal, pcm => { bytes += pcm.length; });
    if (!bytes) throw new DeepgramVoiceError('protocol');
  };
  return {
    createRecognitionSession,
    async transcribe(wav, signal, settings) {
      if (settings?.model !== undefined && settings.model !== 'nova-3' && settings.model !== 'flux-general-en') throw new DeepgramVoiceError('endpoint');
      if (settings?.model !== 'flux-general-en') return transcribeRecorded(wav, signal);
      if (wav.length > 30 * 32_000 + 44) throw new DeepgramVoiceError('invalid-audio');
      validateMorpheusLocalRecording(wav);
      const session = await createRecognitionSession({ signal, model: settings?.model });
      const pcm = wav.subarray(44);
      let done = false, offset = 0;
      void session.result.finally(() => { done = true; }).catch(() => {});
      try {
        // Native wake already supplies a bounded original WAV. Replay preserves
        // provider turn detection; no ForceEndTurn/CloseStream-derived dispatch.
        while (!done && offset < pcm.length) {
          session.writePcm(pcm.subarray(offset, Math.min(offset + FRAME_BYTES, pcm.length))); offset += FRAME_BYTES;
          await waitFrame(signal, session.result);
        }
        if (done && hasRemainingSpeech(pcm.subarray(offset))) throw new DeepgramVoiceError('protocol');
        for (let i = 0; !done && i < 100; i++) { session.writePcm(Buffer.alloc(FRAME_BYTES)); await waitFrame(signal, session.result); }
        if (!done) { session.cancel(); throw new DeepgramVoiceError('timeout'); }
        return await session.result;
      } finally { session.cancel(); }
    },
    transcribeRecorded,
    synthesizeStream,
    async synthesize(text, signal) {
      const parts: Buffer[] = []; await synthesizeStream(text, signal, pcm => parts.push(pcm));
      return localSpeechWav(Buffer.concat(parts));
    },
    testConnection,
    test: testConnection,
    dispose() { disposed = true; for (const wire of active) wire.cancel(); active.clear(); for (const controller of activeFetch) controller.abort(); activeFetch.clear(); },
  };
}

/** A setup probe never saves the supplied credential or changes provider routing. */
export async function probeMorpheusDeepgramConnection(
  credentials: { apiKey: string; recognitionModel: MorpheusDeepgramRecognitionModel; speechModel: 'flux-kit-en' },
  signal: AbortSignal,
): Promise<void> {
  if (credentials.speechModel !== SPEECH_MODEL) throw new DeepgramVoiceError('endpoint');
  const voice = createMorpheusDeepgramVoice({ getKey: () => credentials.apiKey });
  try { await voice.testConnection(signal, { model: credentials.recognitionModel }); } finally { voice.dispose(); }
}

function hasRemainingSpeech(pcm: Buffer): boolean {
  for (let offset = 0; offset + 2 <= pcm.length; offset += 2) if (Math.abs(pcm.readInt16LE(offset)) > 500) return true;
  return false;
}
async function waitFrame(signal: AbortSignal, result: Promise<unknown>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    await Promise.race([result.then(() => {}, () => {}), new Promise<void>((resolve, reject) => {
      abort = () => reject(abortError()); signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); return; }
      timer = setTimeout(resolve, 80);
    })]);
  } finally { if (timer) clearTimeout(timer); if (abort) signal.removeEventListener('abort', abort); }
}

async function awaitAbort<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([pending, new Promise<never>((_resolve, reject) => {
      abort = () => reject(abortError()); signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    })]);
  } finally { if (abort) signal.removeEventListener('abort', abort); }
}
