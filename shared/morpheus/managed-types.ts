/** Managed service contracts. No provider credentials or local OS authority. */
export type ManagedFeature = 'conversation' | 'planning' | 'transcription' | 'speech';
export type ManagedTier = 'basic' | 'trial' | 'premium';
export type ManagedRequestState = 'reserved' | 'dispatched' | 'uncertain' | 'settled' | 'released';

export type ManagedIdentity = { accountId: string };
export type ManagedSession = {
  accountId: string;
  expiresAt: number;
  /** Kept in Main/secure storage, never returned in account status. */
  accessToken: string;
  refreshToken?: string;
};

export type ManagedAccountStatus = {
  accountId: string;
  tier: ManagedTier;
  enabled: boolean;
  expiresAt: number | null;
  features: ManagedFeature[];
  allowance: {
    currency: 'USD';
    unit: 'micro-usd';
    granted: number;
    spent: number;
    reserved: number;
    available: number;
  };
  billing: 'not-configured';
};

export type ManagedRequestReceipt = {
  requestId: string;
  objectiveId: string | null;
  route: string;
  state: ManagedRequestState;
  reservedMicroUsd: number;
  chargedMicroUsd: number | null;
  assessedCostMicroUsd: number | null;
  costEvidence: 'rate-estimate' | 'provider-reported' | 'reconciled' | null;
  rateVersion: string;
};

export type ManagedRequest = {
  requestId: string;
  objectiveId?: string;
  route: string;
  input: unknown;
};
