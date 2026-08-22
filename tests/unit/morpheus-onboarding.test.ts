import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createMorpheusOnboardingStore } from '@electron/services/morpheus/onboarding/onboarding-store';
import { DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES } from '@shared/morpheus/onboarding-types';

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
    expect(store.status()).toMatchObject({
      v: 2,
      completed: false,
      preferences: { personality: 'witty', interactionMode: 'auto', permissionProfile: 'autonomous' },
    });
    const preferences = {
      ...DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES,
      preferredName: 'Larry',
      personality: 'warm' as const,
    };
    expect(store.complete(preferences)).toMatchObject({
      completed: true,
      completedAt: '2026-08-13T12:00:00.000Z',
      preferences: { preferredName: 'Larry', speakResponses: true, personality: 'warm' },
    });
    expect(createMorpheusOnboardingStore({ userDataDir }).status()).toMatchObject({
      completed: true, preferences: { personality: 'warm' },
    });
    expect(store.reset()).toMatchObject({ completed: false });
    expect(store.status()).not.toHaveProperty('completedAt');
  });

  it('migrates the version-one activation without silently widening authority', () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'morpheus-onboarding-v1-'));
    roots.push(userDataDir);
    const directory = join(userDataDir, 'morpheus');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'onboarding.json'), JSON.stringify({
      v: 1,
      completed: true,
      completedAt: '2026-08-10T01:02:03.000Z',
      preferences: { speakResponses: false, personality: 'concise' },
    }));

    expect(createMorpheusOnboardingStore({ userDataDir }).status()).toMatchObject({
      v: 2,
      completed: true,
      completedAt: '2026-08-10T01:02:03.000Z',
      preferences: {
        speakResponses: false,
        personality: 'concise',
        interactionMode: 'auto',
        permissionProfile: 'balanced',
      },
    });
  });

  it('rejects malformed persisted wake phrases and starts from safe defaults', () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'morpheus-onboarding-invalid-'));
    roots.push(userDataDir);
    const directory = join(userDataDir, 'morpheus');
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'onboarding.json'), JSON.stringify({
      v: 2,
      completed: true,
      preferences: { ...DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES, wakePhrase: '<script>' },
    }));

    expect(createMorpheusOnboardingStore({ userDataDir }).status()).toMatchObject({
      completed: false,
      preferences: { wakePhrase: 'Morpheus' },
    });
  });
});
