import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMorpheusRecognizerWorker } from '../../electron/services/morpheus/voice/local-recognizer-worker';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: spawnMock, default: { spawn: spawnMock } }));
class Child extends EventEmitter {
  killed = false;
  kill = vi.fn(() => { this.killed = true; return true; });
  send = vi.fn((_request: unknown, done: (error: Error | null) => void) => { done(null); return true; });
  constructor(readonly session: string) { super(); }
  ready() { this.emit('message', { type: 'ready', protocol: 1, session: this.session, engine: 'sherpa-onnx-1.13.8', sampleRate: 16000 }); }
  result(id: string, text = 'Morpheus, open Notepad.') { this.emit('message', { type: 'result', protocol: 1, session: this.session, id, text }); }
}
const children: Child[] = [];
beforeEach(() => {
  vi.useFakeTimers(); spawnMock.mockReset(); children.length = 0;
  spawnMock.mockImplementation((_exe, args: string[]) => { const child = new Child(args[2]); children.push(child); return child; });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
function wav() {
  const audio = Buffer.alloc(44 + 3200 * 2);
  audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8); audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22); audio.writeUInt32LE(16000, 24); audio.writeUInt32LE(32000, 28);
  audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(audio.length - 44, 40);
  for (let i = 44; i < audio.length; i += 2) audio.writeInt16LE(i % 4 ? 1000 : -1000, i);
  return audio;
}
const create = () => createMorpheusRecognizerWorker({ executable: 'fixed-node.exe', script: 'fixed-asr.cjs', threads: 4, idleMs: 500, operationMs: 1000 });
async function start(worker: ReturnType<typeof create>, signal = new AbortController().signal) {
  const pending = worker.transcribe(wav(), signal);
  const child = children.at(-1)!;
  if (child.send.mock.calls.length === 0) child.ready();
  await Promise.resolve();
  const request = child.send.mock.calls.at(-1)![0] as { id: string; session: string; audio: string };
  return { pending, child, request };
}
describe('bounded included recognizer worker', () => {
  it('is lazy, sends the exact admitted WAV and reuses one model without mixing jobs', async () => {
    const worker = create(); expect(spawnMock).not.toHaveBeenCalled();
    const first = await start(worker);
    expect(Buffer.from(first.request.audio, 'base64')).toEqual(wav());
    first.child.result(first.request.id); expect(await first.pending).toBe('Morpheus, open Notepad.');
    const second = await start(worker);
    expect(second.request.id).not.toBe(first.request.id); expect(second.request.session).toBe(first.request.session);
    second.child.result(second.request.id, '  Preserve R&D Part 1.  '); expect(await second.pending).toBe('Preserve R&D Part 1.');
    expect(spawnMock).toHaveBeenCalledOnce(); worker.dispose();
  });
  it.each(['silence', 'format', 'size'])('rejects %s before starting an engine', async kind => {
    const worker = create(); const audio = kind === 'size' ? Buffer.alloc(44 + 120000 * 32 + 2) : wav();
    if (kind === 'silence') audio.fill(0, 44);
    if (kind === 'format') audio.writeUInt32LE(24000, 24);
    await expect(worker.transcribe(audio, new AbortController().signal)).rejects.toThrow();
    expect(spawnMock).not.toHaveBeenCalled(); worker.dispose();
  });
  it('rejects concurrent admission during loading and decoding without replacing the owner', async () => {
    const worker = create(); const first = worker.transcribe(wav(), new AbortController().signal);
    await expect(worker.transcribe(wav(), new AbortController().signal)).rejects.toThrow('already processing');
    children[0].ready(); await Promise.resolve();
    await expect(worker.transcribe(wav(), new AbortController().signal)).rejects.toThrow('already processing');
    const id = (children[0].send.mock.calls[0][0] as { id: string }).id;
    children[0].result(id); await first; expect(children[0].kill).not.toHaveBeenCalled(); worker.dispose();
  });
  it.each(['loading', 'decoding'])('cancels %s, ignores stale replies and starts a fresh session', async phase => {
    const worker = create(), controller = new AbortController();
    const pending = worker.transcribe(wav(), controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    const old = children[0];
    if (phase === 'decoding') { old.ready(); await Promise.resolve(); }
    controller.abort(); await rejected; expect(old.kill).toHaveBeenCalledOnce();
    const next = await start(worker);
    old.ready(); old.result(next.request.id, 'Stale text.');
    expect(next.request.session).not.toBe(old.session); expect(next.child.kill).not.toHaveBeenCalled();
    next.child.result(next.request.id, 'Current text.'); expect(await next.pending).toBe('Current text.'); worker.dispose();
  });
  it.each(['wrong-session', 'wrong-job', 'unknown-key', 'oversized-text', 'wrong-type', 'replayed-ready', 'crash', 'send-error'])('fails closed on %s', async kind => {
    const worker = create(); const { pending, child, request } = await start(worker);
    const rejected = expect(pending).rejects.toThrow('recognition engine failed');
    const message: Record<string, unknown> = { type: 'result', protocol: 1, session: child.session, id: request.id, text: 'Open Paint.' };
    if (kind === 'wrong-session') message.session = 'unrelated-session';
    if (kind === 'wrong-job') message.id = 'unrelated-job';
    if (kind === 'unknown-key') message.extra = true;
    if (kind === 'oversized-text') message.text = 'A'.repeat(12001);
    if (kind === 'wrong-type') message.text = [];
    if (kind === 'crash') child.emit('exit', 1);
    else if (kind === 'send-error') child.send.mock.calls[0][1](new Error('IPC failed'));
    else if (kind === 'replayed-ready') child.ready();
    else child.emit('message', message);
    await rejected; expect(child.kill).toHaveBeenCalledOnce(); worker.dispose();
  });
  it.each(['model', 'protocol', 'session', 'sample-rate', 'extra'])('requires exact %s readiness before sending audio', async kind => {
    const worker = create(), pending = worker.transcribe(wav(), new AbortController().signal);
    const rejected = expect(pending).rejects.toThrow('recognition engine failed');
    const child = children[0];
    const message: Record<string, unknown> = { type: 'ready', protocol: 1, session: child.session, engine: 'sherpa-onnx-1.13.8', sampleRate: 16000 };
    if (kind === 'model') message.engine = 'other';
    if (kind === 'protocol') message.protocol = 2;
    if (kind === 'session') message.session = 'other';
    if (kind === 'sample-rate') message.sampleRate = 24000;
    if (kind === 'extra') message.diagnostics = 'hidden';
    child.emit('message', message); await rejected; expect(child.send).not.toHaveBeenCalled(); worker.dispose();
  });
  it('bounds startup/decode time and releases idle/disposed models', async () => {
    const worker = create(); const pending = worker.transcribe(wav(), new AbortController().signal);
    const startupFailure = expect(pending).rejects.toThrow('recognition engine failed');
    await vi.advanceTimersByTimeAsync(30000); await startupFailure;
    const decoding = await start(worker); const decodeFailure = expect(decoding.pending).rejects.toThrow('took too long');
    await vi.advanceTimersByTimeAsync(1000); await decodeFailure;
    const good = await start(worker); good.child.result(good.request.id); await good.pending;
    await vi.advanceTimersByTimeAsync(500); expect(good.child.kill).toHaveBeenCalledOnce();
    const final = await start(worker); const cancelled = expect(final.pending).rejects.toMatchObject({ name: 'AbortError' });
    worker.dispose(); await cancelled;
    await expect(worker.transcribe(wav(), new AbortController().signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('keeps the production idle cache for at most sixty seconds after the final job', async () => {
    const worker = createMorpheusRecognizerWorker({ executable: 'fixed-node.exe', script: 'fixed-asr.cjs', threads: 4 });
    const job = await start(worker); job.child.result(job.request.id); await job.pending;
    await vi.advanceTimersByTimeAsync(59999); expect(job.child.kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(job.child.kill).toHaveBeenCalledOnce(); worker.dispose();
  });
  it('releases cached preparation without interrupting a newer admitted recording', async () => {
    const worker = create(), job = await start(worker);
    worker.releaseWarm(); expect(job.child.kill).not.toHaveBeenCalled();
    job.child.result(job.request.id); await job.pending;
    worker.releaseWarm(); expect(job.child.kill).toHaveBeenCalledOnce(); worker.dispose();
  });
  it('never inherits provider tokens or executable switches into the fixed child', async () => {
    const worker = create(), job = await start(worker);
    const [exe, args, options] = spawnMock.mock.calls[0];
    expect(exe).toBe('fixed-node.exe'); expect(args.slice(0, 2)).toEqual(['fixed-asr.cjs', '4']);
    expect(options).toMatchObject({ shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    expect(Object.keys(options.env)).toEqual(['SystemRoot', 'WINDIR', 'TEMP', 'TMP']);
    job.child.result(job.request.id); await job.pending; worker.dispose();
  });
});
