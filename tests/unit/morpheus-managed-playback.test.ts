import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MorpheusSpeechChunk } from '@shared/morpheus/voice-types';
const mocks = vi.hoisted(() => ({ synthesizeSpeech: vi.fn(), cancelSpeech: vi.fn(), setVoiceSpeaking: vi.fn(),
  push: vi.fn(), dispose: vi.fn(), finish: vi.fn(), unsubscribe: vi.fn(),
  chunk: null as ((chunk: MorpheusSpeechChunk) => void) | null, done: null as (() => void) | null }));
vi.mock('@/lib/host-api', () => ({ hostApi: { morpheus: mocks } }));
vi.mock('@/lib/host-events', () => ({ hostEvents: { onMorpheusSpeechChunk: (callback: typeof mocks.chunk) => {
  mocks.chunk = callback; return mocks.unsubscribe;
} } }));
vi.mock('@/lib/morpheus-pcm-playback', () => ({ createMorpheusPcmPlayback: () => ({
  completed: new Promise<void>((resolve) => { mocks.done = resolve; }), push: mocks.push,
  dispose: () => { mocks.dispose(); mocks.done?.(); }, finish: async () => { mocks.finish(); mocks.done?.(); },
}) }));
import { playMorpheusSpeech, stopMorpheusSpeech } from '@/lib/morpheus-speech-player';
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); mocks.chunk = null; mocks.done = null; });
afterEach(() => { stopMorpheusSpeech(); vi.useRealTimers(); });
describe('managed playback at the shared speech generation', () => {
  it('consumes only its correlated ordered PCM and does not replay the buffered result', async () => {
    mocks.synthesizeSpeech.mockImplementation(async ({ streamId }) => {
      mocks.chunk?.({ streamId: 'other', sequence: 99, audioBase64: 'AAA=', mimeType: 'audio/pcm' });
      mocks.chunk?.({ streamId, sequence: 0, audioBase64: 'AAA=', mimeType: 'audio/pcm' });
      return { audioBase64: '', mimeType: 'audio/pcm' };
    });
    await expect(playMorpheusSpeech('hello', { neuralAvailable: true, format: 'pcm24' })).resolves.toBe('neural');
    expect(mocks.push).toHaveBeenCalledOnce(); expect(mocks.finish).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it('stop releases its timer/listener immediately even when transport never settles', async () => {
    mocks.synthesizeSpeech.mockReturnValue(new Promise(() => {}));
    const pending = playMorpheusSpeech('hello', { neuralAvailable: true, format: 'pcm24' });
    stopMorpheusSpeech(); await expect(pending).resolves.toBe('cancelled');
    expect(mocks.dispose).toHaveBeenCalled(); expect(mocks.unsubscribe).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['sequence', 'mime', 'provider'])('fails closed on %s without robot or alternate provider fallback', async (kind) => {
    const speak = vi.fn(); Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel: vi.fn(), speak } });
    mocks.synthesizeSpeech.mockImplementation(async ({ streamId }) => {
      if (kind === 'provider') throw new Error('offline');
      mocks.chunk?.({ streamId, sequence: kind === 'sequence' ? 2 : 0, audioBase64: 'AAA=', mimeType: kind === 'mime' ? 'audio/mpeg' : 'audio/pcm' });
      return { audioBase64: '', mimeType: 'audio/pcm' };
    });
    await expect(playMorpheusSpeech('hello', { neuralAvailable: true, format: 'pcm24' })).rejects.toThrow('Natural speech');
    expect(speak).not.toHaveBeenCalled(); expect(mocks.synthesizeSpeech).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
});
