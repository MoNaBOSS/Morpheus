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
  it.each([
    'go to youtube and search mr beast',
    'Open YouTube and search for mr beast',
    'Please search YouTube for mr beast',
    'Could you search for mr beast on YouTube?',
    'Visit youtube.com, then search mr beast',
    'Open the YouTube and search for MR BEAST.',
    'Go to https://www.youtube.com/ and search mr beast',
  ])('keeps an explicit YouTube search on its requested site: %s', (objective) => {
    expect(interpret(objective)).toMatchObject({ ok: true, plan: { steps: [{
      capabilityId: 'web.openUrl',
      params: { url: `https://www.youtube.com/results?search_query=${objective.includes('MR BEAST') ? 'MR%20BEAST' : 'mr%20beast'}` },
      permission: { resourceScope: 'https://www.youtube.com' },
    }] } });
  });

  it('retains an explicit HTTPS site target without a trailing slash', () => {
    expect(interpret('go to https://www.youtube.com and search Mr Beast')).toMatchObject({ ok: true,
      plan: { steps: [{ capabilityId: 'web.openUrl', params: { url: 'https://www.youtube.com/results?search_query=Mr%20Beast' } }] },
    });
  });

  it.each([
    'delete file notes.txt', 'take a screenshot', 'system specs',
    'how to read files and create folders', 'open Notepad',
  ])('keeps site-search query text literal: %s', (query) => {
    const result = interpret(`Search YouTube for "${query}"`);
    expect(result).toMatchObject({ ok: true, plan: { steps: [{ capabilityId: 'web.openUrl',
      params: { url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` },
    }] } });
    if (result.ok) expect(result.plan.steps).toHaveLength(1);
  });

  it.each([
    'Go to YouTube and search mr beast and delete file notes.txt',
    'Search YouTube for mr beast then send an email',
    'Open YouTube and search "mr beast" and open Notepad',
    'Search YouTube for mr beast\nand delete file notes.txt',
    'Search YouTube for mr beast and go to Instagram',
    'Search YouTube for mr beast & transfer money',
    'Search YouTube for ""',
    'Open YouTube and SARS for',
    "Don't search YouTube for mr beast",
    'Explain how to search YouTube for mr beast',
  ])('does not drop extra actions or treat discussion as a site-search instruction: %s', (objective) => {
    expect(interpret(objective).ok).toBe(false);
  });

  it.each([
    ['Search for rock and roll', 'rock and roll'],
    ['Google how to delete files', 'how to delete files'],
    ['Search the web for "delete file notes.txt"', 'delete file notes.txt'],
    ['Search for screenshots', 'screenshots'],
  ])('preserves generic browser search as one URL: %s', (objective, query) => {
    expect(interpret(objective)).toMatchObject({ ok: true, plan: { steps: [{ capabilityId: 'web.openUrl',
      params: { url: `https://www.google.com/search?q=${encodeURIComponent(query)}` },
      permission: { resourceScope: 'https://www.google.com' },
    }] } });
  });

  it.each([
    ['Search YouTube Music for focus music', 'https://music.youtube.com/search?q=focus%20music'],
    ['Find morpheus on GitHub', 'https://github.com/search?q=morpheus'],
    ['Search Google for mr beast', 'https://www.google.com/search?q=mr%20beast'],
    ['Search YouTube for "R&D #1? next=delete&file=notes.txt"', 'https://www.youtube.com/results?search_query=R%26D%20%231%3F%20next%3Ddelete%26file%3Dnotes.txt'],
  ])('builds an encoded query on a compiled search endpoint: %s', (objective, url) => {
    expect(interpret(objective)).toMatchObject({ ok: true, plan: { steps: [{ capabilityId: 'web.openUrl', params: { url },
      permission: { resourceScope: new URL(url).origin },
    }] } });
  });

  it('does not invent an endpoint for a named site whose search is unsupported', () => {
    expect(interpret('Search Instagram for mr beast').ok).toBe(false);
    expect(interpret('Search example.com for mr beast').ok).toBe(false);
    expect(interpret('Search for mr beast on example.com').ok).toBe(false);
    expect(interpret('Go to example.com and search for delete file notes.txt').ok).toBe(false);
    expect(interpret(`Search YouTube for ${'a'.repeat(201)}`).ok).toBe(false);
  });

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
