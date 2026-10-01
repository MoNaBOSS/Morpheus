import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMorpheusPcmPlayback } from '@/lib/morpheus-pcm-playback';
import { subscribeMorpheusAudioLevel } from '@/lib/morpheus-audio-level';

class Context {
  static latest: Context;
  state = 'running'; currentTime = 0; destination = {};
  analyser = { fftSize: 512, connect: vi.fn(), disconnect: vi.fn(), getByteTimeDomainData: (samples: Uint8Array) => samples.fill(140) };
  buffers: Float32Array[] = [];
  sources: Array<{ onended: (() => void) | null; buffer: unknown; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn> }> = [];
  resume = vi.fn(async () => { this.state = 'running'; }); close = vi.fn(async () => { this.state = 'closed'; });
  constructor() { Context.latest = this; }
  createAnalyser() { return this.analyser; }
  createBuffer(_channels: number, length: number, rate: number) {
    const value = new Float32Array(length); this.buffers.push(value);
    return { duration: length / rate, getChannelData: () => value };
  }
  createBufferSource() {
    const source = { onended: null as (() => void) | null, buffer: null as unknown,
      connect: vi.fn(), disconnect: vi.fn(), stop: vi.fn(), start: vi.fn() };
    this.sources.push(source); return source;
  }
}
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('AudioContext', Context); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('bounded PCM output at the existing speech owner', () => {
  it('joins split samples, schedules contiguous chunks, meters actual playing data and releases on completion', async () => {
    const speaking = vi.fn(), levels = vi.fn(), unsubscribe = subscribeMorpheusAudioLevel(levels);
    const player = createMorpheusPcmPlayback(speaking), context = Context.latest;
    player.push(new Uint8Array([0, 64, 0])); player.push(new Uint8Array([128, 255, 127])); await player.finish();
    expect([...context.buffers[0], ...context.buffers[1]]).toEqual([0.5, -1, 32767 / 32768]);
    expect(context.sources[0].start).toHaveBeenCalledWith(0.02);
    expect(context.sources[1].start).toHaveBeenCalledWith(0.02 + 1 / 24000);
    context.currentTime = 0.03; await vi.advanceTimersByTimeAsync(50);
    expect(speaking).toHaveBeenCalledWith(true); expect(levels.mock.calls.some(([value]) => value > 0)).toBe(true);
    for (const source of context.sources) source.onended?.(); await player.completed;
    await vi.advanceTimersByTimeAsync(50);
    expect(speaking).toHaveBeenLastCalledWith(false); expect(context.close).toHaveBeenCalledOnce(); expect(levels).toHaveBeenLastCalledWith(0); expect(vi.getTimerCount()).toBe(0);
    unsubscribe();
  });
  it('cancellation during resume prevents late playback', async () => {
    const player = createMorpheusPcmPlayback(vi.fn()), context = Context.latest; context.state = 'suspended';
    let resume!: () => void; context.resume.mockImplementation(() => new Promise<void>((resolve) => { resume = resolve; }));
    player.push(new Uint8Array([0, 0])); await Promise.resolve(); player.dispose(); resume(); await player.finish(); await player.completed;
    expect(context.sources).toHaveLength(0); expect(context.close).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['empty', 'odd', 'oversized', 'resume-failure'])('rejects %s without leaving nodes/timers alive', async (kind) => {
    const player = createMorpheusPcmPlayback(vi.fn()), context = Context.latest;
    if (kind === 'resume-failure') { context.state = 'suspended'; context.resume.mockRejectedValue(new Error('unavailable')); }
    const rejected = expect(player.completed).rejects.toThrow();
    if (kind !== 'empty') player.push(new Uint8Array(kind === 'odd' ? 1 : kind === 'oversized' ? 8 * 1024 * 1024 + 1 : 2));
    await player.finish(); await rejected;
    expect(context.close).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
});
