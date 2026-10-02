import type { BrowserWindow } from 'electron';
import type { GatewayManager } from '../gateway/manager';
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { createAcpChatService, type AcpPromptDispatchHook } from './acp-chat-service';
import type { AcpSessionAccessRegistry } from './acp-session-access-registry';
import type { AcpChatPromptPayload } from '@shared/acp-chat/types';
import type { MorpheusPersonaContext } from '@shared/morpheus/persona-context';
import type { MorpheusAssistantSession } from './morpheus-assistant-session';

/** Captures one text-only Main admission before dispatch and consumes it once. */
export function createMorpheusAcpAdmissionHook(assistantSession: MorpheusAssistantSession): AcpPromptDispatchHook {
  return (payload) => {
    const pending = assistantSession.snapshot().pendingTurns.find((turn) =>
      turn.conversationId === payload.sessionKey && turn.turnId === payload.messageId && turn.text === payload.message);
    if (!pending || payload.media?.length) return undefined;
    return ({ outcome }) => {
      const current = assistantSession.snapshot().pendingTurns.find((turn) =>
        turn.conversationId === pending.conversationId && turn.turnId === pending.turnId
        && turn.generation === pending.generation && turn.clientRequestId === pending.clientRequestId
        && turn.text === pending.text);
      if (!current) return;
      const identity = { conversationId: current.conversationId, turnId: current.turnId };
      if (outcome === 'cancelled') assistantSession.invalidateTurn(identity);
      else if (outcome === 'failed') assistantSession.applyTurnEvent({ ...identity, generation: current.generation, sourceSequence: 1, status: 'failed' });
      else assistantSession.ackTurn(identity); // Dispatch consumed, not task success.
    };
  };
}

export function createChatApi({
  gatewayManager,
  mainWindow,
  acpSessionAccessRegistry,
  getCompanionPersona,
  onPromptDispatched,
}: {
  gatewayManager: GatewayManager;
  mainWindow: BrowserWindow;
  acpSessionAccessRegistry: AcpSessionAccessRegistry;
  getCompanionPersona?: (payload: AcpChatPromptPayload) => MorpheusPersonaContext | undefined;
  onPromptDispatched?: AcpPromptDispatchHook;
}): CompleteHostServiceRegistry['chat'] {
  const acpChat = createAcpChatService(mainWindow, acpSessionAccessRegistry, gatewayManager, getCompanionPersona, onPromptDispatched);

  return {
    loadAcpSession: (payload) => acpChat.loadSession(payload),
    sendAcpPrompt: (payload) => acpChat.sendPrompt(payload),
    cancelAcpSession: (payload) => acpChat.cancelSession(payload),
    respondAcpPermission: (payload) => acpChat.respondPermission(payload),
  };
}
