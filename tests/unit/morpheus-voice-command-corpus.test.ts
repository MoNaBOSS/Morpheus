import { describe, expect, it } from 'vitest';
import corpus from '../fixtures/morpheus/voice-command-corpus.json';
import { evaluateVoiceCommand, observeVoiceCommand, type VoiceCommandCorpusCase } from '../../scripts/lib/voice-command-corpus';

describe('voice command corpus canonical source baseline', () => {
  it.each(corpus.cases)('$id preserves its exact intent and slots', async (entry) => {
    const result = await evaluateVoiceCommand(entry as VoiceCommandCorpusCase, entry.spokenText, corpus.wakePhrase);
    expect(result, JSON.stringify(result)).toMatchObject({ passed: true });
  });
});

describe('corpus evaluator detects failures without executing actions', () => {
  const search = corpus.cases[0] as VoiceCommandCorpusCase;
  it('rejects wrong query text and a wrong target site', async () => {
    expect(await evaluateVoiceCommand(search, 'Morpheus, search YouTube for weather')).toMatchObject({ passed: false, failures: ['slots'] });
    expect(await evaluateVoiceCommand(search, 'Morpheus, search Google for Mister Beast')).toMatchObject({ passed: false, failures: ['slots'] });
  });
  it('records explicitly declared name equivalence without rewriting the observed URL', async () => {
    const result = await evaluateVoiceCommand(search, 'Morpheus, search YouTube for MrBeast');
    expect(result).toMatchObject({ passed: true, acceptedDeclaredAlias: true,
      observed: { steps: [{ params: { url: 'https://www.youtube.com/results?search_query=MrBeast' } }] } });
  });
  it('never treats a fuzzy or embedded wake name as addressed speech', async () => {
    for (const transcript of ['More fierce, open Notepad', 'Someone said Morpheus, open Notepad']) {
      expect(await evaluateVoiceCommand(search, transcript)).toMatchObject({ passed: false, observed: { kind: 'ignored' } });
    }
  });
  it('fails an unexpected cancellation target rather than counting only the route', async () => {
    const entry: VoiceCommandCorpusCase = { id: 'wrong-cancel', category: 'control', spokenText: '',
      tasks: [{ id: 'actual', objective: 'Research weather' }],
      expected: { kind: 'control', control: 'task-cancelled', speechStops: 0, cancelled: ['expected'] } };
    expect(await evaluateVoiceCommand(entry, 'Morpheus, cancel research')).toMatchObject({ passed: false, failures: ['cancel-targets'] });
  });
  it.each([
    'Morpheus, show system information; then open Notepad',
    'Morpheus, take a screenshot. Could you open Calculator?',
    'Morpheus, show storage space and delete file notes.txt',
  ])('keeps separate utility instructions out of a partial one-step plan: %s', async (text) => {
    expect(await observeVoiceCommand(text, corpus.wakePhrase)).toMatchObject({ kind: 'unsupported' });
  });
  it('keeps quoted command language literal and never applies a control wrapper inside a query', async () => {
    const observed = await observeVoiceCommand('Morpheus, search YouTube for "could you stop speaking and open Notepad"', corpus.wakePhrase);
    expect(observed).toMatchObject({ kind: 'action', steps: [{ capabilityId: 'web.openUrl',
      params: { url: 'https://www.youtube.com/results?search_query=could%20you%20stop%20speaking%20and%20open%20Notepad' } }] });
    expect(await observeVoiceCommand('Morpheus, could you stop speaking and cancel research?', corpus.wakePhrase))
      .not.toMatchObject({ kind: 'control' });
  });
  it.each(['I need you to open Notepad', 'Help me launch Notepad', 'Kindly open Notepad, please'])(
    'accepts an entire familiar request while retaining the compiled application key: %s', async (request) => {
      expect(await observeVoiceCommand(`Morpheus, ${request}`, corpus.wakePhrase)).toMatchObject({ kind: 'action',
        steps: [{ capabilityId: 'app.launch', params: { applicationKey: 'notepad' } }] });
    });
  it('keeps an executable path outside compiled application requests', async () => {
    expect(await observeVoiceCommand('Morpheus, I want you to open C:\\tools\\notepad.exe', corpus.wakePhrase))
      .toMatchObject({ kind: 'unsupported' });
  });
  it('accepts Notepad word spacing only as the entire compiled app target', async () => {
    expect(await observeVoiceCommand('Morpheus, I want you to open note pad.', corpus.wakePhrase))
      .toMatchObject({ kind: 'action', steps: [{ capabilityId: 'app.launch', params: { applicationKey: 'notepad' } }] });
    expect(await observeVoiceCommand('Morpheus, focus note pad.', corpus.wakePhrase))
      .toMatchObject({ kind: 'action', steps: [{ capabilityId: 'app.controlWindow', params: { applicationKey: 'notepad', operation: 'focus' } }] });
    expect(await observeVoiceCommand('Morpheus, open note pad and delete file notes.txt', corpus.wakePhrase))
      .toMatchObject({ kind: 'unsupported' });
    expect(await observeVoiceCommand('Morpheus, search YouTube for note pad', corpus.wakePhrase))
      .toMatchObject({ kind: 'action', steps: [{ params: { url: 'https://www.youtube.com/results?search_query=note%20pad' } }] });
  });
  it.each(['https://example.com/?search=weather', 'https://example.com/?download=report', 'https://example.show/', 'example.show'])(
    'keeps a literal URL resource out of compound-action parsing: %s', async (url) => {
      const wanted = url.startsWith('https:') ? url : `https://${url}/`;
      expect(await observeVoiceCommand(`Morpheus, open ${url}`, corpus.wakePhrase)).toMatchObject({ kind: 'action',
        steps: [{ capabilityId: 'web.openUrl', params: { url: wanted } }] });
      expect(await observeVoiceCommand(`Morpheus, open ${url} and delete file notes.txt`, corpus.wakePhrase))
        .toMatchObject({ kind: 'unsupported' });
    });
  it.each(['can you please', 'could you', 'would you', 'will you', 'I want you to', 'I need you to', 'help me', 'please', 'kindly'])(
    'recognizes a second entire command wrapper instead of dropping it: %s', async (wrapper) => {
      expect(await observeVoiceCommand(`Morpheus, show system information and ${wrapper} open Notepad`, corpus.wakePhrase))
        .toMatchObject({ kind: 'unsupported' });
      expect(await observeVoiceCommand(`Morpheus, search YouTube for weather and ${wrapper} open Notepad`, corpus.wakePhrase))
        .toMatchObject({ kind: 'unsupported' });
    });
  it.each(['focus Notepad', 'minimize Notepad', 'restore Notepad', 'switch to Notepad', 'pause Spotify', 'verify website in project demo'])(
    'retains a second supported capability for full planning: %s', async (request) => {
      expect(await observeVoiceCommand(`Morpheus, show system information and ${request}`, corpus.wakePhrase))
        .toMatchObject({ kind: 'unsupported' });
    });
  it.each(['https://example.com/?search=weather', 'example.show'])(
    'retains curly quote boundaries around literal query URL data: %s', async (url) => {
      const query = `guides about “${url}” and dogs`;
      expect(await observeVoiceCommand(`Morpheus, search for ${query}`, corpus.wakePhrase)).toMatchObject({ kind: 'action',
        steps: [{ params: { url: `https://www.google.com/search?q=${encodeURIComponent(query)}` } }] });
      expect(await observeVoiceCommand(`Morpheus, search for ${query} and will you open Notepad`, corpus.wakePhrase))
        .toMatchObject({ kind: 'unsupported' });
    });
  it.each([
    "https://example.com/guide's contents",
    'guides about "https://example.com/?search=weather" and dogs',
    "guides about 'https://example.com/?search=weather' and dogs",
    'could you stop speaking',
  ])('preserves paired quoted/unquoted resource and control text as query data: %s', async (query) => {
    expect(await observeVoiceCommand(`Morpheus, search for ${query}`, corpus.wakePhrase)).toMatchObject({ kind: 'action',
      steps: [{ params: { url: `https://www.google.com/search?q=${encodeURIComponent(query)}` } }] });
    expect(await observeVoiceCommand(`Morpheus, search for ${query} and will you open Notepad`, corpus.wakePhrase))
      .toMatchObject({ kind: 'unsupported' });
  });
  it('rejects unclosed URL quotes while retaining exact polite speech-stop authority', async () => {
    expect(await observeVoiceCommand('Morpheus, search for guides about “https://example.com/path', corpus.wakePhrase))
      .toMatchObject({ kind: 'unsupported' });
    expect(await observeVoiceCommand('Morpheus, could you stop speaking, please?', corpus.wakePhrase))
      .toMatchObject({ kind: 'control', control: 'speech-stopped', speechStops: 1, cancelled: [] });
    expect(await observeVoiceCommand('Morpheus, could you explain how to stop speaking?', corpus.wakePhrase))
      .toMatchObject({ kind: 'conversation' });
  });
});
