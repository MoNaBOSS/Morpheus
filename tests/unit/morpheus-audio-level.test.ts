import { describe, expect, it, vi } from 'vitest';
import { createMorpheusAudioLevelSource, subscribeMorpheusAudioLevel } from '@/lib/morpheus-audio-level';

describe('ephemeral audio level', () => {
  it('clamps invalid input, disposes stale producers and isolates sources', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeMorpheusAudioLevel(listener);
    const a = createMorpheusAudioLevelSource();
    const b = createMorpheusAudioLevelSource();
    a.update(1);
    expect(listener).toHaveBeenLastCalledWith(1);
    b.update(0.1);
    a.dispose();
    expect(listener).toHaveBeenLastCalledWith(0.6000000000000001);
    a.update(1);
    expect(listener).toHaveBeenLastCalledWith(0.6000000000000001);
    b.update(Number.NaN);
    expect(listener).toHaveBeenLastCalledWith(0);
    b.dispose();
    unsubscribe();
    expect(listener).toHaveBeenLastCalledWith(0);
  });
});
