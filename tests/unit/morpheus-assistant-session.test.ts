import { describe, expect, it, vi } from 'vitest';

import { MorpheusAssistantSession } from '@electron/services/morpheus-assistant-session';
import {
  validateAssistantAckTurnPayload,
  validateAssistantAdmitTurnPayload,
  validateAssistantDraftPayload,
} from '@electron/services/morpheus-api';

function makeSession() {
  let id = 0;
  const emit = vi.fn();
  const session = new MorpheusAssistantSession({
    now: () => new Date('2026-09-30T00:00:00.000Z'),
    createId: () => `fixture-${++id}`,
    emit,
  });
  return { session, emit };
}

describe('Main assistant session projection', () => {
  it('admits an identical request once, including after dispatch, and rejects changed content or conversation', () => {
    const { session, emit } = makeSession();
    const request = {
      conversationId: 'agent:main:main', clientRequestId: 'client-1', text: 'Hello Morpheus', source: 'orb' as const,
    };
    const first = session.admitTurn(request);
    expect(session.admitTurn(request)).toEqual(first);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(session.snapshot().pendingTurns).toMatchObject([{ turnId: first.turnId, text: request.text }]);

    const dispatched = session.ackTurn({ conversationId: request.conversationId, turnId: first.turnId });
    expect(dispatched.status).toBe('dispatched');
    expect(session.snapshot().pendingTurns).toEqual([]);
    expect(session.admitTurn(request)).toEqual(dispatched);
    expect(() => session.admitTurn({ ...request, text: 'Goodbye Morpheus' })).toThrow(/reused with different content/);
    expect(() => session.admitTurn({ ...request, conversationId: 'agent:main:other' })).toThrow(/reused with different content/);
  });

  it('keeps rapid turns in arrival order and never attributes one to the selected conversation', () => {
    const { session } = makeSession();
    const first = session.admitTurn({
      conversationId: 'agent:main:main', clientRequestId: 'rapid-1', text: 'First question', source: 'compact',
    });
    const second = session.admitTurn({
      conversationId: 'agent:main:other', clientRequestId: 'rapid-2', text: 'Second question', source: 'compact',
    });
    const third = session.admitTurn({
      conversationId: 'agent:main:main', clientRequestId: 'rapid-3', text: 'Third question', source: 'compact',
    });
    session.selectConversation({ conversationId: 'agent:main:other' });

    expect(session.snapshot().pendingTurns.map(({ turnId, conversationId }) => [turnId, conversationId])).toEqual([
      [first.turnId, 'agent:main:main'],
      [second.turnId, 'agent:main:other'],
      [third.turnId, 'agent:main:main'],
    ]);
    expect(session.snapshot().turns.map(({ turnId }) => turnId)).toEqual([second.turnId]);
    expect(session.snapshot({ conversationId: 'agent:main:main' }).turns.map(({ turnId }) => turnId))
      .toEqual([first.turnId, third.turnId]);
    expect(() => session.ackTurn({ conversationId: 'agent:main:other', turnId: first.turnId })).toThrow(/unknown assistant turn/);
    expect(session.snapshot().pendingTurns).toHaveLength(3);
  });

  it('rejects new admissions at capacity without replacing an unconsumed turn', () => {
    const { session } = makeSession();
    for (let index = 0; index < 32; index++) {
      session.admitTurn({
        conversationId: 'agent:main:main', clientRequestId: `capacity-${index}`, text: `Turn ${index}`, source: 'orb',
      });
    }
    expect(() => session.admitTurn({
      conversationId: 'agent:main:main', clientRequestId: 'capacity-32', text: 'One too many', source: 'orb',
    })).toThrow(/queue is full/);
    expect(session.snapshot().pendingTurns).toHaveLength(32);
    const first = session.snapshot().pendingTurns[0];
    expect(session.admitTurn({
      conversationId: first.conversationId, clientRequestId: first.clientRequestId, text: first.text, source: first.source,
    }).turnId).toBe(first.turnId);
    session.ackTurn({ conversationId: first.conversationId, turnId: first.turnId });
    expect(session.admitTurn({
      conversationId: 'agent:main:main', clientRequestId: 'capacity-32', text: 'Now admitted', source: 'orb',
    }).status).toBe('admitted');
  });

  it('checks draft revisions and only clears a matching draft on first admission', () => {
    const { session } = makeSession();
    const conversationId = 'agent:main:main';
    expect(session.updateDraft({ conversationId, expectedRevision: 0, text: 'Send me' }).revision).toBe(1);
    expect(() => session.updateDraft({ conversationId, expectedRevision: 0, text: 'Stale write' })).toThrow(/stale draft/);
    const request = { conversationId, clientRequestId: 'draft-1', text: 'Send me', source: 'orb' as const };
    session.admitTurn(request);
    expect(session.snapshot().draft).toMatchObject({ revision: 2, text: '' });
    session.updateDraft({ conversationId, expectedRevision: 2, text: 'New unsent draft' });
    session.admitTurn(request);
    expect(session.snapshot().draft).toMatchObject({ revision: 3, text: 'New unsent draft' });
  });

  it('rejects stale generations, duplicates and gaps in Main-owned result events', () => {
    const { session } = makeSession();
    const first = session.admitTurn({
      conversationId: 'agent:main:main', clientRequestId: 'event-1', text: 'Research', source: 'compact',
    });
    session.ackTurn({ conversationId: first.conversationId, turnId: first.turnId });
    const event = {
      conversationId: first.conversationId, turnId: first.turnId, generation: first.generation,
      sourceSequence: 1, status: 'completed' as const, resultRef: 'acp:message-1',
    };
    expect(session.applyTurnEvent({ ...event, sourceSequence: 2 })).toBe('resync-required');
    expect(session.applyTurnEvent(event)).toBe('accepted');
    expect(session.applyTurnEvent(event)).toBe('duplicate-or-stale');
    expect(session.snapshot().turns[0]).toMatchObject({ status: 'completed', resultRef: 'acp:message-1' });

    const second = session.admitTurn({
      conversationId: 'agent:main:other', clientRequestId: 'event-2', text: 'Other work', source: 'compact',
    });
    expect(session.applyTurnEvent({ ...event, turnId: second.turnId })).toBe('unknown-turn');
    session.invalidateTurn({ conversationId: second.conversationId, turnId: second.turnId });
    expect(session.applyTurnEvent({ ...event, conversationId: second.conversationId, turnId: second.turnId }))
      .toBe('stale-generation');
  });

  it('rejects unknown host payload keys before they reach Main state', () => {
    expect(() => validateAssistantAdmitTurnPayload({
      conversationId: 'agent:main:main', clientRequestId: 'bad', text: 'Hi', source: 'orb', executable: 'cmd.exe',
    })).toThrow(/unsupported key/);
    expect(() => validateAssistantDraftPayload({
      conversationId: 'agent:main:main', expectedRevision: -1, text: 'bad',
    })).toThrow(/invalid draft revision/);
    expect(() => validateAssistantAckTurnPayload({
      conversationId: 'agent:main:main', turnId: 'not-a-turn',
    })).toThrow(/invalid turnId/);
  });
});
