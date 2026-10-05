// @vitest-environment node
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientOptions } from 'ws';
import {
  createMorpheusDeepgramVoice, DeepgramVoiceError,
  type DeepgramVoiceSocket, type MorpheusDeepgramVoice,
} from '../../electron/services/morpheus/voice/deepgram-voice';
import { localSpeechPcm } from '../../electron/services/morpheus/voice/local-speech';

class FakeSocket extends EventEmitter {
  readyState = 0;
  bufferedAmount = 0;
  sent: (Buffer | string)[] = [];
  terminated = false;
  sendFailure = false;
  open() { this.readyState = 1; this.emit('open'); }
  json(value: object) { this.emit('message', Buffer.from(JSON.stringify(value)), false); }
  audio(value: Buffer) { this.emit('message', value, true); }
  send(value: Buffer | string, callback?: (error?: Error) => void) {
    this.sent.push(Buffer.isBuffer(value) ? Buffer.from(value) : value);
    callback?.(this.sendFailure ? new Error('remote error containing confidential data') : undefined);
  }
  close() { this.terminate(); }
  terminate() { this.terminated = true; this.readyState = 3; this.emit('close'); }
}

function fixture(key: string | null = 'synthetic-test-credential') {
  const sockets: FakeSocket[] = [], admissions: { url: string; options: ClientOptions }[] = [];
  const voice = createMorpheusDeepgramVoice({ getKey: () => key,
    createSocket: (url, options) => {
      admissions.push({ url, options }); const socket = new FakeSocket(); sockets.push(socket);
      return socket as unknown as DeepgramVoiceSocket;
    },
  });
  return { voice, sockets, admissions };
}
function flux(sequence: number, event = 'EndOfTurn', overrides: object = {}) {
  return { type: 'TurnInfo', request_id: 'request-1', sequence_id: sequence, event, turn_index: 0,
    audio_window_start: 0, audio_window_end: 0.08, transcript: 'Open YouTube.',
    words: [{ word: 'Open', confidence: 0.98 }, { word: 'YouTube.', confidence: 0.99 }],
    end_of_turn_confidence: 0.9, ...(event === 'EndOfTurn' ? { trigger: 'model' } : {}), ...overrides };
}
function nova(transcript: string, overrides: object = {}) {
  return { type: 'Results', channel_index: [0, 1], start: 0, duration: 0.08,
    channel: { alternatives: [{ transcript, confidence: 0.97 }] }, metadata: { request_id: 'request-1' },
    is_final: true, speech_final: true, from_finalize: false, ...overrides };
}
async function flush() { await vi.advanceTimersByTimeAsync(0); }
async function recognition(voice: MorpheusDeepgramVoice, sockets: FakeSocket[], model: 'nova-3' | 'flux-general-en' = 'flux-general-en', signal = new AbortController().signal) {
  const pending = voice.createRecognitionSession({ signal, model }); await flush();
  const socket = sockets.at(-1)!; socket.open();
  if (model === 'flux-general-en') socket.json({ type: 'Connected', request_id: 'request-1', sequence_id: 0 });
  return { session: await pending, socket };
}
function wave(samples = 2_560): Buffer {
  const wav = Buffer.alloc(44 + samples * 2); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(16_000, 24); wav.writeUInt32LE(32_000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) wav.writeInt16LE(Math.round(Math.sin(i / 10) * 1_000), 44 + i * 2);
  return wav;
}
function startSpeech(socket: FakeSocket, model = 'kit') {
  socket.open(); socket.json({ type: 'Connected', request_id: 'speech-request', model_name: model });
  socket.json({ type: 'SpeechStarted', speech_id: 'dg_sp_a1b2c3d4e5f6' });
}
function endSpeech(socket: FakeSocket, overrides: object = {}) {
  socket.json({ type: 'SpeechMetadata', speech_id: 'dg_sp_a1b2c3d4e5f6', audio_duration_ms: 80,
    input_character_count: 12, billable_character_count: 12, ...overrides });
}
function recordedResult(overrides: object = {}) {
  return { metadata: { channels: 1, request_id: 'request-1', duration: 0.16 },
    results: { channels: [{ alternatives: [{ transcript: 'Open YouTube.', confidence: 0.98,
      words: [{ word: 'Open', confidence: 0.98, start: 0, end: 0.07 }, { word: 'YouTube', confidence: 0.98, start: 0.07, end: 0.16 }] }] }] }, ...overrides };
}

describe('Main Deepgram speech transport', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); });

  it('uses fixed HTTPS sockets, header-only credential and 80 ms PCM frames after Connected', async () => {
    const { voice, sockets, admissions } = fixture();
    const pending = voice.createRecognitionSession({ signal: new AbortController().signal, model: 'flux-general-en' }); await flush();
    sockets[0].open(); expect(sockets[0].sent).toEqual([]);
    sockets[0].json({ type: 'Connected', request_id: 'request-1', sequence_id: 0 });
    const session = await pending; session.writePcm(Buffer.alloc(6_400, 1));
    expect(sockets[0].sent.map(value => Buffer.isBuffer(value) ? value.length : value)).toEqual([2_560, 2_560]);
    expect(admissions[0].url).toBe('wss://api.deepgram.com/v2/listen?model=flux-general-en&encoding=linear16&sample_rate=16000');
    expect(admissions[0].options).toMatchObject({ headers: { Authorization: 'Token synthetic-test-credential' }, followRedirects: false, perMessageDeflate: false });
    expect(admissions[0].url).not.toContain('credential');
    sockets[0].json(flux(1)); await expect(session.result).resolves.toBe('Open YouTube.'); expect(sockets[0].terminated).toBe(true); voice.dispose();
  });

  it('never resolves from interim, eager turn, duplicate/stale sequence or closure', async () => {
    const { voice, sockets } = fixture(); const { socket, session } = await recognition(voice, sockets);
    session.writePcm(Buffer.alloc(2_560, 1)); const accepted = vi.fn(); void session.result.then(accepted, () => {});
    socket.json(flux(1, 'Update')); socket.json(flux(2, 'EagerEndOfTurn')); socket.json(flux(1)); await flush(); expect(accepted).not.toHaveBeenCalled();
    socket.emit('close', 1000, Buffer.from('private server description')); await expect(session.result).rejects.toMatchObject({ code: 'protocol' });
    expect(accepted).not.toHaveBeenCalled(); voice.dispose();
  });

  it.each([{ request_id: 'other-request' }, { turn_index: 1 }, { audio_window_end: 99 }, { end_of_turn_confidence: NaN }, { words: [{ word: 'Open', confidence: 5 }] }])('rejects malformed or cross-session Flux final %j', async overrides => {
      const { voice, sockets } = fixture(); const { socket, session } = await recognition(voice, sockets);
      session.writePcm(Buffer.alloc(2_560, 1)); if ('turn_index' in overrides) socket.json(flux(1, 'StartOfTurn'));
      socket.json(flux(2, 'EndOfTurn', overrides)); await expect(session.result).rejects.toMatchObject({ code: 'protocol' }); voice.dispose();
    });

  it('requires actual admitted audio and a final transcript; empty speech does not become an action', async () => {
    const first = fixture(); const a = await recognition(first.voice, first.sockets); a.socket.json(flux(1));
    await expect(a.session.result).rejects.toMatchObject({ code: 'protocol' }); first.voice.dispose();
    const second = fixture(); const b = await recognition(second.voice, second.sockets); b.session.writePcm(Buffer.alloc(2_560));
    b.socket.json(flux(1, 'EndOfTurn', { transcript: '', words: [] })); await expect(b.session.result).rejects.toMatchObject({ name: 'MorpheusNoSpeechError' }); second.voice.dispose();
  });

  it('only admits manual Flux completion after explicit finish, which pads its bounded final frame', async () => {
    const { voice, sockets } = fixture(); const { socket, session } = await recognition(voice, sockets); session.writePcm(Buffer.alloc(640, 1));
    session.finish(); expect(socket.sent).toEqual([Buffer.concat([Buffer.alloc(640, 1), Buffer.alloc(1_920)]), '{"type":"ForceEndTurn"}']);
    socket.json(flux(1, 'EndOfTurn', { trigger: 'manual' })); await expect(session.result).resolves.toBe('Open YouTube.'); voice.dispose();
  });

  it('Nova3 accumulates distinct final segments only until natural speech_final', async () => {
    const { voice, sockets, admissions } = fixture(); const { socket, session } = await recognition(voice, sockets, 'nova-3'); session.writePcm(Buffer.alloc(6_400, 1));
    socket.json(nova('ignored partial', { is_final: false, speech_final: false }));
    socket.json(nova('Open YouTube', { speech_final: false })); socket.json(nova('Open YouTube', { speech_final: false }));
    socket.json(nova('and search Mr Beast.', { start: 0.08 })); await expect(session.result).resolves.toBe('Open YouTube and search Mr Beast.');
    expect(admissions[0].url).toContain('endpointing=500'); expect(admissions[0].url).toContain('/v1/listen?model=nova-3'); voice.dispose();
  });

  it('does not promote Nova3 close-flush/from_finalize into a natural result', async () => {
    const { voice, sockets } = fixture(); const { socket, session } = await recognition(voice, sockets, 'nova-3'); session.writePcm(Buffer.alloc(2_560, 1));
    socket.json(nova('Open YouTube.', { from_finalize: true })); socket.emit('close');
    await expect(session.result).rejects.toMatchObject({ code: 'protocol' }); voice.dispose();
  });

  it('rejects conflicting duplicate Nova3 final segments rather than silently replacing words', async () => {
    const { voice, sockets } = fixture(); const { socket, session } = await recognition(voice, sockets, 'nova-3'); session.writePcm(Buffer.alloc(2_560, 1));
    socket.json(nova('Open YouTube.', { speech_final: false })); socket.json(nova('Delete the file.', { speech_final: false }));
    await expect(session.result).rejects.toMatchObject({ code: 'protocol' }); voice.dispose();
  });

  it('cancels sockets immediately and ignores all late finals', async () => {
    const { voice, sockets } = fixture(); const controller = new AbortController(); const { socket, session } = await recognition(voice, sockets, 'flux-general-en', controller.signal);
    session.writePcm(Buffer.alloc(2_560, 1)); controller.abort(); socket.json(flux(1));
    await expect(session.result).rejects.toMatchObject({ name: 'AbortError' }); expect(socket.terminated).toBe(true);
    expect(() => session.writePcm(Buffer.alloc(2_560))).toThrow('cancelled'); voice.dispose();
  });

  it('rejects excessive packets and connection backlog instead of buffering unbounded audio', async () => {
    const first = fixture(); const a = await recognition(first.voice, first.sockets);
    expect(() => a.session.writePcm(Buffer.alloc(6_402))).toThrow(DeepgramVoiceError); await expect(a.session.result).rejects.toMatchObject({ code: 'invalid-audio' }); first.voice.dispose();
    const second = fixture(); const b = await recognition(second.voice, second.sockets); b.socket.bufferedAmount = 65_535;
    expect(() => b.session.writePcm(Buffer.alloc(2_560))).toThrow(DeepgramVoiceError); await expect(b.session.result).rejects.toMatchObject({ code: 'backpressure' }); second.voice.dispose();
  });

  it('bounds a stalled handshake, session lifetime and protected key lookup', async () => {
    const first = fixture(); const pending = first.voice.createRecognitionSession({ signal: new AbortController().signal }); const failed = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(10_001); await failed; expect(first.sockets[0].terminated).toBe(true); first.voice.dispose();
    const second = fixture(); const { socket, session } = await recognition(second.voice, second.sockets); const lifetime = expect(session.result).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(48_001); await lifetime; expect(socket.terminated).toBe(true); second.voice.dispose();
    const factory = vi.fn(); const third = createMorpheusDeepgramVoice({ getKey: () => new Promise(() => {}), createSocket: factory });
    const key = expect(third.createRecognitionSession({ signal: new AbortController().signal })).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(3_001); await key; expect(factory).not.toHaveBeenCalled(); third.dispose();
  });

  it.each([[401, 'authentication'], [403, 'access'], [429, 'rate-limit'], [400, 'endpoint'], [503, 'unavailable']])('exposes only safe classification for HTTP %s', async (status, kind) => {
      const { voice, sockets } = fixture(); const pending = voice.createRecognitionSession({ signal: new AbortController().signal }); await flush();
      const destroy = vi.fn(); sockets[0].emit('unexpected-response', {}, { statusCode: status, destroy });
      await expect(pending).rejects.toMatchObject({ kind }); expect(destroy).toHaveBeenCalled(); voice.dispose();
    });

  it('rejects missing and header-injected credentials before creating a network socket', async () => {
    for (const key of [null, '', 'secret\r\nX-Header: injected']) {
      const { voice, sockets } = fixture(key); await expect(voice.createRecognitionSession({ signal: new AbortController().signal })).rejects.toMatchObject({ code: 'authentication' });
      expect(sockets).toHaveLength(0); voice.dispose();
    }
  });

  it('streams Kit 24 kHz PCM and waits for SpeechMetadata, including audio after Flushed', async () => {
    const { voice, sockets, admissions } = fixture(); const pcm: Buffer[] = [];
    const pending = voice.synthesizeStream('Hello there.', new AbortController().signal, bytes => pcm.push(bytes)); const complete = vi.fn(); void pending.then(complete); await flush();
    startSpeech(sockets[0]); sockets[0].audio(Buffer.alloc(3_840, 1)); sockets[0].json({ type: 'Flushed', speech_id: 'dg_sp_a1b2c3d4e5f6' }); await flush();
    expect(complete).not.toHaveBeenCalled(); sockets[0].audio(Buffer.alloc(480, 2)); endSpeech(sockets[0]); await pending;
    expect(pcm.map(bytes => bytes.length)).toEqual([3_840, 480]); expect(admissions[0].url).toBe('wss://api.deepgram.com/v2/speak?model=flux-kit-en&encoding=linear16&sample_rate=24000');
    expect(sockets[0].sent).toEqual(['{"type":"Speak","text":"Hello there."}', '{"type":"Flush"}']); expect(sockets[0].terminated).toBe(true); voice.dispose();
  });

  it('returns canonical WAV for whole samples while streaming same real PCM bytes', async () => {
    const { voice, sockets } = fixture(); const pending = voice.synthesize('Hello there.', new AbortController().signal); await flush();
    startSpeech(sockets[0]); const pcm = Buffer.alloc(3_840, 1); sockets[0].audio(pcm); endSpeech(sockets[0]); expect(localSpeechPcm(await pending)).toEqual(pcm); voice.dispose();
  });

  it('accepts the documented request alias while keeping the live Kit model allowlist narrow', async () => {
    const first = fixture(); const complete = first.voice.synthesize('Hello there.', new AbortController().signal); await flush();
    startSpeech(first.sockets[0], 'flux-kit-en'); first.sockets[0].audio(Buffer.alloc(3_840, 1)); endSpeech(first.sockets[0]);
    expect(localSpeechPcm(await complete)).toHaveLength(3_840); first.voice.dispose();
    for (const model of ['other', 'flux-alexis-en', 'Kit', '', undefined]) {
      const next = fixture(); const rejected = next.voice.synthesize('Hello there.', new AbortController().signal); await flush();
      next.sockets[0].open(); next.sockets[0].json({ type: 'Connected', request_id: 'speech-request', model_name: model });
      await expect(rejected).rejects.toMatchObject({ code: 'protocol' }); expect(next.sockets[0].sent).toEqual([]); next.voice.dispose();
    }
  });

  it('rejects speech completion whose declared duration does not match actual 24 kHz PCM', async () => {
    const { voice, sockets } = fixture(); const pending = voice.synthesize('Hello there.', new AbortController().signal); await flush();
    startSpeech(sockets[0]); sockets[0].audio(Buffer.alloc(3_840, 1)); endSpeech(sockets[0], { audio_duration_ms: 5_000 });
    await expect(pending).rejects.toMatchObject({ code: 'protocol' }); voice.dispose();
  });

  it('interrupts hosted synthesis immediately and emits no late PCM', async () => {
    const { voice, sockets } = fixture(); const controller = new AbortController(); const onPcm = vi.fn();
    const pending = voice.synthesizeStream('Hello there.', controller.signal, onPcm); await flush(); startSpeech(sockets[0]);
    sockets[0].audio(Buffer.alloc(3_840, 1)); controller.abort(); sockets[0].audio(Buffer.alloc(3_840, 1)); endSpeech(sockets[0]);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); expect(onPcm).toHaveBeenCalledTimes(1); voice.dispose();
  });

  it.each(['missing-start', 'odd-pcm', 'wrong-speech-id', 'no-pcm'])('rejects incomplete Kit stream %s', async cause => {
    const { voice, sockets } = fixture(); const pending = voice.synthesizeStream('Hello there.', new AbortController().signal, () => {}); await flush();
    if (cause === 'missing-start') { sockets[0].open(); sockets[0].json({ type: 'Connected', request_id: 'speech-request', model_name: 'flux-kit-en' }); sockets[0].audio(Buffer.alloc(3_840)); }
    else {
      startSpeech(sockets[0]); if (cause !== 'no-pcm') sockets[0].audio(Buffer.alloc(cause === 'odd-pcm' ? 3 : 3_840));
      endSpeech(sockets[0], cause === 'wrong-speech-id' ? { speech_id: 'another-speech' } : {});
    }
    await expect(pending).rejects.toMatchObject({ code: 'protocol' }); voice.dispose();
  });

  it('rejects silence before opening any paid connection and replays original WAV without forced completion', async () => {
    const { voice, sockets } = fixture(); const silent = wave(); silent.fill(0, 44);
    await expect(voice.transcribe(silent, new AbortController().signal)).rejects.toMatchObject({ name: 'MorpheusNoSpeechError' }); expect(sockets).toHaveLength(0);
    const pending = voice.transcribe(wave(), new AbortController().signal, { model: 'flux-general-en' }); await flush(); sockets[0].open();
    sockets[0].json({ type: 'Connected', request_id: 'request-1', sequence_id: 0 }); await vi.advanceTimersByTimeAsync(160);
    sockets[0].json(flux(1, 'EndOfTurn', { audio_window_end: 0.16 })); await expect(pending).resolves.toBe('Open YouTube.');
    expect(sockets[0].sent.every(Buffer.isBuffer)).toBe(true); voice.dispose();
  });

  it('rejects premature replay final that would discard audible remainder', async () => {
    const { voice, sockets } = fixture(); const pending = voice.transcribe(wave(8_000), new AbortController().signal, { model: 'flux-general-en' }); await flush(); sockets[0].open();
    sockets[0].json({ type: 'Connected', request_id: 'request-1', sequence_id: 0 }); await vi.advanceTimersByTimeAsync(0);
    sockets[0].json(flux(1)); await expect(pending).rejects.toMatchObject({ code: 'protocol' }); voice.dispose();
  });

  it('bounds replay endpoint wait without promoting partial text', async () => {
    const { voice, sockets } = fixture(); const pending = voice.transcribe(wave(), new AbortController().signal, { model: 'flux-general-en' }); const failure = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await flush(); sockets[0].open(); sockets[0].json({ type: 'Connected', request_id: 'request-1', sequence_id: 0 });
    await vi.advanceTimersByTimeAsync(8_500); await failure; expect(sockets[0].terminated).toBe(true); voice.dispose();
  });

  it('connection test admits recognition and verifies actual bounded generated speech without sending microphone audio', async () => {
    const { voice, sockets } = fixture(); const pending = voice.testConnection(); await flush(); sockets[0].open(); await flush();
    expect(sockets[0].sent).toEqual([]); expect(sockets[0].terminated).toBe(true); expect(sockets).toHaveLength(2);
    startSpeech(sockets[1]); sockets[1].audio(Buffer.alloc(3_840)); endSpeech(sockets[1]); await pending; voice.dispose();
  });

  it('dispose cancels all operations and prevents later protected storage/network access', async () => {
    const { voice, sockets } = fixture(); const { session, socket } = await recognition(voice, sockets); voice.dispose();
    await expect(session.result).rejects.toMatchObject({ name: 'AbortError' }); expect(socket.terminated).toBe(true);
    await expect(voice.synthesize('Hello.', new AbortController().signal)).rejects.toMatchObject({ name: 'AbortError' }); expect(sockets).toHaveLength(1);
  });

  it('uses completed Nova3 recording REST without replay delay, exposing only complete validated text', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(recordedResult()), { headers: { 'content-type': 'application/json' } }));
    const createSocket = vi.fn(); const voice = createMorpheusDeepgramVoice({ getKey: () => 'synthetic-test-credential', fetch, createSocket });
    const audio = wave(); await expect(voice.transcribe(audio, new AbortController().signal)).resolves.toBe('Open YouTube.');
    expect(createSocket).not.toHaveBeenCalled(); expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('https://api.deepgram.com/v1/listen?model=nova-3&language=en');
    const args = fetch.mock.calls[0][1]; expect(args).toMatchObject({ method: 'POST', headers: { Authorization: 'Token synthetic-test-credential', 'Content-Type': 'audio/wav' }, redirect: 'error' });
    expect(Buffer.from(args.body as Uint8Array)).toEqual(audio); voice.dispose();
  });

  it.each([
    { metadata: { channels: 2, request_id: 'request-1', duration: 0.16 } },
    { metadata: { channels: 1, request_id: 'request-1', duration: 12 } },
    { results: { channels: [{ alternatives: [{ transcript: 'Open YouTube.', confidence: 2, words: [] }] }] } },
    { results: { channels: [{ alternatives: [{ transcript: 'Open YouTube.', confidence: 0.98, words: [{ word: 'Open', confidence: 0.98, start: 0, end: 3 }] }] }] } },
    { results: { channels: [{ alternatives: [] }] } },
    { results: null },
  ])('rejects malformed completed recording response %j', async overrides => {
    const voice = createMorpheusDeepgramVoice({ getKey: () => 'synthetic-test-credential', fetch: async () =>
      new Response(JSON.stringify(recordedResult(overrides)), { headers: { 'content-type': 'application/json' } }) });
    await expect(voice.transcribeRecorded(wave(), new AbortController().signal)).rejects.toMatchObject({ code: 'protocol' }); voice.dispose();
  });

  it('bounds completed recording response bytes and never surfaces a rejected provider body', async () => {
    const large = createMorpheusDeepgramVoice({ getKey: () => 'synthetic-test-credential', fetch: async () =>
      new Response(' '.repeat(65_537), { headers: { 'content-type': 'application/json' } }) });
    await expect(large.transcribeRecorded(wave(), new AbortController().signal)).rejects.toMatchObject({ code: 'protocol' }); large.dispose();
    const rejected = createMorpheusDeepgramVoice({ getKey: () => 'synthetic-test-credential', fetch: async () =>
      new Response('private diagnostic and echoed credential', { status: 401 }) });
    const error = await rejected.transcribeRecorded(wave(), new AbortController().signal).catch(error => error);
    expect(error).toMatchObject({ code: 'authentication' }); expect(error.message).not.toContain('private'); expect(error.message).not.toContain('echoed'); rejected.dispose();
  });

  it('cancels and times out recording fetch even when a transport does not honor abort', async () => {
    const fetch = vi.fn(() => new Promise<Response>(() => {}));
    const voice = createMorpheusDeepgramVoice({ getKey: () => 'synthetic-test-credential', fetch }); const controller = new AbortController();
    const first = voice.transcribeRecorded(wave(), controller.signal); await flush(); controller.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' }); expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    const pending = voice.transcribeRecorded(wave(), new AbortController().signal); const failure = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(30_001); await failure; voice.dispose();
  });
});
