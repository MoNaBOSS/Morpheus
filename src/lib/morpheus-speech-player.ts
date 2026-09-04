import { hostApi } from './host-api';

type SpeechOptions = {
  neuralAvailable: boolean;
  onSpeakingChange?: (speaking: boolean) => void;
};
type SpeechResult = 'neural' | 'windows' | 'cancelled';
let generation = 0;
let activeAudio: HTMLAudioElement | null = null;
let activeObjectUrl: string | null = null;
let cancelPlayback: (() => void) | null = null;
let cancelRequest: (() => void) | null = null;
let activeCallback: SpeechOptions['onSpeakingChange'];

function setSpeaking(speaking: boolean, callback = activeCallback): void {
  callback?.(speaking);
  void Promise.resolve(hostApi.morpheus.setVoiceSpeaking({ speaking })).catch(() => undefined);
}

function releaseAudio(): void {
  if (activeAudio) {
    activeAudio.onplay = null;
    activeAudio.onended = null;
    activeAudio.onerror = null;
    activeAudio.pause();
    activeAudio = null;
  }
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
  activeObjectUrl = null;
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

async function playNeuralSpeech(text: string, id: number): Promise<void> {
  const result = await hostApi.morpheus.synthesizeSpeech({ text });
  if (id !== generation) return;
  activeObjectUrl = URL.createObjectURL(new Blob([decodeBase64(result.audioBase64)], { type: result.mimeType }));
  const audio = new Audio(activeObjectUrl);
  activeAudio = audio;
  await new Promise<void>((resolve, reject) => {
    cancelPlayback = resolve;
    audio.onplay = () => { if (id === generation) setSpeaking(true); };
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
  await new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
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
  stopMorpheusSpeech();
  const id = generation;
  activeCallback = options.onSpeakingChange;
  const cancelled = new Promise<SpeechResult>((resolve) => { cancelRequest = () => resolve('cancelled'); });
  const play = async (): Promise<SpeechResult> => {
    if (options.neuralAvailable) {
      try {
        await playNeuralSpeech(text, id);
        return id === generation ? 'neural' : 'cancelled';
      } catch {
        if (id !== generation) return 'cancelled';
        releaseAudio();
        cancelPlayback = null;
        setSpeaking(false);
      }
    }
    if (id !== generation) return 'cancelled';
    await playWindowsSpeech(text, id);
    return id === generation ? 'windows' : 'cancelled';
  };
  try {
    return await Promise.race([play(), cancelled]);
  } finally {
    if (id === generation) { cancelRequest = null; activeCallback = undefined; }
  }
}
