import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMorpheusSpeechWorker } from '../../electron/services/morpheus/voice/local-voice-worker';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: spawnMock, default: { spawn: spawnMock } }));

class Child extends EventEmitter {
  killed = false;
  kill = vi.fn(() => { this.killed = true; return true; });
  send = vi.fn((_request: unknown, done: (error: Error | null) => void) => { done(null); return true; });
  ready() { this.emit('message', { type: 'ready', protocol: 1, sampleRate: 24000 }); }
  pcm(id: string, sequence = 0) { this.emit('message', { type: 'pcm', id, sequence, audio: Buffer.from([0, 32, 0, 64]).toString('base64') }); }
  done(id: string) { this.emit('message', { type: 'done', id, bytes: 4, chunks: 1 }); }
}
const children: Child[] = [];
beforeEach(() => {
  vi.useFakeTimers(); spawnMock.mockReset(); children.length = 0;
  spawnMock.mockImplementation(() => { const child = new Child(); children.push(child); return child; });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
const create = () => createMorpheusSpeechWorker({ executable: 'fixed-node.exe', script: 'fixed-worker.cjs', threads: 4, idleMs: 500, operationMs: 1000 });
async function start(worker: ReturnType<typeof create>, onPcm = vi.fn(), signal = new AbortController().signal) {
  const pending = worker.synthesize('Open YouTube.', 'cedar', signal, onPcm);
  children.at(-1)!.ready(); await Promise.resolve();
  const child = children.at(-1)!;
  const request = child.send.mock.calls.at(-1)![0] as { id: string };
  return { pending, child, id: request.id, onPcm };
}

describe('bounded included synthesis worker', () => {
  it('reuses one warmed process across replies, streams PCM, and unloads on idle', async () => {
    const worker = create(), warming = worker.warm();
    children[0].ready(); await warming;
    for (let i = 0; i < 2; i++) {
      const { pending, child, id, onPcm } = await start(worker);
      child.pcm(id); child.done(id); await pending;
      expect(onPcm).toHaveBeenCalledWith(Buffer.from([0, 32, 0, 64]));
    }
    expect(spawnMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(children[0].kill).toHaveBeenCalledOnce();
    const next = worker.warm(); children[1].ready(); await next;
    expect(spawnMock).toHaveBeenCalledTimes(2); worker.dispose();
  });
  it('kills an interrupted generation and ignores every stale PCM message', async () => {
    const worker = create(), controller = new AbortController();
    const { pending, child, id, onPcm } = await start(worker, vi.fn(), controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    child.pcm(id); controller.abort(); child.pcm(id, 1); await rejected;
    expect(child.kill).toHaveBeenCalledOnce(); expect(onPcm).toHaveBeenCalledTimes(1);
    const next = await start(worker); next.child.pcm(next.id); next.child.done(next.id); await next.pending;
    worker.dispose();
  });
  it('rejects concurrent admission while the engine is still loading', async () => {
    const worker = create(), signal = new AbortController().signal;
    const first = worker.synthesize('First.', 'cedar', signal, vi.fn());
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await expect(worker.synthesize('Second.', 'cedar', signal, vi.fn())).rejects.toThrow('already speaking');
    worker.dispose(); await rejected;
  });
  it.each(['wrong-count', 'out-of-order', 'oversized', 'crash'])('fails closed for %s and releases the native process', async kind => {
    const worker = create(), { pending, child, id } = await start(worker);
    const rejected = expect(pending).rejects.toThrow('Included voice engine failed');
    if (kind === 'wrong-count') child.done(id);
    if (kind === 'out-of-order') child.pcm(id, 2);
    if (kind === 'oversized') child.emit('message', { type: 'pcm', id, sequence: 0, audio: 'A'.repeat(65540) });
    if (kind === 'crash') child.emit('exit', 1);
    await rejected; expect(child.kill).toHaveBeenCalledOnce(); worker.dispose();
  });
  it('bounds generation time and disposes without an idle orphan', async () => {
    const worker = create(), { pending, child } = await start(worker);
    const rejected = expect(pending).rejects.toThrow('took too long');
    await vi.advanceTimersByTimeAsync(1000); await rejected;
    expect(child.kill).toHaveBeenCalledOnce(); worker.dispose();
    await expect(worker.warm()).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('does not inherit NODE_OPTIONS or a provider secret into the isolated engine', async () => {
    const worker = create(), warming = worker.warm(); children[0].ready(); await warming;
    const args = spawnMock.mock.calls[0];
    expect(args.slice(0, 2)).toEqual(['fixed-node.exe', ['fixed-worker.cjs', '4']]);
    expect(args[2]).toMatchObject({ shell: false, windowsHide: true });
    expect(Object.keys(args[2].env)).toEqual(['SystemRoot', 'WINDIR', 'TEMP', 'TMP']); worker.dispose();
  });
});
