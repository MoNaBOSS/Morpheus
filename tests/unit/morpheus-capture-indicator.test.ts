import { describe, expect, it } from 'vitest';

import {
  CAPTURE_DWELL_MS,
  captureIndicatorState,
} from '@/components/morpheus/MorpheusCaptureIndicator';

const AT = Date.parse('2026-08-09T12:00:00.000Z');

function run(phase: string, options: { path?: string; at?: number } = {}) {
  return {
    phase,
    updatedAt: new Date(options.at ?? AT).toISOString(),
    target: options.path
      ? { kind: 'file' as const, path: options.path }
      : undefined,
  };
}

describe('capture indicator state', () => {
  it('shows nothing when no capture has ever run', () => {
    expect(captureIndicatorState(undefined, AT)).toEqual({ visible: false });
  });

  it('announces an in-flight capture', () => {
    expect(captureIndicatorState(run('running'), AT)).toEqual({ visible: true, phase: 'capturing' });
    expect(captureIndicatorState(run('requested'), AT)).toEqual({ visible: true, phase: 'capturing' });
  });

  it('announces a completed capture with the real saved path', () => {
    const state = captureIndicatorState(run('succeeded', { path: 'C:\\ws\\captures\\a.png' }), AT + 100);
    expect(state).toMatchObject({ visible: true, phase: 'captured', path: 'C:\\ws\\captures\\a.png' });
  });

  it('stops announcing once the dwell has passed', () => {
    const finished = run('succeeded', { path: 'C:\\ws\\a.png' });
    expect(captureIndicatorState(finished, AT + CAPTURE_DWELL_MS - 1).visible).toBe(true);
    expect(captureIndicatorState(finished, AT + CAPTURE_DWELL_MS + 1).visible).toBe(false);
  });

  it('NEVER announces a capture that failed, was denied or was cancelled', () => {
    // Claiming a capture happened when it did not would be worse than showing
    // nothing: the user would distrust the indicator entirely.
    for (const phase of ['failed', 'denied', 'cancelled', 'timed-out', 'unsupported-platform']) {
      expect(captureIndicatorState(run(phase, { path: 'C:\\ws\\a.png' }), AT), phase)
        .toEqual({ visible: false });
    }
  });

  it('announces without a path rather than inventing one', () => {
    const state = captureIndicatorState(run('succeeded'), AT);
    expect(state).toMatchObject({ visible: true, phase: 'captured', path: null });
  });

  it('does not announce on an unparseable timestamp', () => {
    expect(captureIndicatorState(
      { phase: 'succeeded', updatedAt: 'not-a-date', target: undefined },
      AT,
    )).toEqual({ visible: false });
  });

  it('stays visible when the clock is behind the run, correcting on the next tick', () => {
    // A stale `now` can only make the indicator linger, never hide a capture
    // that just happened.
    expect(captureIndicatorState(run('succeeded', { path: 'C:\\ws\\a.png' }), AT - 5000).visible).toBe(true);
  });
});
