import { describe, expect, it } from 'vitest';

import { selectMorpheusContext } from '@electron/services/morpheus/core/context-selector';
import { MORPHEUS_STARTER_AGENT_PROFILES } from '@shared/morpheus/agents/registry';
import type { MorpheusObjectiveRun } from '@shared/morpheus/core/objective-types';

function run(id: string, summary?: string): MorpheusObjectiveRun {
  return {
    v: 1, objectiveRunId: id, objective: 'private objective', origin: { type: 'command-bar', commandText: 'x' },
    state: summary ? 'complete' : 'planning', createdAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z', completedAt: summary ? '2026-08-11T00:01:00.000Z' : undefined,
    workspaceId: 'morpheus-files', agentProfileId: 'general', iteration: 0, corrections: [], planIds: [],
    observations: [], artifacts: [], summary,
  };
}

describe('bounded objective context', () => {
  it('uses safe summaries and never copies prior raw objectives', () => {
    const current = run('current');
    const selected = selectMorpheusContext({
      current,
      history: [run('past', 'Created a safe report.'), current],
      agent: MORPHEUS_STARTER_AGENT_PROFILES[0],
      workspaceLabel: 'Morpheus Files',
    });
    expect(selected.some((item) => item.text === 'Created a safe report.')).toBe(true);
    expect(JSON.stringify(selected)).not.toContain('private objective');
    expect(selected.every((item) => item.sensitivity === 'normal')).toBe(true);
  });

  it('honours none memory policy and hard item limits', () => {
    const agent = { ...MORPHEUS_STARTER_AGENT_PROFILES[0], memory: { mode: 'none' as const, maxContextItems: 200 } };
    expect(selectMorpheusContext({ current: run('current'), history: [], agent, workspaceLabel: 'Morpheus Files' }))
      .toEqual([]);
  });
});
