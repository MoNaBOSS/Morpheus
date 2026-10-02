import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { MorpheusSpeechVoice } from '@shared/morpheus/voice-types';

export interface MorpheusLocalVoice {
  ready(): boolean;
  transcribe(audio: Buffer, signal: AbortSignal): Promise<string>;
  synthesize(text: string, voice: MorpheusSpeechVoice, signal: AbortSignal): Promise<Buffer>;
}

/** Fixed bundled executables only. No shell, network, persistent transcript or idle worker. */
export function createMorpheusLocalVoice(root: string, temporaryRoot: string): MorpheusLocalVoice {
  const asr = join(root, 'bin', 'sherpa-onnx-offline.exe');
  const tts = join(root, 'bin', 'sherpa-onnx-offline-tts.exe');
  const sttRoot = join(root, 'whisper');
  const ttsRoot = join(root, 'kokoro');
  const required = [asr, tts,
    join(sttRoot, 'tiny.en-encoder.int8.onnx'), join(sttRoot, 'tiny.en-decoder.int8.onnx'), join(sttRoot, 'tiny.en-tokens.txt'),
    join(ttsRoot, 'model.int8.onnx'), join(ttsRoot, 'voices.bin'), join(ttsRoot, 'tokens.txt'), join(ttsRoot, 'espeak-ng-data')];
  const ready = () => process.platform === 'win32' && required.every((path) => existsSync(path));
  const run = (exe: string, args: string[], signal: AbortSignal): Promise<string> => new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Voice cancelled', 'AbortError')); return; }
    const child = spawn(exe, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'ignore'] });
    let output = ''; let settled = false; let stopped: Error | undefined;
    const finish = (error?: Error) => {
      if (settled) return; settled = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(output);
    };
    const abort = () => { stopped = new DOMException('Voice cancelled', 'AbortError'); child.kill(); };
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
  return {
    ready,
    transcribe: (audio, signal) => temporary(signal, async (dir) => {
      // Canonical WAV is produced by the existing renderer capture converter.
      if (audio.length < 44 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE'
        || audio.readUInt16LE(20) !== 1 || audio.readUInt16LE(22) !== 1 || audio.readUInt32LE(24) !== 16000
        || audio.readUInt16LE(34) !== 16 || audio.toString('ascii', 36, 40) !== 'data'
        || audio.readUInt32LE(40) !== audio.length - 44) throw new Error('Local voice needs a valid mono 16 kHz recording. Retry the microphone test.');
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
    synthesize: (text, voice, signal) => temporary(signal, async (dir) => {
      const path = join(dir, 'reply.wav');
      await run(tts, ['--debug=0', `--kokoro-model=${join(ttsRoot, 'model.int8.onnx')}`, `--kokoro-voices=${join(ttsRoot, 'voices.bin')}`,
        `--kokoro-tokens=${join(ttsRoot, 'tokens.txt')}`, `--kokoro-data-dir=${join(ttsRoot, 'espeak-ng-data')}`,
        `--kokoro-lexicon=${join(ttsRoot, 'lexicon-us-en.txt')}`, '--num-threads=4', `--sid=${voice === 'coral' ? 3 : 16}`,
        `--output-filename=${path}`, text], signal);
      const audio = await readFile(path);
      if (audio.length < 44 || audio.length > 20_000_000 || audio.toString('ascii', 0, 4) !== 'RIFF') throw new Error('Local voice returned invalid audio.');
      return audio;
    }),
  };
}
