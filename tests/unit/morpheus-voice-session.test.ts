import { describe, expect, it } from 'vitest';
import { MorpheusUtteranceDetector } from '@/lib/morpheus-audio-level';

describe('bounded explicit voice turn', () => {
  it('ends only after confirmed speech followed by bounded silence', () => {
    const detector = new MorpheusUtteranceDetector(0, 900, 10_000);
    expect(detector.sample(0.04, 100)).toBeNull();
    expect(detector.sample(0.04, 150)).toBeNull();
    expect(detector.sample(0.04, 200)).toBe('speech-started');
    expect(detector.sample(0.04, 700)).toBeNull();
    expect(detector.sample(0, 1_599)).toBeNull();
    expect(detector.sample(0, 1_600)).toBe('speech-ended');
    expect(detector.sample(0.2, 2_000)).toBeNull();
  });

  it('rejects a silent turn locally before transcription', () => {
    const detector = new MorpheusUtteranceDetector(100, 900, 10_000);
    expect(detector.sample(0.001, 10_099)).toBeNull();
    expect(detector.sample(0.001, 10_100)).toBe('no-speech');
  });
});
