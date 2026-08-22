/** Main-owned one-time companion activation state. */
import type { MorpheusInteractionMode } from './operator-types';
import type { PermissionProfile } from './permission-types';

export const MORPHEUS_ONBOARDING_VERSION = 2 as const;

export type MorpheusCompanionPersonality = 'adaptive' | 'concise' | 'warm' | 'witty';

export type MorpheusOnboardingPreferences = {
  /** What Morpheus should call the user. Local profile data, never Audit text. */
  preferredName: string;
  speakResponses: boolean;
  personality: MorpheusCompanionPersonality;
  interactionMode: MorpheusInteractionMode;
  launchAtStartup: boolean;
  ambientVoiceEnabled: boolean;
  wakePhrase: string;
  permissionProfile: PermissionProfile;
  proactiveCheckIns: boolean;
};

export const DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES: Readonly<MorpheusOnboardingPreferences> = Object.freeze({
  preferredName: '',
  speakResponses: true,
  personality: 'witty',
  interactionMode: 'auto',
  launchAtStartup: false,
  ambientVoiceEnabled: false,
  wakePhrase: 'Morpheus',
  permissionProfile: 'autonomous',
  proactiveCheckIns: true,
});

export type MorpheusOnboardingStatus = {
  v: typeof MORPHEUS_ONBOARDING_VERSION;
  completed: boolean;
  completedAt?: string;
  preferences: MorpheusOnboardingPreferences;
};

export type CompleteMorpheusOnboardingPayload = MorpheusOnboardingPreferences;
