/** Content-free, Main-owned social invitation state. No mood inference. */
export const MORPHEUS_SOCIAL_INVITATION_LIFETIME_MS = 45_000;
export type MorpheusSocialCheckInHistory = {
  lastOfferedAt?: string;
  ignoredStreak: number;
  pending?: { invitationId: string; expiresAt: string };
};
export type MorpheusSocialCheckInAdmission = { admitted: boolean; invitationId?: string; text?: string };
export type MorpheusSocialCheckInPayload = { available: boolean };
export type MorpheusSocialCheckInDismissPayload = { invitationId: string };
