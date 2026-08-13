import { join } from 'node:path';

import {
  MORPHEUS_ONBOARDING_VERSION,
  type CompleteMorpheusOnboardingPayload,
  type MorpheusOnboardingStatus,
} from '@shared/morpheus/onboarding-types';

import { readValidatedJson, writeJsonAtomically } from '../storage/atomic-json';

const DEFAULT_STATUS: Readonly<MorpheusOnboardingStatus> = Object.freeze({
  v: MORPHEUS_ONBOARDING_VERSION,
  completed: false,
  preferences: Object.freeze({ speakResponses: true, personality: 'adaptive' as const }),
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
  if (!isRecord(value) || value.v !== MORPHEUS_ONBOARDING_VERSION
    || typeof value.completed !== 'boolean' || !isRecord(value.preferences)
    || typeof value.preferences.speakResponses !== 'boolean'
    || !['adaptive', 'concise', 'warm'].includes(String(value.preferences.personality))
    || (value.completedAt !== undefined && typeof value.completedAt !== 'string')) return null;
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
      if (typeof payload.speakResponses !== 'boolean'
        || !['adaptive', 'concise', 'warm'].includes(payload.personality)) {
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
