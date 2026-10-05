import { describe, expect, it } from 'vitest';

import { routeMorpheusInteraction } from '@shared/morpheus/operator-types';
import { validateRouteInteractionPayload } from '@electron/services/morpheus-api';

describe('Morpheus Ask, Auto, and Act routing', () => {
  it.each([
    ['shows system information', 'show system information'],
    ['opened the YouTube', 'open the YouTube'],
    ['opens Notepad', 'open Notepad'],
    ['opened YouTube and search for "Opened file notes.txt"', 'open YouTube and search for "Opened file notes.txt"'],
  ])('accepts a narrow routine speech inflection without changing literal content: %s', (text, canonical) => {
    expect(routeMorpheusInteraction({ text, mode: 'auto', surface: 'voice' })).toMatchObject({ route: 'objective', text: canonical });
    expect(routeMorpheusInteraction({ text, mode: 'auto', surface: 'quick-command' }).route).toBe('clarification');
    expect(routeMorpheusInteraction({ text, mode: 'ask', surface: 'voice' })).toMatchObject({ route: 'conversation', text });
  });
  it.each(['opened file notes.txt', 'deleted file notes.txt', 'shows private passwords',
    'opened YouTube then delete file notes.txt', 'I opened YouTube', 'Morpheus opened YouTube yesterday'])('does not repair narration, consequential commands or partial compound tasks: %s', (text) => {
    expect(routeMorpheusInteraction({ text, mode: 'auto', surface: 'voice' }).route).not.toBe('objective');
  });
  it('keeps Ask conversational even when the text sounds actionable', () => {
    expect(routeMorpheusInteraction({
      text: 'Build me a website', mode: 'ask', surface: 'chat',
    })).toMatchObject({ route: 'conversation', reason: 'ask-selected', confidence: 'explicit' });
  });

  it('sends Act through Objective Core even when phrased as a question', () => {
    expect(routeMorpheusInteraction({
      text: 'How should this workspace be organized?', mode: 'act', surface: 'presence',
    })).toMatchObject({ route: 'objective', reason: 'act-selected', confidence: 'explicit' });
  });

  it.each([
    'Build a responsive website for my business',
    'Please create a folder named Launch',
    'Can you open Notepad?',
    'I need you to prepare a launch plan',
    'Set up a reminder for tomorrow',
    'go to youtube and search mr beast',
    'Open the YouTube and search for RNR.',
    'Could you visit YouTube please?',
    'Look up mr beast on YouTube',
    'YouTube search mr beast',
  ])('routes a clear Auto objective: %s', (text) => {
    expect(routeMorpheusInteraction({ text, mode: 'auto', surface: 'chat' }).route).toBe('objective');
  });

  it.each(['command-center', 'presence', 'quick-command', 'voice', 'chat'] as const)(
    'routes an explicit site search consistently from %s', (surface) => {
      expect(routeMorpheusInteraction({ text: 'go to youtube and search mr beast', mode: 'auto', surface }))
        .toMatchObject({ route: 'objective', reason: 'actionable-intent', confidence: 'high' });
    },
  );

  it.each([
    'Why is the sky blue?',
    'What do you think about this idea?',
    'Could this business model work?',
  ])('keeps a clear Auto question conversational: %s', (text) => {
    expect(routeMorpheusInteraction({ text, mode: 'auto', surface: 'chat' }).route).toBe('conversation');
  });

  it('fails an ambiguous command surface toward one clarification, not execution', () => {
    expect(routeMorpheusInteraction({
      text: 'the website thing', mode: 'auto', surface: 'quick-command',
    })).toMatchObject({ route: 'clarification', reason: 'ambiguous-command', confidence: 'low' });
  });
  it.each(['Hi Morpheus', 'I prefer short updates', "Don't roast me", 'Call me Larry', 'Remember that I like One Piece'])('keeps direct companion preferences conversational: %s', (text) => {
    expect(routeMorpheusInteraction({ text, mode: 'auto', surface: 'quick-command' })).toMatchObject({ route: 'conversation', reason: 'conversational-intent' });
  });

  it('fails ambiguous Chat text toward conversation', () => {
    expect(routeMorpheusInteraction({
      text: 'the website thing', mode: 'auto', surface: 'chat',
    })).toMatchObject({ route: 'conversation', reason: 'ambiguous-chat', confidence: 'low' });
  });

  it('rejects unknown keys and invalid modes at the typed host boundary', () => {
    expect(() => validateRouteInteractionPayload({
      text: 'Open Notepad', mode: 'auto', surface: 'presence', executablePath: 'cmd.exe',
    })).toThrow(/unsupported key/i);
    expect(() => validateRouteInteractionPayload({
      text: 'Open Notepad', mode: 'unrestricted', surface: 'presence',
    })).toThrow(/unsupported interaction mode/i);
  });
});
