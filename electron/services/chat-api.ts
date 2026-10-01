import type { BrowserWindow } from 'electron';
import type { GatewayManager } from '../gateway/manager';
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { createAcpChatService } from './acp-chat-service';
import type { AcpSessionAccessRegistry } from './acp-session-access-registry';
import type { AcpChatPromptPayload } from '@shared/acp-chat/types';
import type { MorpheusPersonaContext } from '@shared/morpheus/persona-context';

export function createChatApi({
  gatewayManager,
  mainWindow,
  acpSessionAccessRegistry,
  getCompanionPersona,
}: {
  gatewayManager: GatewayManager;
  mainWindow: BrowserWindow;
  acpSessionAccessRegistry: AcpSessionAccessRegistry;
  getCompanionPersona?: (payload: AcpChatPromptPayload) => MorpheusPersonaContext | undefined;
}): CompleteHostServiceRegistry['chat'] {
  const acpChat = createAcpChatService(mainWindow, acpSessionAccessRegistry, gatewayManager, getCompanionPersona);

  return {
    loadAcpSession: (payload) => acpChat.loadSession(payload),
    sendAcpPrompt: (payload) => acpChat.sendPrompt(payload),
    cancelAcpSession: (payload) => acpChat.cancelSession(payload),
    respondAcpPermission: (payload) => acpChat.respondPermission(payload),
  };
}
