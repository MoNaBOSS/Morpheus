import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from 'i18next';

const routeInteraction = vi.hoisted(() => vi.fn());

vi.mock('@/lib/host-api', () => ({
  hostApi: { morpheus: { routeInteraction } },
}));

import { useMorpheusOperatorStore } from '@/stores/morpheus-operator';

beforeEach(() => {
  routeInteraction.mockReset();
  useMorpheusOperatorStore.setState({
    mode: 'auto',
    lastDecision: null,
    clarification: null,
    pendingConversation: null,
    pendingConversations: [],
  });
});

describe('Morpheus operator interface state', () => {
  it('uses automatic routing even when an old mode preference remains saved', async () => {
    routeInteraction.mockResolvedValue({
      route: 'objective', reason: 'act-selected', confidence: 'explicit', text: 'Build the site',
    });
    useMorpheusOperatorStore.getState().setMode('act');

    await expect(useMorpheusOperatorStore.getState().route('  Build the site  ', 'presence'))
      .resolves.toMatchObject({ route: 'objective' });
    expect(routeInteraction).toHaveBeenCalledWith({
      text: '  Build the site  ', mode: 'auto', surface: 'presence',
    });
  });

  it('queues a conversation exactly once for the OpenClaw Chat surface', () => {
    useMorpheusOperatorStore.getState().queueConversation('How should I approach this?');
    const pending = useMorpheusOperatorStore.getState().pendingConversation;
    expect(pending).toMatchObject({ text: 'How should I approach this?' });

    useMorpheusOperatorStore.getState().consumeConversation(pending!.requestId);
    expect(useMorpheusOperatorStore.getState().pendingConversation).toBeNull();
    useMorpheusOperatorStore.getState().consumeConversation(pending!.requestId);
    expect(useMorpheusOperatorStore.getState().pendingConversation).toBeNull();
  });

  it('keeps rapid conversation requests in FIFO order until each is consumed', () => {
    const store = useMorpheusOperatorStore.getState();
    store.queueConversation('First question');
    store.queueConversation('Second question');
    const [first, second] = useMorpheusOperatorStore.getState().pendingConversations;
    expect(first.text).toBe('First question');
    expect(second.text).toBe('Second question');
    expect(second.requestId).not.toBe(first.requestId);

    store.consumeConversation(first.requestId);
    expect(useMorpheusOperatorStore.getState().pendingConversation).toEqual(second);
    store.consumeConversation(first.requestId);
    expect(useMorpheusOperatorStore.getState().pendingConversations).toEqual([second]);
    store.consumeConversation(second.requestId);
    expect(useMorpheusOperatorStore.getState().pendingConversation).toBeNull();
  });

  it('projects ambiguous command decisions as clarification without execution authority', async () => {
    routeInteraction.mockResolvedValue({
      route: 'clarification', reason: 'ambiguous-command', confidence: 'low', text: 'Do that thing',
    });

    await useMorpheusOperatorStore.getState().route('Do that thing', 'quick-command');
    expect(useMorpheusOperatorStore.getState()).toMatchObject({
      clarification: i18n.t('dashboard:morpheus.operator.clarification'),
      pendingConversation: null,
    });
    expect(useMorpheusOperatorStore.getState().lastDecision?.text).toBe('Do that thing');
    expect(useMorpheusOperatorStore.getState().clarification).not.toBe('Do that thing');
  });
});
