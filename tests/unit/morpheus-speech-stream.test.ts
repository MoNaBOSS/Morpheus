import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MorpheusSpeechChunk } from '@shared/morpheus/voice-types';
const mocks = vi.hoisted(() => ({ receive: null as null | ((chunk: MorpheusSpeechChunk) => void), unsubscribe: vi.fn() }));
vi.mock('@/lib/host-events', () => ({ hostEvents: {
  onMorpheusSpeechChunk: (handler: typeof mocks.receive) => { mocks.receive = handler; return mocks.unsubscribe; },
} }));
import { createMorpheusSpeechStream } from '@/lib/morpheus-speech-stream';

class FakeBuffer extends EventTarget { updating = false; appendBuffer = vi.fn(); }
class FakeSource extends EventTarget {
  static latest: FakeSource;
  readyState = 'open';
  buffer = new FakeBuffer();
  addSourceBuffer = vi.fn(() => this.buffer);
  endOfStream = vi.fn();
  constructor() { super(); FakeSource.latest = this; }
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); mocks.unsubscribe.mockClear(); });
describe('bounded ephemeral streaming playback', () => {
  it('buffers early chunks, rejects unrelated streams, and ends after draining', () => {
    vi.stubGlobal('MediaSource', FakeSource);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const error = vi.fn();
    const stream = createMorpheusSpeechStream('one', error);
    mocks.receive?.({ streamId: 'old', sequence: 0, audioBase64: 'AAAA' });
    mocks.receive?.({ streamId: 'one', sequence: 0, audioBase64: 'AQID' });
    expect(FakeSource.latest.buffer.appendBuffer).not.toHaveBeenCalled();
    FakeSource.latest.dispatchEvent(new Event('sourceopen'));
    expect(FakeSource.latest.buffer.appendBuffer).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
    stream.finish('AQID');
    expect(FakeSource.latest.endOfStream).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
    stream.dispose();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });
  it('rejects out-of-order chunks without appending them', () => {
    vi.stubGlobal('MediaSource', FakeSource);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const error = vi.fn();
    const stream = createMorpheusSpeechStream('one', error);
    mocks.receive?.({ streamId: 'one', sequence: 1, audioBase64: 'AQID' });
    expect(error).toHaveBeenCalledOnce();
    expect(FakeSource.latest.buffer.appendBuffer).not.toHaveBeenCalled();
    stream.dispose();
  });
});
