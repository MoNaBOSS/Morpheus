import { describe, expect, it } from 'vitest';

import { interpretCommand } from '@shared/morpheus/interpreter/deterministic';

function interpret(objective: string) {
  return interpretCommand({
    objective,
    origin: { type: 'quick-command', commandText: objective },
    platform: 'win32',
    filesRoot: 'C:\\Morpheus\\files',
    createId: () => 'plan-direct',
    now: () => new Date('2026-08-13T00:00:00.000Z'),
  });
}

describe('capability-first deterministic routing', () => {
  it('turns a browser search into one exact fixed-provider URL capability', () => {
    const result = interpret('Open browser and search for youtube tutorials');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.steps).toEqual([
      expect.objectContaining({
        capabilityId: 'web.openUrl',
        params: { url: 'https://www.google.com/search?q=youtube%20tutorials' },
        permission: expect.objectContaining({ resourceScope: 'https://www.google.com' }),
      }),
    ]);
  });

  it('opens a fixed browser home without accepting executable paths or argv', () => {
    const result = interpret('Open the browser');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.steps[0]).toMatchObject({
      capabilityId: 'web.openUrl', params: { url: 'https://www.google.com/' },
    });
  });

  it('does not downgrade an incomplete filesystem search into a web search', () => {
    expect(interpret('Search files').ok).toBe(false);
  });
});
