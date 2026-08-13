import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createMorpheusOnboardingStore } from '@electron/services/morpheus/onboarding/onboarding-store';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Morpheus companion activation store', () => {
  it('persists one completion and supports an explicit replay reset', () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'morpheus-onboarding-'));
    roots.push(userDataDir);
    const store = createMorpheusOnboardingStore({
      userDataDir,
      now: () => new Date('2026-08-13T12:00:00.000Z'),
    });
    expect(store.status()).toMatchObject({ completed: false, preferences: { personality: 'adaptive' } });
    expect(store.complete({ speakResponses: true, personality: 'warm' })).toMatchObject({
      completed: true,
      completedAt: '2026-08-13T12:00:00.000Z',
      preferences: { speakResponses: true, personality: 'warm' },
    });
    expect(createMorpheusOnboardingStore({ userDataDir }).status()).toMatchObject({
      completed: true, preferences: { personality: 'warm' },
    });
    expect(store.reset()).toMatchObject({ completed: false });
    expect(store.status()).not.toHaveProperty('completedAt');
  });
});
