import { describe, expect, it } from 'vitest';

import { morpheusVoiceSpeechFor } from '@/lib/morpheus-voice-runtime';
import type { MorpheusObjectiveRun } from '@shared/morpheus/core/objective-types';

function run(state: MorpheusObjectiveRun['state'], patch: Partial<MorpheusObjectiveRun> = {}): MorpheusObjectiveRun {
  return {
    objectiveRunId: 'objective-voice',
    objective: 'Handle this',
    origin: { type: 'voice' },
    state,
    iteration: 0,
    observations: [],
    artifacts: [],
    corrections: [],
    createdAt: '2026-08-26T00:00:00.000Z',
    updatedAt: '2026-08-26T00:00:01.000Z',
    ...patch,
  };
}

describe('Morpheus spoken objective outcomes', () => {
  it('speaks concise completed results and necessary clarification', () => {
    expect(morpheusVoiceSpeechFor(run('complete', { summary: 'The website is ready.' }))).toBe('The website is ready.');
    expect(morpheusVoiceSpeechFor(run('needs-clarification', { clarification: 'Which workspace should I use?' }))).toBe('Which workspace should I use?');
  });

  it('does not narrate intermediate execution states or empty messages', () => {
    expect(morpheusVoiceSpeechFor(run('executing', { summary: 'Working' }))).toBeNull();
    expect(morpheusVoiceSpeechFor(run('complete', { summary: '   ' }))).toBeNull();
  });
});
