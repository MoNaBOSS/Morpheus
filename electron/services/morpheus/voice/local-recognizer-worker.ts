import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { MORPHEUS_VOICE_MAX_DURATION_MS } from '@shared/morpheus/voice-types';
import { validateMorpheusLocalRecording } from './local-input';

interface RecognizerOptions {
  executable: string;
  script: string;
  threads: number;
  idleMs?: number;
  operationMs?: number;
}
interface RecognizerInstance {
  child: ChildProcess;
  session: string;
  ready: Promise<void>;
  rejectReady(error: Error): void;
  startupTimer: ReturnType<typeof setTimeout>;
  idleTimer?: ReturnType<typeof setTimeout>;
  requested?: boolean;
  initialized?: boolean;
  active?: { id: string; finish(error?: Error, text?: string): void };
}
const MAX_WAV_BYTES = 44 + MORPHEUS_VOICE_MAX_DURATION_MS * 32;
const cancelled = () => new DOMException('Voice cancelled', 'AbortError');
const unavailable = () => new Error('Included recognition engine failed. Retry or repair the Morpheus installation.');
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length
  && keys.every(key => Object.hasOwn(value, key));

/** One lazy recognizer. Main supplies only an admitted, bounded canonical WAV;
 * native inference and model lifetime stay in the owned child, outside Electron. */
export function createMorpheusRecognizerWorker(options: RecognizerOptions) {
  let worker: RecognizerInstance | undefined;
  let disposed = false;
  const stop = (current: RecognizerInstance, error: Error = cancelled()) => {
    if (worker === current) worker = undefined;
    clearTimeout(current.startupTimer); clearTimeout(current.idleTimer);
    current.rejectReady(error); current.active?.finish(error);
    if (!current.child.killed) current.child.kill();
  };
  const armIdle = (current: RecognizerInstance) => {
    clearTimeout(current.idleTimer);
    if (worker !== current || current.requested) return;
    current.idleTimer = setTimeout(() => stop(current), options.idleMs ?? 60_000);
    current.idleTimer.unref();
  };
  const get = (): RecognizerInstance => {
    if (disposed) throw cancelled();
    if (worker) { clearTimeout(worker.idleTimer); return worker; }
    const session = randomUUID();
    const child = spawn(options.executable, [options.script, String(options.threads), session], {
      windowsHide: true, shell: false, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP },
    });
    let resolveReady!: () => void, rejectReady!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    const current: RecognizerInstance = { child, session, ready, rejectReady,
      startupTimer: setTimeout(() => stop(current, unavailable()), 30_000) };
    current.startupTimer.unref(); worker = current;
    void ready.catch(() => undefined);
    child.on('error', () => stop(current, unavailable()));
    child.on('exit', () => stop(current, unavailable()));
    child.on('message', (raw: unknown) => {
      if (worker !== current) return;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { stop(current, unavailable()); return; }
      const message = raw as Record<string, unknown>;
      if (message.protocol !== 1 || message.session !== current.session) { stop(current, unavailable()); return; }
      if (!current.initialized && message.type === 'ready' && exactKeys(message, ['type', 'protocol', 'session', 'engine', 'sampleRate'])
        && message.engine === 'sherpa-onnx-1.13.8' && message.sampleRate === 16000) {
        current.initialized = true; clearTimeout(current.startupTimer); resolveReady(); armIdle(current); return;
      }
      const active = current.active;
      if (!active || message.id !== active.id || message.type !== 'result'
        || !exactKeys(message, ['type', 'protocol', 'session', 'id', 'text'])
        || typeof message.text !== 'string' || message.text.length > 12_000) { stop(current, unavailable()); return; }
      active.finish(undefined, message.text.trim());
    });
    return current;
  };
  return {
    /** No preparation API: idle wake monitoring must never start recognition. */
    async transcribe(audio: Buffer, signal: AbortSignal): Promise<string> {
      if (signal.aborted || disposed) throw cancelled();
      if (audio.length > MAX_WAV_BYTES) throw new Error('Local voice recording exceeds its permitted duration.');
      validateMorpheusLocalRecording(audio);
      const current = get();
      if (current.requested) throw new Error('Included recognition is already processing a recording. Stop it before retrying.');
      current.requested = true;
      const abort = () => stop(current);
      signal.addEventListener('abort', abort, { once: true });
      try {
        await current.ready;
        if (signal.aborted || worker !== current) throw cancelled();
        clearTimeout(current.idleTimer);
        return await new Promise<string>((resolve, reject) => {
          const id = randomUUID();
          const timer = setTimeout(() => stop(current, new Error('Local voice took too long. Try a shorter sentence.')), options.operationMs ?? 90_000);
          timer.unref();
          current.active = { id, finish(error, text) {
            if (current.active?.id !== id) return;
            current.active = undefined; clearTimeout(timer);
            if (error) reject(error); else resolve(text!);
          } };
          current.child.send({ type: 'transcribe', protocol: 1, session: current.session, id, audio: audio.toString('base64') },
            error => { if (error) stop(current, unavailable()); });
        });
      } finally { signal.removeEventListener('abort', abort); current.requested = false; armIdle(current); }
    },
    releaseWarm() { if (worker && !worker.requested) stop(worker); },
    dispose() { disposed = true; if (worker) stop(worker); },
  };
}
