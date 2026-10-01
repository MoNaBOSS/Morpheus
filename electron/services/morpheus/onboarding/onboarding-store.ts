import { join } from 'node:path';

import {
  DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES,
  MORPHEUS_ONBOARDING_VERSION,
  type CompleteMorpheusOnboardingPayload,
  type MorpheusCompanionProfilePatch,
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
  updateProfile(patch: MorpheusCompanionProfilePatch): MorpheusOnboardingStatus;
  reset(): MorpheusOnboardingStatus;
  noteInteraction(): void;
  admitGreeting(quiet: boolean): { admitted: boolean; preferredName: string };
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
        // Optional modern choices were never made on v1. Keep legacy tone
        // authoritative until the user explicitly edits these preferences.
        humorStyle: undefined,
        proactivityLevel: undefined,
        // Preserve the legacy behavior instead of silently increasing an
        // existing user's authority during schema migration.
        permissionProfile: 'balanced',
      },
    };
  }

  const preferences = value.preferences;
  if (value.arrival !== undefined && (!isRecord(value.arrival)
    || Object.keys(value.arrival).some((key) => !['lastInteractionAt', 'lastGreetingAt', 'lastGreetingDay'].includes(key))
    || ['lastInteractionAt', 'lastGreetingAt'].some((key) => value.arrival && isRecord(value.arrival)
      && value.arrival[key] !== undefined && (typeof value.arrival[key] !== 'string' || !Number.isFinite(Date.parse(value.arrival[key] as string))))
    || (value.arrival.lastGreetingDay !== undefined && (typeof value.arrival.lastGreetingDay !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.arrival.lastGreetingDay))))) return null;
  if (typeof preferences.preferredName !== 'string' || preferences.preferredName.length > 80
    || !['ask', 'auto', 'act'].includes(String(preferences.interactionMode))
    || typeof preferences.launchAtStartup !== 'boolean'
    || typeof preferences.ambientVoiceEnabled !== 'boolean'
    || typeof preferences.wakePhrase !== 'string'
    || !MORPHEUS_AMBIENT_WAKE_PHRASE_PATTERN.test(preferences.wakePhrase.trim())
    || !['strict', 'balanced', 'autonomous'].includes(String(preferences.permissionProfile))
    || typeof preferences.proactiveCheckIns !== 'boolean'
    || (preferences.interests !== undefined && (typeof preferences.interests !== 'string' || preferences.interests.length > 240))
    || (preferences.humorStyle !== undefined && !['gentle', 'cheeky', 'unfiltered'].includes(String(preferences.humorStyle)))
    || (preferences.proactivityLevel !== undefined && !['quiet', 'balanced', 'talkative'].includes(String(preferences.proactivityLevel)))) return null;
  return {
    ...structuredClone(value) as MorpheusOnboardingStatus,
    preferences: { ...DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES, ...preferences,
      humorStyle: preferences.humorStyle, proactivityLevel: preferences.proactivityLevel,
    } as MorpheusOnboardingStatus['preferences'],
  };
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
    noteInteraction() {
      const previous = current;
      current = { ...current, arrival: { ...current.arrival, lastInteractionAt: now().toISOString() } };
      try { save(); } catch (error) { current = previous; throw error; }
    },
    admitGreeting(quiet) {
      const stamp = now();
      const day = `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}-${String(stamp.getDate()).padStart(2, '0')}`;
      const lastInteraction = Date.parse(current.arrival?.lastInteractionAt ?? current.completedAt ?? '');
      const lastGreeting = Date.parse(current.arrival?.lastGreetingAt ?? '');
      const result = { admitted: false, preferredName: current.preferences.preferredName };
      if (!current.completed || quiet || current.preferences.proactivityLevel === 'quiet'
        || !current.preferences.proactiveCheckIns || current.arrival?.lastGreetingDay === day
        || (Number.isFinite(lastInteraction) && stamp.getTime() - lastInteraction < 2 * 60 * 60_000)
        || (Number.isFinite(lastGreeting) && stamp.getTime() - lastGreeting < 2 * 60 * 60_000)) return result;
      const previous = current;
      current = { ...current, arrival: { ...current.arrival, lastGreetingDay: day, lastGreetingAt: stamp.toISOString() } };
      try { save(); } catch (error) { current = previous; throw error; }
      return { ...result, admitted: true };
    },
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
    updateProfile(patch) {
      if (!current.completed) throw new Error('Complete first-run setup before editing the companion profile');
      const updated = validateStatus({
        ...current,
        preferences: { ...current.preferences, ...patch },
      });
      if (!updated) throw new Error('Invalid Morpheus companion profile');
      const previous = current;
      current = updated;
      try { save(); } catch (error) { current = previous; throw error; }
      return structuredClone(current);
    },
    reset() {
      current = structuredClone(DEFAULT_STATUS);
      save();
      return structuredClone(current);
    },
  };
}
