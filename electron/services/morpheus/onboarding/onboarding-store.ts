import { join } from 'node:path';

import {
  DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES,
  MORPHEUS_ONBOARDING_VERSION,
  type CompleteMorpheusOnboardingPayload,
  type MorpheusCompanionProfilePatch,
  type MorpheusOnboardingStatus,
} from '@shared/morpheus/onboarding-types';
import { MORPHEUS_AMBIENT_WAKE_PHRASE_PATTERN } from '@shared/morpheus/voice-types';
import { MORPHEUS_SOCIAL_INVITATION_LIFETIME_MS, type MorpheusSocialCheckInAdmission } from '@shared/morpheus/social-check-in-types';

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
  socialCheckInDue(quiet: boolean): boolean;
  admitSocialCheckIn(invitationId: string): MorpheusSocialCheckInAdmission;
  dismissSocialCheckIn(invitationId: string): boolean;
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
  if (value.socialCheckIn !== undefined && (!isRecord(value.socialCheckIn)
    || Object.keys(value.socialCheckIn).some((key) => !['lastOfferedAt', 'ignoredStreak', 'pending'].includes(key))
    || !Number.isInteger(value.socialCheckIn.ignoredStreak) || Number(value.socialCheckIn.ignoredStreak) < 0 || Number(value.socialCheckIn.ignoredStreak) > 5
    || (value.socialCheckIn.lastOfferedAt !== undefined && (typeof value.socialCheckIn.lastOfferedAt !== 'string' || !Number.isFinite(Date.parse(value.socialCheckIn.lastOfferedAt))))
    || (value.socialCheckIn.pending !== undefined && (!isRecord(value.socialCheckIn.pending)
      || Object.keys(value.socialCheckIn.pending).some((key) => !['invitationId', 'expiresAt'].includes(key))
      || typeof value.socialCheckIn.pending.invitationId !== 'string' || !/^social-[a-z0-9-]{1,96}$/i.test(value.socialCheckIn.pending.invitationId)
      || typeof value.socialCheckIn.pending.expiresAt !== 'string' || !Number.isFinite(Date.parse(value.socialCheckIn.pending.expiresAt)))))) return null;
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
  const replace = (updated: MorpheusOnboardingStatus): void => {
    const previous = current;
    current = updated;
    try { save(); } catch (error) { current = previous; throw error; }
  };
  const expireInvitation = (): void => {
    if (!current.socialCheckIn?.pending || Date.parse(current.socialCheckIn.pending.expiresAt) > now().getTime()) return;
    replace({ ...current, socialCheckIn: {
      lastOfferedAt: current.socialCheckIn.lastOfferedAt,
      ignoredStreak: Math.min(5, current.socialCheckIn.ignoredStreak + 1),
    } });
  };

  return {
    status: () => structuredClone(current),
    noteInteraction() {
      replace({ ...current, arrival: { ...current.arrival, lastInteractionAt: now().toISOString() },
        ...(current.socialCheckIn ? { socialCheckIn: { lastOfferedAt: current.socialCheckIn.lastOfferedAt, ignoredStreak: 0 } } : {}),
      });
    },
    socialCheckInDue(quiet) {
      expireInvitation();
      if (!current.completed || quiet || !current.preferences.proactiveCheckIns
        || current.preferences.proactivityLevel === 'quiet' || current.socialCheckIn?.pending) return false;
      const stamp = now().getTime();
      const idle = current.preferences.proactivityLevel === 'talkative' ? 10 * 60_000 : 30 * 60_000;
      const lastInteraction = Date.parse(current.arrival?.lastInteractionAt ?? current.completedAt ?? '');
      if (!Number.isFinite(lastInteraction) || stamp - lastInteraction < idle) return false;
      const lastOffered = Date.parse(current.socialCheckIn?.lastOfferedAt ?? '');
      // 1, 2, 4, then 7 days. Persisted ignores cannot be defeated by restart.
      const days = Math.min(7, 2 ** (current.socialCheckIn?.ignoredStreak ?? 0));
      return !Number.isFinite(lastOffered) || stamp - lastOffered >= days * 24 * 60 * 60_000;
    },
    admitSocialCheckIn(invitationId) {
      if (!/^social-[a-z0-9-]{1,96}$/i.test(invitationId)) throw new Error('Invalid social invitation id');
      if (!this.socialCheckInDue(false)) return { admitted: false };
      replace({ ...current, socialCheckIn: {
        lastOfferedAt: now().toISOString(), ignoredStreak: current.socialCheckIn?.ignoredStreak ?? 0,
        pending: { invitationId, expiresAt: new Date(now().getTime() + MORPHEUS_SOCIAL_INVITATION_LIFETIME_MS).toISOString() },
      } });
      return { admitted: true, invitationId };
    },
    dismissSocialCheckIn(invitationId) {
      if (current.socialCheckIn?.pending?.invitationId !== invitationId) return false;
      replace({ ...current, socialCheckIn: {
        lastOfferedAt: current.socialCheckIn.lastOfferedAt,
        ignoredStreak: Math.min(5, current.socialCheckIn.ignoredStreak + 1),
      } });
      return true;
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
