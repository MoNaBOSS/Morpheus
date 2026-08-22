import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createMorpheusMemoryStore } from '@electron/services/morpheus/memory/memory-store';
import { extractMorpheusMemoryCandidate } from '@shared/morpheus/memory-candidates';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('bounded automatic Morpheus memory', () => {
  it.each([
    ['Call me Larry', 'Preferred name', 'Call the user Larry.'],
    ['I prefer short progress updates.', 'User preference', 'The user prefers short progress updates.'],
    ['Remember that this project targets Windows first.', 'Remembered context', 'this project targets Windows first'],
    ['Remember that every day I review new leads.', 'Routine', 'every day I review new leads'],
  ])('extracts only an explicit stable statement: %s', (objective, title, text) => {
    expect(extractMorpheusMemoryCandidate(objective)).toMatchObject({
      kind: 'candidate', candidate: { title, text, sensitivity: 'normal', providerUse: 'allowed' },
    });
  });

  it.each([
    'Remember my API key is sk-abcdefghijklmnop',
    'Remember that my password is swordfish',
    'Call me 4111 1111 1111 1111',
    'Remember my seed phrase is one two three four five six',
  ])('rejects credential-shaped or explicitly secret material: %s', (objective) => {
    expect(extractMorpheusMemoryCandidate(objective)).toEqual({
      kind: 'rejected', reason: 'sensitive-content',
    });
  });

  it('does not treat ordinary objectives or transcripts as durable memory', () => {
    expect(extractMorpheusMemoryCandidate('Build a business website')).toEqual({ kind: 'none' });
    expect(extractMorpheusMemoryCandidate('We talked about several possible colors')).toEqual({ kind: 'none' });
  });

  it('persists mission provenance and deduplicates equivalent text in one project scope', () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'morpheus-auto-memory-'));
    roots.push(userDataDir);
    const memory = createMorpheusMemoryStore({ userDataDir, createId: () => 'memory-auto-1' });
    const saved = memory.save({
      title: 'Preference', text: 'Use short updates.', kind: 'preference',
      sensitivity: 'normal', providerUse: 'allowed', projectId: 'project-alpha', enabled: true,
    }, { source: 'mission', sourceId: 'mission-alpha' });

    expect(saved).toMatchObject({ source: 'mission', sourceId: 'mission-alpha' });
    expect(memory.hasEquivalent('  use SHORT updates. ', 'project-alpha')).toBe(true);
    expect(memory.hasEquivalent('Use short updates.', 'project-beta')).toBe(false);
    expect(createMorpheusMemoryStore({ userDataDir }).get(saved.memoryId)).toMatchObject({
      source: 'mission', sourceId: 'mission-alpha',
    });
  });
});
