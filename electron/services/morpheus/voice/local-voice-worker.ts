import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { MORPHEUS_SPEECH_MAX_AUDIO_BYTES, MORPHEUS_SPEECH_MAX_TEXT_CHARS, type MorpheusSpeechVoice } from '@shared/morpheus/voice-types';

interface WorkerOptions {
  executable: string;
  script: string;
  threads: number;
  idleMs?: number;
  operationMs?: number;
}
interface WorkerInstance {
  child: ChildProcess;
  ready: Promise<void>;
  rejectReady(error: Error): void;
  startupTimer: ReturnType<typeof setTimeout>;
  idleTimer?: ReturnType<typeof setTimeout>;
  requested?: boolean;
  active?: { id: string; bytes: number; chunks: number; onPcm(pcm: Buffer): void; finish(error?: Error): void };
}
const cancelled = () => new DOMException('Voice cancelled', 'AbortError');
const unavailable = () => new Error('Included voice engine failed. Retry or repair the Morpheus installation.');

/** One native synthesis worker, lazy and bounded. Only Main supplies fixed paths. */
export function createMorpheusSpeechWorker(options: WorkerOptions) {
  let worker: WorkerInstance | undefined;
  let disposed = false;
  const stop = (current: WorkerInstance, error: Error = cancelled()) => {
    if (worker === current) worker = undefined;
    clearTimeout(current.startupTimer); clearTimeout(current.idleTimer);
    current.rejectReady(error);
    current.active?.finish(error);
    if (!current.child.killed) current.child.kill();
  };
  const armIdle = (current: WorkerInstance) => {
    clearTimeout(current.idleTimer);
    if (worker !== current || current.requested) return;
    current.idleTimer = setTimeout(() => stop(current), options.idleMs ?? 60_000);
    current.idleTimer.unref();
  };
  const get = (): WorkerInstance => {
    if (disposed) throw cancelled();
    if (worker) { clearTimeout(worker.idleTimer); return worker; }
    // No inherited NODE_OPTIONS, provider tokens, or shell. Native code never loads in Electron.
    const child = spawn(options.executable, [options.script, String(options.threads)], {
      windowsHide: true, shell: false, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP },
    });
    let resolveReady!: () => void, rejectReady!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    const current: WorkerInstance = { child, ready, rejectReady, startupTimer: setTimeout(() => stop(current, unavailable()), 30_000) };
    current.startupTimer.unref(); worker = current;
    // A crash can race request dispatch; keep startup rejection handled until its caller awaits.
    void ready.catch(() => undefined);
    child.on('error', () => stop(current, unavailable()));
    child.on('exit', () => stop(current, unavailable()));
    child.on('message', (raw: unknown) => {
      if (worker !== current || !raw || typeof raw !== 'object') return;
      const message = raw as Record<string, unknown>;
      if (message.type === 'ready' && message.protocol === 1 && message.sampleRate === 24000) {
        clearTimeout(current.startupTimer); resolveReady(); armIdle(current); return;
      }
      const active = current.active;
      if (!active || message.id !== active.id) { stop(current, unavailable()); return; }
      if (message.type === 'pcm' && message.sequence === active.chunks && typeof message.audio === 'string'
        && message.audio.length > 0 && message.audio.length <= 65536 && /^[A-Za-z0-9+/]+={0,2}$/.test(message.audio)) {
        const pcm = Buffer.from(message.audio, 'base64');
        active.bytes += pcm.length;
        if (!pcm.length || pcm.length % 2 || active.bytes > MORPHEUS_SPEECH_MAX_AUDIO_BYTES) { stop(current, unavailable()); return; }
        active.chunks += 1;
        try { active.onPcm(pcm); } catch (error) { stop(current, error instanceof Error ? error : unavailable()); }
      } else if (message.type === 'done' && active.bytes > 0 && message.bytes === active.bytes && message.chunks === active.chunks) {
        active.finish(); armIdle(current);
      } else stop(current, unavailable());
    });
    return current;
  };
  return {
    async warm() { const current = get(); await current.ready; armIdle(current); },
    /** Release preparation without interrupting a newer admitted utterance. */
    releaseWarm() { if (worker && !worker.requested) stop(worker); },
    async synthesize(text: string, voice: MorpheusSpeechVoice, signal: AbortSignal, onPcm: (audio: Buffer) => void) {
      if (signal.aborted || disposed) throw cancelled();
      if (!text.trim() || text.length > MORPHEUS_SPEECH_MAX_TEXT_CHARS) throw new Error('Speech text is empty or exceeds the permitted length.');
      const current = get();
      if (current.requested) throw new Error('Included voice is already speaking. Stop it before starting another reply.');
      current.requested = true;
      const abort = () => stop(current);
      signal.addEventListener('abort', abort, { once: true });
      try {
        await current.ready;
        if (signal.aborted || worker !== current) throw cancelled();
        clearTimeout(current.idleTimer);
        await new Promise<void>((resolve, reject) => {
          const id = randomUUID();
          const timer = setTimeout(() => stop(current, new Error('Local voice took too long. Try a shorter sentence.')), options.operationMs ?? 90_000);
          timer.unref();
          current.active = { id, bytes: 0, chunks: 0, onPcm, finish(error) {
            if (current.active?.id !== id) return;
            current.active = undefined; clearTimeout(timer);
            if (error) reject(error); else resolve();
          } };
          current.child.send({ type: 'synthesize', id, text, voice: voice === 'coral' ? 'coral' : 'cedar' }, (error) => { if (error) stop(current, unavailable()); });
        });
      } finally { signal.removeEventListener('abort', abort); current.requested = false; armIdle(current); }
    },
    dispose() { disposed = true; if (worker) stop(worker); },
  };
}
