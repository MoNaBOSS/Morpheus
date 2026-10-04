import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { availableParallelism } from 'node:os';
import type { MorpheusSpeechVoice } from '@shared/morpheus/voice-types';
import { MORPHEUS_SPEECH_MAX_AUDIO_BYTES, MORPHEUS_SPEECH_MAX_TEXT_CHARS } from '@shared/morpheus/voice-types';
import { localSpeechSegments, localSpeechWav } from './local-speech';
import { createMorpheusSpeechWorker } from './local-voice-worker';
import { validateMorpheusLocalRecording } from './local-input';

export interface MorpheusLocalVoice {
  ready(): boolean;
  transcribe(audio: Buffer, signal: AbortSignal): Promise<string>;
  synthesize(text: string, voice: MorpheusSpeechVoice, signal: AbortSignal): Promise<Buffer>;
  synthesizeStream?(text: string, voice: MorpheusSpeechVoice, signal: AbortSignal, onPcm: (audio: Buffer) => void): Promise<void>;
  warm?(): Promise<void>;
  releaseWarm?(): void;
  dispose?(): void;
}

/** Fixed bundled engines only. No shell/network or saved transcript; synthesis unloads after 60s idle. */
export function createMorpheusLocalVoice(root: string, temporaryRoot: string): MorpheusLocalVoice {
  const asr = join(root, 'bin', 'sherpa-onnx-offline.exe');
  const script = join(root, 'worker', 'morpheus-tts-worker.cjs');
  const executable = [join(root, '..', '..', 'bin', 'node.exe'), join(root, '..', '..', 'resources', 'bin', 'node.exe')].find(existsSync) ?? '';
  const sttRoot = join(root, 'whisper');
  const ttsRoot = join(root, 'kokoro');
  const required = [asr, script, executable,
    join(root, 'worker', 'node_modules', 'sherpa-onnx-node', 'sherpa-onnx.js'),
    join(root, 'worker', 'node_modules', 'sherpa-onnx-node', 'non-streaming-tts.js'),
    join(root, 'worker', 'node_modules', 'sherpa-onnx-win-x64', 'sherpa-onnx.node'),
    join(root, 'worker', 'node_modules', 'sherpa-onnx-win-x64', 'sherpa-onnx-c-api.dll'),
    join(root, 'worker', 'node_modules', 'sherpa-onnx-win-x64', 'onnxruntime.dll'),
    join(sttRoot, 'tiny.en-encoder.int8.onnx'), join(sttRoot, 'tiny.en-decoder.int8.onnx'), join(sttRoot, 'tiny.en-tokens.txt'),
    join(ttsRoot, 'model.int8.onnx'), join(ttsRoot, 'voices.bin'), join(ttsRoot, 'tokens.txt'), join(ttsRoot, 'espeak-ng-data'), join(ttsRoot, 'lexicon-us-en.txt')];
  const ready = () => process.platform === 'win32' && required.every((path) => existsSync(path));
  const worker = createMorpheusSpeechWorker({ executable, script, threads: Math.min(4, availableParallelism()) });
  const subprocessStops = new Set<() => void>();
  const run = (exe: string, args: string[], signal: AbortSignal): Promise<string> => new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Voice cancelled', 'AbortError')); return; }
    const child = spawn(exe, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'ignore'] });
    let output = ''; let settled = false; let stopped: Error | undefined;
    const finish = (error?: Error) => {
      if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort); subprocessStops.delete(abort);
      if (error) reject(error); else resolve(output);
    };
    const abort = () => { stopped = new DOMException('Voice cancelled', 'AbortError'); child.kill(); };
    subprocessStops.add(abort);
    const timer = setTimeout(() => { stopped = new Error('Local voice took too long. Try a shorter sentence.'); child.kill(); }, 90_000);
    timer.unref(); signal.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
      if (output.length > 2_000_000) { stopped = new Error('Local voice returned too much data.'); child.kill(); }
    });
    child.on('error', () => finish(new Error('Included voice engine could not start. Repair the Morpheus installation.')));
    child.on('close', (code) => finish(stopped ?? (code === 0 ? undefined : new Error('Included voice engine failed. Retry or repair the Morpheus installation.'))));
  });
  const temporary = async <T>(signal: AbortSignal, operation: (dir: string) => Promise<T>): Promise<T> => {
    if (!ready()) throw new Error('Included voice files are missing. Repair the Morpheus installation.');
    if (signal.aborted) throw new DOMException('Voice cancelled', 'AbortError');
    await mkdir(temporaryRoot, { recursive: true });
    const dir = await mkdtemp(join(temporaryRoot, 'utterance-'));
    const childPath = relative(temporaryRoot, dir);
    if (!childPath || childPath.startsWith('..')) throw new Error('Invalid voice cleanup path.');
    try { return await operation(dir); }
    finally { await rm(dir, { recursive: true, force: true }); }
  };
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
    transcribe: (audio, signal) => temporary(signal, async (dir) => {
      validateMorpheusLocalRecording(audio);
      const path = join(dir, 'input.wav'); await writeFile(path, audio, { mode: 0o600 });
      const output = await run(asr, ['--debug=0', `--whisper-encoder=${join(sttRoot, 'tiny.en-encoder.int8.onnx')}`,
        `--whisper-decoder=${join(sttRoot, 'tiny.en-decoder.int8.onnx')}`, `--tokens=${join(sttRoot, 'tiny.en-tokens.txt')}`,
        '--whisper-language=en', '--whisper-task=transcribe', '--whisper-tail-paddings=1000', '--num-threads=4', path], signal);
      const lines = output.split(/\r?\n/).reverse();
      for (const line of lines) {
        if (!line.trim().startsWith('{')) continue;
        try { const result = JSON.parse(line) as { text?: unknown }; if (typeof result.text === 'string') return result.text.trim().slice(0, 12_000); } catch { /* Ignore engine diagnostics. */ }
      }
      throw new Error('Local voice returned no transcript. Speak clearly and retry the microphone test.');
    }),
    synthesize,
    synthesizeStream,
    async warm() { assertReady(); await worker.warm(); },
    releaseWarm() { worker.releaseWarm(); },
    dispose() { worker.dispose(); for (const stop of subprocessStops) stop(); },
  };
}
