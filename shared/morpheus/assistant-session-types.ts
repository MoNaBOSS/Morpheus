/** A short-lived Main projection over the existing Chat and Objective owners. */
export const MORPHEUS_ASSISTANT_SESSION_VERSION = 1 as const;
export const MORPHEUS_ASSISTANT_DEFAULT_CONVERSATION_ID = 'agent:main:main';
export const MORPHEUS_ASSISTANT_MAX_TEXT_CHARS = 4_000;
export const MORPHEUS_ASSISTANT_MAX_PENDING_TURNS = 32;

export type MorpheusAssistantTurnSource = 'orb' | 'compact' | 'full' | 'voice' | 'onboarding';
export type MorpheusAssistantTurnStatus = 'admitted' | 'dispatched' | 'completed' | 'failed' | 'cancelled';

export type MorpheusAssistantConversationPayload = { conversationId: string };
export type MorpheusAssistantSnapshotPayload = { conversationId?: string };
export type MorpheusAssistantDraftPayload = {
  conversationId: string;
  expectedRevision: number;
  text: string;
};
export type MorpheusAssistantAdmitTurnPayload = {
  conversationId: string;
  clientRequestId: string;
  text: string;
  source: MorpheusAssistantTurnSource;
};
export type MorpheusAssistantAckTurnPayload = {
  conversationId: string;
  turnId: string;
};

export type MorpheusAssistantDraft = {
  conversationId: string;
  revision: number;
  text: string;
};
export type MorpheusAssistantTurn = {
  conversationId: string;
  turnId: string;
  clientRequestId: string;
  source: MorpheusAssistantTurnSource;
  status: MorpheusAssistantTurnStatus;
  generation: number;
  admittedAt: string;
  /** Existing Chat/Objective owner reference, never a second history record. */
  resultRef?: string;
};
export type MorpheusAssistantPendingTurn = MorpheusAssistantTurn & { text: string };
export type MorpheusAssistantSnapshot = {
  schemaVersion: typeof MORPHEUS_ASSISTANT_SESSION_VERSION;
  sequence: number;
  /** Resolved by Main for native presentation; absent in service-only projections. */
  locale?: string;
  selectedConversationId: string;
  conversationId: string;
  draft: MorpheusAssistantDraft;
  /** Bounded references for the requested conversation, newest last. */
  turns: MorpheusAssistantTurn[];
  /** All undelivered admissions, with explicit conversation ids and arrival order. */
  pendingTurns: MorpheusAssistantPendingTurn[];
};

/** Content-free invalidation and live admission hint; reconnect reads a snapshot. */
export type MorpheusAssistantSessionChanged = {
  schemaVersion: typeof MORPHEUS_ASSISTANT_SESSION_VERSION;
  sequence: number;
  generation: number;
  conversationId: string;
  timestamp: string;
  type: 'selection' | 'draft' | 'turn-admitted' | 'turn-dispatched' | 'turn-updated';
  /** Exact live identity only. No request text; snapshots never grant speech. */
  admittedTurn?: MorpheusAssistantTurn;
};
