import { hostApi } from './host-api';

type SpeechOptions = {
  neuralAvailable: boolean;
  onSpeakingChange?: (speaking: boolean) => void;
};

let activeAudio: HTMLAudioElement | null = null;
let activeObjectUrl: string | null = null;

function setSpeaking(speaking: boolean, callback?: (speaking: boolean) => void): void {
  callback?.(speaking);
  void hostApi.morpheus.setVoiceSpeaking({ speaking });
}

function releaseAudio(): void {
  if (activeAudio) {
    activeAudio.onplay = null;
    activeAudio.onended = null;
    activeAudio.onerror = null;
    activeAudio.pause();
    activeAudio = null;
  }
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
  }
}

export function stopMorpheusSpeech(callback?: (speaking: boolean) => void): void {
  releaseAudio();
  window.speechSynthesis?.cancel();
  setSpeaking(false, callback);
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = window.atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return buffer;
}

async function playNeuralSpeech(text: string, callback?: (speaking: boolean) => void): Promise<void> {
  const result = await hostApi.morpheus.synthesizeSpeech({ text });
  const audioBuffer = decodeBase64(result.audioBase64);
  activeObjectUrl = URL.createObjectURL(new Blob([audioBuffer], { type: result.mimeType }));
  const audio = new Audio(activeObjectUrl);
  activeAudio = audio;
  await new Promise<void>((resolve, reject) => {
    audio.onplay = () => setSpeaking(true, callback);
    audio.onended = () => {
      setSpeaking(false, callback);
      releaseAudio();
      resolve();
    };
    audio.onerror = () => {
      setSpeaking(false, callback);
      releaseAudio();
      reject(new Error('Neural speech playback failed.'));
    };
    void audio.play().catch(reject);
  });
}

async function playWindowsSpeech(text: string, callback?: (speaking: boolean) => void): Promise<void> {
  if (typeof window.speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
    throw new Error('Speech output is unavailable.');
  }
  await new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onstart = () => setSpeaking(true, callback);
    utterance.onend = () => {
      setSpeaking(false, callback);
      resolve();
    };
    utterance.onerror = () => {
      setSpeaking(false, callback);
      reject(new Error('Windows speech synthesis failed.'));
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

/** Plays ephemeral provider audio and falls back truthfully to Windows speech. */
export async function playMorpheusSpeech(text: string, options: SpeechOptions): Promise<'neural' | 'windows'> {
  stopMorpheusSpeech(options.onSpeakingChange);
  if (options.neuralAvailable) {
    try {
      await playNeuralSpeech(text, options.onSpeakingChange);
      return 'neural';
    } catch {
      releaseAudio();
    }
  }
  await playWindowsSpeech(text, options.onSpeakingChange);
  return 'windows';
}
