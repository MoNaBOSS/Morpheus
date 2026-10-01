/** Main-owned one-time companion activation state. */
import type { MorpheusInteractionMode } from './operator-types';
import type { PermissionProfile } from './permission-types';
import type { MorpheusSocialCheckInHistory } from './social-check-in-types';

export const MORPHEUS_ONBOARDING_VERSION = 2 as const;

export type MorpheusCompanionPersonality = 'adaptive' | 'concise' | 'warm' | 'witty';
export type MorpheusHumorStyle = 'gentle' | 'cheeky' | 'unfiltered';
export type MorpheusProactivityLevel = 'quiet' | 'balanced' | 'talkative';

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
  /** Optional for existing v2 profiles; new completions always fill these. */
  interests?: string;
  humorStyle?: MorpheusHumorStyle;
  proactivityLevel?: MorpheusProactivityLevel;
};

export const DEFAULT_MORPHEUS_ONBOARDING_PREFERENCES: Readonly<MorpheusOnboardingPreferences> = Object.freeze({
  preferredName: '',
  speakResponses: true,
  personality: 'witty',
  interactionMode: 'auto',
  launchAtStartup: false,
  ambientVoiceEnabled: false,
  wakePhrase: 'Morpheus',
  permissionProfile: 'balanced',
  proactiveCheckIns: true,
  interests: '',
  humorStyle: 'cheeky',
  proactivityLevel: 'balanced',
});

export type MorpheusOnboardingStatus = {
  v: typeof MORPHEUS_ONBOARDING_VERSION;
  completed: boolean;
  completedAt?: string;
  preferences: MorpheusOnboardingPreferences;
  /** Main-owned content-free greeting history. Missing on existing profiles. */
  arrival?: { lastInteractionAt?: string; lastGreetingAt?: string; lastGreetingDay?: string };
  socialCheckIn?: MorpheusSocialCheckInHistory;
};

export type MorpheusGreetingAdmission = { admitted: boolean; preferredName: string };

export type CompleteMorpheusOnboardingPayload = MorpheusOnboardingPreferences;
export type MorpheusCompanionProfilePatch = Partial<Pick<MorpheusOnboardingPreferences,
  'preferredName' | 'interests' | 'humorStyle' | 'proactivityLevel'
>>;
