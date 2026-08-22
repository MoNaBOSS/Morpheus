import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  });
});

describe('Morpheus operator interface state', () => {
  it('sends only text, mode and surface to the Main-owned router', async () => {
    routeInteraction.mockResolvedValue({
      route: 'objective', reason: 'act-selected', confidence: 'explicit', text: 'Build the site',
    });
    useMorpheusOperatorStore.getState().setMode('act');

    await expect(useMorpheusOperatorStore.getState().route('  Build the site  ', 'presence'))
      .resolves.toMatchObject({ route: 'objective' });
    expect(routeInteraction).toHaveBeenCalledWith({
      text: '  Build the site  ', mode: 'act', surface: 'presence',
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

  it('projects ambiguous command decisions as clarification without execution authority', async () => {
    routeInteraction.mockResolvedValue({
      route: 'clarification', reason: 'ambiguous-command', confidence: 'low', text: 'Do that thing',
    });

    await useMorpheusOperatorStore.getState().route('Do that thing', 'quick-command');
    expect(useMorpheusOperatorStore.getState()).toMatchObject({
      clarification: 'Do that thing',
      pendingConversation: null,
    });
  });
});
