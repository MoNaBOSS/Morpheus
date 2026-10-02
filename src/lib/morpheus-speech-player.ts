import { hostApi } from './host-api';
import { meterMorpheusPlayback } from './morpheus-audio-level';
import { createMorpheusSpeechStream } from './morpheus-speech-stream';
import { createMorpheusPcmPlayback } from './morpheus-pcm-playback';
import { hostEvents } from './host-events';
import { resolveMorpheusWindowsVoice } from './morpheus-windows-voice';

type SpeechOptions = {
  format?: 'pcm24' | 'wav';
  neuralAvailable: boolean;
  /** Setup previews should not surprise the user with a robotic fallback. */
  allowWindowsFallback?: boolean;
  /** Cancels only this utterance, never a newer reply that superseded it. */
  signal?: AbortSignal;
  onSpeakingChange?: (speaking: boolean) => void;
};
type SpeechResult = 'neural' | 'windows' | 'cancelled';
let generation = 0;
let activeAudio: HTMLAudioElement | null = null;
let activeObjectUrl: string | null = null;
let cancelPlayback: (() => void) | null = null;
let cancelRequest: (() => void) | null = null;
let activeCallback: SpeechOptions['onSpeakingChange'];
let disposeStream: (() => void) | null = null;
let stopPlaybackMeter: (() => void) | null = null;

function setSpeaking(speaking: boolean, callback = activeCallback): void {
  callback?.(speaking);
  void Promise.resolve(hostApi.morpheus.setVoiceSpeaking({ speaking })).catch(() => undefined);
}

function releaseAudio(): void {
  stopPlaybackMeter?.();
  stopPlaybackMeter = null;
  disposeStream?.();
  disposeStream = null;
  if (activeAudio) {
    activeAudio.onplay = null;
    activeAudio.onplaying = null;
    activeAudio.onended = null;
    activeAudio.onerror = null;
    activeAudio.pause();
    activeAudio = null;
  }
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
  activeObjectUrl = null;
}

function startPlaybackMeter(audio: HTMLAudioElement, id: number): void {
  if (id !== generation || stopPlaybackMeter) return;
  stopPlaybackMeter = meterMorpheusPlayback(audio);
}

export function stopMorpheusSpeech(callback?: SpeechOptions['onSpeakingChange']): void {
  generation += 1;
  void Promise.resolve(hostApi.morpheus.cancelSpeech()).catch(() => undefined);
  releaseAudio();
  cancelPlayback?.();
  cancelPlayback = null;
  cancelRequest?.();
  cancelRequest = null;
  window.speechSynthesis?.cancel();
  setSpeaking(false);
  if (callback && callback !== activeCallback) callback(false);
  activeCallback = undefined;
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = window.atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return buffer;
}

async function playNeuralSpeech(text: string, id: number, format?: 'pcm24' | 'wav'): Promise<void> {
  if (format === 'pcm24') {
    const streamId = crypto.randomUUID();
    const player = createMorpheusPcmPlayback((speaking) => { if (id === generation) setSpeaking(speaking); });
    let sequence = 0, received = 0;
    let streamError: Error | undefined;
    let rejectStream!: (error: Error) => void;
    const failed = new Promise<never>((_resolve, reject) => { rejectStream = reject; });
    void failed.catch(() => undefined);
    const unsubscribe = hostEvents.onMorpheusSpeechChunk((chunk) => {
      if (id !== generation || chunk.streamId !== streamId) return;
      try {
        if (chunk.mimeType !== 'audio/pcm' || chunk.sequence !== sequence++ || chunk.audioBase64.length > 65536) throw new Error('Invalid PCM speech sequence.');
        const bytes = new Uint8Array(decodeBase64(chunk.audioBase64)); received += bytes.length; player.push(bytes);
      } catch { streamError = new Error('Managed speech stream is invalid.'); rejectStream(streamError); player.dispose(); }
    });
    let settleCancel!: () => void;
    const cancelled = new Promise<void>((resolve) => { settleCancel = resolve; });
    disposeStream = () => { unsubscribe(); player.dispose(); };
    cancelPlayback = () => { player.dispose(); settleCancel(); };
    const timer = window.setTimeout(() => { rejectStream(new Error('Speech playback timed out.')); player.dispose(); }, 180_000);
    try {
      const request = hostApi.morpheus.synthesizeSpeech({ text, streamId }).then(async (result) => {
        if (id !== generation) return;
        if (streamError) throw streamError;
        if (result.mimeType !== 'audio/pcm') throw new Error('Speech format changed.');
        if (!received) player.push(new Uint8Array(decodeBase64(result.audioBase64)));
        await player.finish();
      });
      await Promise.race([Promise.all([request, player.completed]), failed, cancelled]);
    } finally {
      window.clearTimeout(timer); unsubscribe(); player.dispose();
      if (id === generation) { setSpeaking(false); releaseAudio(); cancelPlayback = null; }
    }
    return;
  }
  if (format !== 'wav' && typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported('audio/mpeg')) {
    const streamId = crypto.randomUUID();
    let fail!: (error: Error) => void;
    let done!: () => void;
    const playback = new Promise<void>((resolve, reject) => { done = resolve; fail = reject; });
    // Attach rejection handling before provider preflight can yield.
    void playback.catch(() => undefined);
    const stream = createMorpheusSpeechStream(streamId, fail);
    disposeStream = stream.dispose;
    const audio = new Audio(stream.url);
    activeAudio = audio;
    let settleCancel!: () => void;
    const cancelled = new Promise<void>((resolve) => { settleCancel = resolve; });
    cancelPlayback = () => { done(); settleCancel(); };
    audio.onplaying = () => {
      if (id !== generation) return;
      setSpeaking(true);
      startPlaybackMeter(audio, id);
    };
    audio.onended = () => {
      if (id === generation) {
        stopPlaybackMeter?.();
        stopPlaybackMeter = null;
        setSpeaking(false);
      }
      done();
    };
    audio.onerror = () => fail(new Error('Streaming speech playback failed.'));
    const timeout = window.setTimeout(() => fail(new Error('Speech playback timed out.')), 90_000);
    try {
      void audio.play().catch(fail);
      const request = hostApi.morpheus.synthesizeSpeech({ text, streamId }).then((result) => {
        if (result.mimeType !== 'audio/mpeg') throw new Error('Speech format changed.');
        if (id === generation) stream.finish(result.audioBase64);
      });
      await Promise.race([Promise.all([request, playback]), cancelled]);
    } finally {
      window.clearTimeout(timeout);
      if (id === generation) { setSpeaking(false); releaseAudio(); cancelPlayback = null; }
    }
    return;
  }
  const result = await hostApi.morpheus.synthesizeSpeech({ text });
  if (id !== generation) return;
  if (result.mimeType !== (format === 'wav' ? 'audio/wav' : 'audio/mpeg')) throw new Error('Speech format changed.');
  activeObjectUrl = URL.createObjectURL(new Blob([decodeBase64(result.audioBase64)], { type: result.mimeType }));
  const audio = new Audio(activeObjectUrl);
  activeAudio = audio;
  await new Promise<void>((resolve, reject) => {
    cancelPlayback = resolve;
    audio.onplay = () => { if (id === generation) setSpeaking(true); };
    audio.onplaying = () => startPlaybackMeter(audio, id);
    audio.onended = () => {
      if (id === generation) {
        setSpeaking(false);
        releaseAudio();
        cancelPlayback = null;
      }
      resolve();
    };
    audio.onerror = () => reject(new Error('Neural speech playback failed.'));
    void audio.play().catch(reject);
  });
}

async function playWindowsSpeech(text: string, id: number): Promise<void> {
  if (id !== generation) return;
  if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
    throw new Error('Speech output is unavailable.');
  }
  const voice = await resolveMorpheusWindowsVoice(window.speechSynthesis);
  if (id !== generation) return;
  await new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    if (voice) utterance.voice = voice;
    utterance.rate = 0.98;
    utterance.pitch = 0.96;
    utterance.volume = 1;
    cancelPlayback = () => {
      utterance.onstart = null;
      utterance.onend = null;
      utterance.onerror = null;
      resolve();
    };
    utterance.onstart = () => { if (id === generation) setSpeaking(true); };
    utterance.onend = () => {
      if (id === generation) { setSpeaking(false); cancelPlayback = null; }
      resolve();
    };
    utterance.onerror = () => {
      if (id === generation) { setSpeaking(false); cancelPlayback = null; }
      reject(new Error('Windows speech synthesis failed.'));
    };
    window.speechSynthesis.speak(utterance);
  });
}

/** Stop settles immediately; stale provider results can never play or fall back. */
export async function playMorpheusSpeech(text: string, options: SpeechOptions): Promise<SpeechResult> {
  if (options.signal?.aborted) return 'cancelled';
  stopMorpheusSpeech();
  const id = generation;
  const abort = () => { if (id === generation) stopMorpheusSpeech(); };
  options.signal?.addEventListener('abort', abort, { once: true });
  activeCallback = options.onSpeakingChange;
  const cancelled = new Promise<SpeechResult>((resolve) => { cancelRequest = () => resolve('cancelled'); });
  const play = async (): Promise<SpeechResult> => {
    if (options.neuralAvailable) {
      try {
        await playNeuralSpeech(text, id, options.format);
        return id === generation ? 'neural' : 'cancelled';
      } catch {
        if (id !== generation) return 'cancelled';
        // Playback can fail before streaming generation completes. Do not leave
        // a paid provider request running behind the local fallback.
        void Promise.resolve(hostApi.morpheus.cancelSpeech()).catch(() => undefined);
        releaseAudio();
        cancelPlayback = null;
        setSpeaking(false);
        if (options.allowWindowsFallback === false || options.format === 'pcm24' || options.format === 'wav') throw new Error('Natural speech is unavailable.');
      }
    }
    if (id !== generation) return 'cancelled';
    if (options.allowWindowsFallback === false || options.format === 'pcm24' || options.format === 'wav') throw new Error('Natural speech is unavailable.');
    await playWindowsSpeech(text, id);
    return id === generation ? 'windows' : 'cancelled';
  };
  try {
    return await Promise.race([play(), cancelled]);
  } finally {
    options.signal?.removeEventListener('abort', abort);
    if (id === generation) { cancelRequest = null; activeCallback = undefined; }
  }
}
