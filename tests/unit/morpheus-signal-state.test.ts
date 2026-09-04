import { describe, expect, it } from 'vitest';

import { resolveMorpheusSignalState } from '@/components/morpheus/signal/signal-state';

describe('Morpheus Signal state grammar', () => {
  it('projects every consequential Objective Core state truthfully', () => {
    expect(resolveMorpheusSignalState({ objectiveState: 'planning' })).toBe('planning');
    expect(resolveMorpheusSignalState({ objectiveState: 'waiting-for-approval' })).toBe('trust');
    expect(resolveMorpheusSignalState({ objectiveState: 'executing' })).toBe('executing');
    expect(resolveMorpheusSignalState({ objectiveState: 'complete' })).toBe('complete');
    expect(resolveMorpheusSignalState({ objectiveState: 'error' })).toBe('failed');
    expect(resolveMorpheusSignalState({ objectiveState: 'degraded' })).toBe('degraded');
  });

  it('gives active microphone state priority over a stale objective projection', () => {
    expect(resolveMorpheusSignalState({
      voicePhase: 'listening',
      objectiveState: 'complete',
    })).toBe('listening');
    expect(resolveMorpheusSignalState({
      voicePhase: 'transcribing',
      objectiveState: 'complete',
    })).toBe('understanding');
  });

  it('uses ambient voice presence when no explicit objective is active', () => {
    expect(resolveMorpheusSignalState({ voicePresence: 'armed' })).toBe('ready');
    expect(resolveMorpheusSignalState({ voicePresence: 'working' })).toBe('executing');
    expect(resolveMorpheusSignalState({ voicePresence: 'speaking' })).toBe('speaking');
  });

  it('defaults to a truthful ready state', () => {
    expect(resolveMorpheusSignalState({})).toBe('ready');
  });

  it('does not let a completed mission mask real speech or ambient capture', () => {
    expect(resolveMorpheusSignalState({ objectiveState: 'complete', voicePresence: 'speaking' })).toBe('speaking');
    expect(resolveMorpheusSignalState({ objectiveState: 'complete', voicePresence: 'listening' })).toBe('listening');
    expect(resolveMorpheusSignalState({ objectiveState: 'complete', voicePresence: 'armed' })).toBe('complete');
  });
});
