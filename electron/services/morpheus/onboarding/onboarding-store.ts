import { join } from 'node:path';

import {
  DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES,
  MORPHEUS_ONBOARDING_VERSION,
  type CompleteMorpheusOnboardingPayload,
  type MorpheusOnboardingStatus,
} from '@shared/morpheus/onboarding-types';
import { MORPHEUS_AMBIENT_WAKE_PHRASE_PATTERN } from '@shared/morpheus/voice-types';

import { readValidatedJson, writeJsonAtomically } from '../storage/atomic-json';

const DEFAULT_STATUS: Readonly<MorpheusOnboardingStatus> = Object.freeze({
  v: MORPHEUS_ONBOARDING_VERSION,
  completed: false,
  preferences: DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES,
});

export interface MorpheusOnboardingStore {
  status(): MorpheusOnboardingStatus;
  complete(payload: CompleteMorpheusOnboardingPayload): MorpheusOnboardingStatus;
  reset(): MorpheusOnboardingStatus;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateStatus(value: unknown): MorpheusOnboardingStatus | null {
  if (!isRecord(value) || (value.v !== 1 && value.v !== MORPHEUS_ONBOARDING_VERSION)
    || typeof value.completed !== 'boolean' || !isRecord(value.preferences)
    || typeof value.preferences.speakResponses !== 'boolean'
    || !['adaptive', 'concise', 'warm', 'witty'].includes(String(value.preferences.personality))
    || (value.completedAt !== undefined && typeof value.completedAt !== 'string')) return null;

  if (value.v === 1) {
    return {
      ...structuredClone(DEFAULT_STATUS),
      completed: value.completed,
      ...(typeof value.completedAt === 'string' ? { completedAt: value.completedAt } : {}),
      preferences: {
        ...structuredClone(DEFAULT_STATUS.preferences),
        speakResponses: value.preferences.speakResponses,
        personality: value.preferences.personality as 'adaptive' | 'concise' | 'warm',
        // Preserve the legacy behavior instead of silently increasing an
        // existing user's authority during schema migration.
        permissionProfile: 'balanced',
      },
    };
  }

  const preferences = value.preferences;
  if (typeof preferences.preferredName !== 'string' || preferences.preferredName.length > 80
    || !['ask', 'auto', 'act'].includes(String(preferences.interactionMode))
    || typeof preferences.launchAtStartup !== 'boolean'
    || typeof preferences.ambientVoiceEnabled !== 'boolean'
    || typeof preferences.wakePhrase !== 'string'
    || !MORPHEUS_AMBIENT_WAKE_PHRASE_PATTERN.test(preferences.wakePhrase.trim())
    || !['strict', 'balanced', 'autonomous'].includes(String(preferences.permissionProfile))
    || typeof preferences.proactiveCheckIns !== 'boolean') return null;
  return structuredClone(value) as MorpheusOnboardingStatus;
}

export function createMorpheusOnboardingStore(options: {
  userDataDir: string;
  now?: () => Date;
}): MorpheusOnboardingStore {
  const now = options.now ?? (() => new Date());
  const file = join(options.userDataDir, 'morpheus', 'onboarding.json');
  let current = readValidatedJson(file, validateStatus) ?? structuredClone(DEFAULT_STATUS);
  const save = (): void => writeJsonAtomically(file, current);

  return {
    status: () => structuredClone(current),
    complete(payload) {
      if (!validateStatus({
        v: MORPHEUS_ONBOARDING_VERSION,
        completed: true,
        preferences: payload,
      })) {
        throw new Error('Invalid Morpheus activation preferences');
      }
      current = {
        v: MORPHEUS_ONBOARDING_VERSION,
        completed: true,
        completedAt: now().toISOString(),
        preferences: structuredClone(payload),
      };
      save();
      return structuredClone(current);
    },
    reset() {
      current = structuredClone(DEFAULT_STATUS);
      save();
      return structuredClone(current);
    },
  };
}
