import { createHash, randomUUID } from 'node:crypto';

import {
  MORPHEUS_ASSISTANT_DEFAULT_CONVERSATION_ID,
  MORPHEUS_ASSISTANT_MAX_PENDING_TURNS,
  MORPHEUS_ASSISTANT_MAX_TEXT_CHARS,
  MORPHEUS_ASSISTANT_SESSION_VERSION,
  type MorpheusAssistantAckTurnPayload,
  type MorpheusAssistantAdmitTurnPayload,
  type MorpheusAssistantConversationPayload,
  type MorpheusAssistantDraft,
  type MorpheusAssistantDraftPayload,
  type MorpheusAssistantPendingTurn,
  type MorpheusAssistantSessionChanged,
  type MorpheusAssistantSnapshot,
  type MorpheusAssistantSnapshotPayload,
  type MorpheusAssistantTurn,
  type MorpheusAssistantTurnStatus,
} from '@shared/morpheus/assistant-session-types';

const MAX_CONVERSATIONS = 32;
const MAX_TURN_REFERENCES_PER_CONVERSATION = 32;
const MAX_REMEMBERED_REQUESTS = 4_096;

type StoredTurn = {
  ref: MorpheusAssistantTurn;
  requestHash: string;
  text: string | null;
  sourceSequence: number;
};
type Conversation = {
  draft: MorpheusAssistantDraft;
  turnIds: string[];
};

/** Only Main-owned adapters may report result transitions into this projection. */
export type MorpheusAssistantTurnEventInput = {
  conversationId: string;
  turnId: string;
  generation: number;
  sourceSequence: number;
  status: Extract<MorpheusAssistantTurnStatus, 'completed' | 'failed' | 'cancelled'>;
  resultRef?: string;
};
export type MorpheusAssistantTurnEventOutcome =
  | 'accepted' | 'duplicate-or-stale' | 'stale-generation' | 'resync-required' | 'unknown-turn';

export class MorpheusAssistantSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MorpheusAssistantSessionError';
  }
}

function validateConversationId(value: string): void {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256 || !/^[a-zA-Z0-9:_-]+$/.test(value)) {
    throw new MorpheusAssistantSessionError('invalid conversationId');
  }
}

function cloneTurn(turn: MorpheusAssistantTurn): MorpheusAssistantTurn {
  return { ...turn };
}

/**
 * A bounded, content-light projection. Existing Chat persists conversation history
 * and Objective Core owns work; this service only correlates presentation turns.
 */
export class MorpheusAssistantSession {
  private readonly conversations = new Map<string, Conversation>();
  private readonly requests = new Map<string, StoredTurn>();
  private readonly turns = new Map<string, StoredTurn>();
  private selectedConversationId = MORPHEUS_ASSISTANT_DEFAULT_CONVERSATION_ID;
  private sequence = 0;

  constructor(private readonly options: {
    now?: () => Date;
    createId?: () => string;
    emit?: (event: MorpheusAssistantSessionChanged) => void;
  } = {}) {
    this.conversations.set(this.selectedConversationId, {
      draft: { conversationId: this.selectedConversationId, revision: 0, text: '' },
      turnIds: [],
    });
  }

  private now(): string {
    return (this.options.now?.() ?? new Date()).toISOString();
  }

  private changed(conversationId: string, generation: number, type: MorpheusAssistantSessionChanged['type']): void {
    const event: MorpheusAssistantSessionChanged = {
      schemaVersion: MORPHEUS_ASSISTANT_SESSION_VERSION,
      sequence: ++this.sequence,
      generation,
      conversationId,
      timestamp: this.now(),
      type,
    };
    // Delivery is a hint. A missed event is recovered from snapshot + cursor.
    try { this.options.emit?.(event); } catch { /* snapshot remains authoritative */ }
  }

  private ensureConversation(conversationId: string): Conversation {
    validateConversationId(conversationId);
    const existing = this.conversations.get(conversationId);
    if (existing) return existing;
    if (this.conversations.size >= MAX_CONVERSATIONS) {
      throw new MorpheusAssistantSessionError('assistant conversation capacity reached');
    }
    const conversation: Conversation = {
      draft: { conversationId, revision: 0, text: '' },
      turnIds: [],
    };
    this.conversations.set(conversationId, conversation);
    return conversation;
  }

  selectConversation(input: MorpheusAssistantConversationPayload): MorpheusAssistantSnapshot {
    this.ensureConversation(input.conversationId);
    if (this.selectedConversationId !== input.conversationId) {
      this.selectedConversationId = input.conversationId;
      this.changed(input.conversationId, 1, 'selection');
    }
    return this.snapshot({ conversationId: input.conversationId });
  }

  snapshot(input: MorpheusAssistantSnapshotPayload = {}): MorpheusAssistantSnapshot {
    const conversationId = input.conversationId ?? this.selectedConversationId;
    validateConversationId(conversationId);
    const conversation = this.conversations.get(conversationId) ?? {
      draft: { conversationId, revision: 0, text: '' },
      turnIds: [],
    };
    const pendingTurns: MorpheusAssistantPendingTurn[] = [];
    for (const turn of this.turns.values()) {
      if (turn.ref.status === 'admitted' && turn.text !== null) {
        pendingTurns.push({ ...cloneTurn(turn.ref), text: turn.text });
      }
    }
    return {
      schemaVersion: MORPHEUS_ASSISTANT_SESSION_VERSION,
      sequence: this.sequence,
      selectedConversationId: this.selectedConversationId,
      conversationId,
      draft: { ...conversation.draft },
      turns: conversation.turnIds.map((id) => cloneTurn(this.turns.get(id)!.ref)),
      pendingTurns,
    };
  }

  updateDraft(input: MorpheusAssistantDraftPayload): MorpheusAssistantDraft {
    const conversation = this.ensureConversation(input.conversationId);
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
      throw new MorpheusAssistantSessionError('invalid draft revision');
    }
    if (typeof input.text !== 'string' || input.text.length > MORPHEUS_ASSISTANT_MAX_TEXT_CHARS) {
      throw new MorpheusAssistantSessionError('draft exceeds 4000 characters');
    }
    if (conversation.draft.revision !== input.expectedRevision) {
      throw new MorpheusAssistantSessionError('stale draft revision');
    }
    if (conversation.draft.text !== input.text) {
      conversation.draft = {
        conversationId: input.conversationId,
        revision: conversation.draft.revision + 1,
        text: input.text,
      };
      this.changed(input.conversationId, 1, 'draft');
    }
    return { ...conversation.draft };
  }

  admitTurn(input: MorpheusAssistantAdmitTurnPayload): MorpheusAssistantTurn {
    validateConversationId(input.conversationId);
    if (typeof input.clientRequestId !== 'string' || input.clientRequestId.length < 1
      || input.clientRequestId.length > 128 || !/^[a-zA-Z0-9:_-]+$/.test(input.clientRequestId)) {
      throw new MorpheusAssistantSessionError('invalid clientRequestId');
    }
    if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > MORPHEUS_ASSISTANT_MAX_TEXT_CHARS) {
      throw new MorpheusAssistantSessionError('turn text must be between 1 and 4000 characters');
    }
    if (!['orb', 'compact', 'full', 'voice', 'onboarding'].includes(input.source)) {
      throw new MorpheusAssistantSessionError('unsupported turn source');
    }
    const requestHash = createHash('sha256')
      .update(JSON.stringify([input.conversationId, input.text, input.source])).digest('hex');
    const existing = this.requests.get(input.clientRequestId);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new MorpheusAssistantSessionError('clientRequestId was reused with different content');
      }
      return cloneTurn(existing.ref);
    }
    const conversation = this.ensureConversation(input.conversationId);
    if (this.requests.size >= MAX_REMEMBERED_REQUESTS) {
      throw new MorpheusAssistantSessionError('assistant idempotency capacity reached');
    }
    if ([...this.turns.values()].filter((turn) => turn.ref.status === 'admitted').length >= MORPHEUS_ASSISTANT_MAX_PENDING_TURNS) {
      throw new MorpheusAssistantSessionError('assistant turn queue is full');
    }
    const turnId = `turn:${this.options.createId?.() ?? randomUUID()}`;
    if (this.turns.has(turnId)) throw new MorpheusAssistantSessionError('assistant turn id collision');
    const ref: MorpheusAssistantTurn = {
      conversationId: input.conversationId,
      turnId,
      clientRequestId: input.clientRequestId,
      source: input.source,
      status: 'admitted',
      generation: 1,
      admittedAt: this.now(),
    };
    const stored: StoredTurn = { ref, requestHash, text: input.text, sourceSequence: 0 };
    this.requests.set(input.clientRequestId, stored);
    this.turns.set(turnId, stored);
    conversation.turnIds.push(turnId);
    if (conversation.turnIds.length > MAX_TURN_REFERENCES_PER_CONVERSATION) conversation.turnIds.shift();
    if (conversation.draft.text === input.text) {
      conversation.draft = { conversationId: input.conversationId, revision: conversation.draft.revision + 1, text: '' };
      this.changed(input.conversationId, 1, 'draft');
    }
    this.changed(input.conversationId, ref.generation, 'turn-admitted');
    return cloneTurn(ref);
  }

  ackTurn(input: MorpheusAssistantAckTurnPayload): MorpheusAssistantTurn {
    const turn = this.turns.get(input.turnId);
    if (!turn || turn.ref.conversationId !== input.conversationId) {
      throw new MorpheusAssistantSessionError('unknown assistant turn for conversation');
    }
    if (turn.ref.status === 'admitted') {
      turn.ref = { ...turn.ref, status: 'dispatched' };
      turn.text = null;
      this.changed(input.conversationId, turn.ref.generation, 'turn-dispatched');
    }
    return cloneTurn(turn.ref);
  }

  applyTurnEvent(input: MorpheusAssistantTurnEventInput): MorpheusAssistantTurnEventOutcome {
    const turn = this.turns.get(input.turnId);
    if (!turn || turn.ref.conversationId !== input.conversationId) return 'unknown-turn';
    if (turn.ref.generation !== input.generation || turn.ref.status === 'cancelled') return 'stale-generation';
    if (!Number.isSafeInteger(input.sourceSequence) || input.sourceSequence <= turn.sourceSequence) return 'duplicate-or-stale';
    if (input.sourceSequence !== turn.sourceSequence + 1) return 'resync-required';
    if (turn.ref.status === 'completed' || turn.ref.status === 'failed') return 'duplicate-or-stale';
    turn.sourceSequence = input.sourceSequence;
    turn.ref = {
      ...turn.ref,
      status: input.status,
      ...(input.resultRef ? { resultRef: input.resultRef } : {}),
    };
    turn.text = null;
    this.changed(input.conversationId, turn.ref.generation, 'turn-updated');
    return 'accepted';
  }

  /** Invalidates a pending generation before cancelled work can publish again. */
  invalidateTurn(input: MorpheusAssistantAckTurnPayload): MorpheusAssistantTurn {
    const turn = this.turns.get(input.turnId);
    if (!turn || turn.ref.conversationId !== input.conversationId) {
      throw new MorpheusAssistantSessionError('unknown assistant turn for conversation');
    }
    if (turn.ref.status === 'completed' || turn.ref.status === 'failed') return cloneTurn(turn.ref);
    if (turn.ref.status !== 'cancelled') {
      turn.ref = { ...turn.ref, generation: turn.ref.generation + 1, status: 'cancelled' };
      turn.text = null;
      this.changed(input.conversationId, turn.ref.generation, 'turn-updated');
    }
    return cloneTurn(turn.ref);
  }
}
