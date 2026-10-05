import { describe, expect, it } from 'vitest';

import { interpretCommand } from '@shared/morpheus/interpreter/deterministic';
import { observeVoiceCommand } from '../../scripts/lib/voice-command-corpus';

function interpret(objective: string) {
  return interpretCommand({ objective, origin: { type: 'quick-command', commandText: objective },
    platform: 'win32', filesRoot: 'C:\\Morpheus\\files' });
}

describe('complete deterministic command authority', () => {
  it.each([
    'Open YouTube and do not delete file notes.txt',
    "Open YouTube, don't delete file notes.txt",
    'Show system information and never delete file notes.txt',
    'Open YouTube and I said delete file notes.txt yesterday',
    'Open YouTube, someone told me to delete file notes.txt',
    'Open YouTube and could you please not delete file notes.txt',
    'Show system information and dance',
    'Take a screenshot; do something else',
    'Take a screenshot & dance', 'Show system information. Dance',
    'Show system information\ndo something else',
    'Show system information but I deleted file notes.txt',
    'Delete file notes.txt and leave the rest',
  ])('does not turn a compound or constraint into a partial plan: %s', async (request) => {
    expect(interpret(request)).toMatchObject({ ok: false, unsupported: { reason: 'not-understood' } });
    expect(await observeVoiceCommand(`Morpheus, ${request}`, 'Morpheus')).toMatchObject({ kind: 'unsupported' });
  });

  it.each([
    "Don't delete file notes.txt", 'Do not show system information',
    'Can you not delete file notes.txt?', 'Please never take a screenshot',
    'I deleted file notes.txt', 'Someone told me to delete file notes.txt',
    'Yesterday show system information', 'Last time open the browser',
    'Explain how to delete file notes.txt', 'Help me understand how to delete file notes.txt',
    'Opened the YouTube', 'Shows system information', 'Runs Spotify',
  ])('rejects negation, narration, discussion and inflected speech even at the direct planner: %s', (request) => {
    expect(interpret(request).ok).toBe(false);
  });

  it.each([
    'Delete the file notes.txt', 'Could you please delete the file notes.txt?',
    'I want you to remove notes.txt', 'Erase the file called notes.txt',
    'Delete my text file notes.txt',
  ])('keeps an exact explicit destructive request behind mandatory authority: %s', (request) => {
    expect(interpret(request)).toMatchObject({ ok: true, plan: { steps: [{ capabilityId: 'file.delete',
      params: { path: 'notes.txt' }, permission: { riskTier: 'critical', mandatoryConfirmation: true } }] } });
  });

  it.each(['Open YouTube after someone said delete file notes.txt', 'Open the browser where someone said delete file notes.txt'])(
    'does not pick an embedded keyword or unresolved browser request: %s', (request) => {
      expect(interpret(request)).toMatchObject({ ok: false, unsupported: { reason: 'not-understood' } });
    });
});

describe('literal data and bounded destination spellings', () => {
  it.each([
    'do not delete file notes.txt', 'I said delete file notes.txt yesterday',
    'weather and do not delete file notes.txt', 'opened the u tube and shows system information',
  ])('preserves an explicit literal query rather than interpreting it: %s', (query) => {
    expect(interpret(`Search YouTube for "${query}"`)).toMatchObject({ ok: true, plan: { steps: [{
      capabilityId: 'web.openUrl', params: { url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` },
    }] } });
  });

  it.each(['Search YouTube for do not delete file notes.txt', 'Search for I said delete file notes.txt yesterday'])(
    'keeps an unquoted query with no separate instruction intact: %s', (request) => {
      expect(interpret(request)).toMatchObject({ ok: true, plan: { steps: [{ capabilityId: 'web.openUrl' }] } });
    });

  it.each([
    'Hello and do not delete file notes.txt',
    'Someone told me to open YouTube and delete file notes.txt',
    'First show system information, then open Notepad',
    'Hello "world" and do not delete file notes.txt',
    'Hello\nand do not delete file notes.txt',
  ])('preserves an unquoted declared file-content tail byte for byte: %s', (content) => {
    expect(interpret(`Create a text file named notes.txt saying ${content}`)).toMatchObject({ ok: true,
      plan: { steps: [{ capabilityId: 'file.createText', params: { fileName: 'notes.txt', content } }] } });
  });

  it.each(['Could you please create', 'I want you to write'])(
    'does not route a declared content keyword as the capability after a request wrapper: %s', (prefix) => {
      const content = 'Read file private.txt and show system information';
      const result = interpret(`${prefix} a text file named notes.txt saying ${content}`);
      expect(result).toMatchObject({ ok: true,
        plan: { steps: [{ capabilityId: 'file.createText', params: { fileName: 'notes.txt', content } }] } });
      if (result.ok) expect(result.plan.steps).toHaveLength(1);
    });

  it('keeps quoted negative file content and literal URL resources', () => {
    expect(interpret('Create a text file named notes.txt saying "Never delete file reports.txt"')).toMatchObject({ ok: true,
      plan: { steps: [{ capabilityId: 'file.createText', params: { fileName: 'notes.txt', content: 'Never delete file reports.txt' } }] } });
    expect(interpret('Open https://example.com/never?search=delete')).toMatchObject({ ok: true,
      plan: { steps: [{ capabilityId: 'web.openUrl', params: { url: 'https://example.com/never?search=delete' } }] } });
  });

  it.each(['Show system information, please.', 'Open Notepad, please', 'I want you to open YouTube'])(
    'keeps a complete affirmative request useful without a provider: %s', (request) => {
      expect(interpret(request)).toMatchObject({ ok: true, plan: { plannedBy: 'deterministic' } });
    });

  it.each(['Open my browser', 'Launch the default browser, please', 'Could you open my default browser?'])(
    'preserves a complete default-browser request: %s', (request) => {
      expect(interpret(request)).toMatchObject({ ok: true,
        plan: { steps: [{ capabilityId: 'web.openUrl', params: { url: 'https://www.google.com/' } }] } });
    });

  it.each(['you tube', 'u tube', 'You Tube'])(
    'maps only an entire destination slot to the compiled YouTube origin: %s', async (destination) => {
      expect(interpret(`Open the ${destination}`)).toMatchObject({ ok: true,
        plan: { steps: [{ capabilityId: 'web.openUrl', params: { url: 'https://www.youtube.com/' } }] } });
      const query = 'u tube You Tube MR BEAST';
      expect(await observeVoiceCommand(`Morpheus, go to ${destination} and search for ${query}`, 'Morpheus')).toMatchObject({
        kind: 'action', steps: [{ capabilityId: 'web.openUrl', params: {
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
        } }],
      });
      expect(interpret(`Search ${destination} Music for u tube`)).toMatchObject({ ok: true,
        plan: { steps: [{ capabilityId: 'web.openUrl', params: { url: 'https://music.youtube.com/search?q=u%20tube' } }] } });
    });

  it.each(['Open you too', 'Open u tubes', 'Open your tube', 'Opened the you tube'])(
    'does not infer a fuzzy or past-tense destination instruction: %s', (request) => {
      expect(interpret(request).ok).toBe(false);
    });
});
