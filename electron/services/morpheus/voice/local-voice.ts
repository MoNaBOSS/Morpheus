import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { availableParallelism } from 'node:os';
import type { MorpheusSpeechVoice } from '@shared/morpheus/voice-types';
import { MORPHEUS_SPEECH_MAX_AUDIO_BYTES, MORPHEUS_SPEECH_MAX_TEXT_CHARS } from '@shared/morpheus/voice-types';
import { localSpeechSegments, localSpeechWav } from './local-speech';
import { createMorpheusSpeechWorker } from './local-voice-worker';
import { createMorpheusRecognizerWorker } from './local-recognizer-worker';

export interface MorpheusLocalVoice {
  ready(): boolean;
  transcribe(audio: Buffer, signal: AbortSignal): Promise<string>;
  synthesize(text: string, voice: MorpheusSpeechVoice, signal: AbortSignal): Promise<Buffer>;
  synthesizeStream?(text: string, voice: MorpheusSpeechVoice, signal: AbortSignal, onPcm: (audio: Buffer) => void): Promise<void>;
  warm?(): Promise<void>;
  releaseWarm?(): void;
  dispose?(): void;
}

/** Fixed bundled engines only. No shell/network or saved audio/transcript;
 * admitted recognition and synthesis each unload after 60s idle. */
export function createMorpheusLocalVoice(root: string, _temporaryRoot: string): MorpheusLocalVoice {
  const asr = join(root, 'bin', 'sherpa-onnx-offline.exe');
  const script = join(root, 'worker', 'morpheus-tts-worker.cjs');
  const recognitionScript = join(root, 'worker', 'morpheus-asr-worker.cjs');
  const executable = [join(root, '..', '..', 'bin', 'node.exe'), join(root, '..', '..', 'resources', 'bin', 'node.exe')].find(existsSync) ?? '';
  const sttRoot = join(root, 'whisper');
  const ttsRoot = join(root, 'kokoro');
  const required = [asr, script, recognitionScript, executable,
    join(root, 'worker', 'node_modules', 'sherpa-onnx-node', 'sherpa-onnx.js'),
    join(root, 'worker', 'node_modules', 'sherpa-onnx-node', 'non-streaming-tts.js'),
    join(root, 'worker', 'node_modules', 'sherpa-onnx-node', 'non-streaming-asr.js'),
    join(root, 'worker', 'node_modules', 'sherpa-onnx-win-x64', 'sherpa-onnx.node'),
    join(root, 'worker', 'node_modules', 'sherpa-onnx-win-x64', 'sherpa-onnx-c-api.dll'),
    join(root, 'worker', 'node_modules', 'sherpa-onnx-win-x64', 'onnxruntime.dll'),
    join(sttRoot, 'tiny.en-encoder.int8.onnx'), join(sttRoot, 'tiny.en-decoder.int8.onnx'), join(sttRoot, 'tiny.en-tokens.txt'),
    join(ttsRoot, 'model.int8.onnx'), join(ttsRoot, 'voices.bin'), join(ttsRoot, 'tokens.txt'), join(ttsRoot, 'espeak-ng-data'), join(ttsRoot, 'lexicon-us-en.txt')];
  const ready = () => process.platform === 'win32' && required.every((path) => existsSync(path));
  const worker = createMorpheusSpeechWorker({ executable, script, threads: Math.min(4, availableParallelism()) });
  const recognizer = createMorpheusRecognizerWorker({ executable, script: recognitionScript, threads: 4 });
  const assertReady = () => { if (!ready()) throw new Error('Included voice files are missing. Repair the Morpheus installation.'); };
  const synthesizeStream = async (text: string, voice: MorpheusSpeechVoice, signal: AbortSignal, onPcm: (pcm: Buffer) => void) => {
    assertReady();
    if (!text.trim() || text.length > MORPHEUS_SPEECH_MAX_TEXT_CHARS) throw new Error('Speech text is empty or exceeds the permitted length.');
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
    let bytes = 0, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 90_000); timer.unref();
    try {
      for (const segment of localSpeechSegments(text)) {
        await worker.synthesize(segment, voice, controller.signal, pcm => {
          bytes += pcm.length;
          if (bytes > MORPHEUS_SPEECH_MAX_AUDIO_BYTES) throw new Error('Local voice returned too much audio.');
          onPcm(pcm);
        });
      }
    } catch (error) {
      if (timedOut) throw new Error('Local voice took too long. Try a shorter sentence.', { cause: error });
      throw error;
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
  };
  const synthesize = async (text: string, voice: MorpheusSpeechVoice, signal: AbortSignal) => {
    const parts: Buffer[] = [];
    await synthesizeStream(text, voice, signal, pcm => parts.push(pcm));
    return localSpeechWav(Buffer.concat(parts));
  };
  return {
    ready,
    transcribe: async (audio, signal) => { assertReady(); return recognizer.transcribe(audio, signal); },
    synthesize,
    synthesizeStream,
    async warm() { assertReady(); await worker.warm(); },
    releaseWarm() { worker.releaseWarm(); recognizer.releaseWarm(); },
    dispose() { worker.dispose(); recognizer.dispose(); },
  };
}
