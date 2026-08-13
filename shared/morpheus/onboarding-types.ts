/** Main-owned one-time companion activation state. */
export const MORPHEUS_ONBOARDING_VERSION = 1 as const;

export type MorpheusCompanionPersonality = 'adaptive' | 'concise' | 'warm';

export type MorpheusOnboardingPreferences = {
  speakResponses: boolean;
  personality: MorpheusCompanionPersonality;
};

export type MorpheusOnboardingStatus = {
  v: typeof MORPHEUS_ONBOARDING_VERSION;
  completed: boolean;
  completedAt?: string;
  preferences: MorpheusOnboardingPreferences;
};

export type CompleteMorpheusOnboardingPayload = MorpheusOnboardingPreferences;
