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
  turnId?: string;
  workerRunId?: string;
  speechId?: string;
};

export type ManagedRequest = {
  requestId: string;
  objectiveId?: string;
  turnId?: string;
  workerRunId?: string;
  speechId?: string;
  route: string;
  input: unknown;
};

export type ManagedClientStatus =
  | { state: 'not-configured' | 'signed-out' | 'session-expired' | 'unavailable'; account: null }
  | { state: 'ready'; account: ManagedAccountStatus };

export type ManagedAuthState = 'idle' | 'browser' | 'email-code' | 'signed-in' | 'error';
export type ManagedAccountSnapshot = {
  serviceMode?: 'byok' | 'managed';
  /** Main composition confirms all application paid paths use the managed bridge. */
  runtimeReady?: boolean;
  configured: boolean;
  signedIn: boolean;
  authState: ManagedAuthState;
  access: ManagedClientStatus;
};
export type ManagedAuthResult = { success: boolean; error?: 'not-configured' | 'invalid-input' | 'rate-limited' | 'auth-failed' | 'cancelled' | 'storage-unavailable' };
