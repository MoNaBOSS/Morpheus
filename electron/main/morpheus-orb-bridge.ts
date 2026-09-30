import { app, ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { getSetting } from '../utils/store';
import { resolveSupportedLanguage } from '../../shared/language';
import en from '../../shared/i18n/locales/en/dashboard.json';
import zh from '../../shared/i18n/locales/zh/dashboard.json';
import ja from '../../shared/i18n/locales/ja/dashboard.json';
import ru from '../../shared/i18n/locales/ru/dashboard.json';
import {
  MORPHEUS_ASSISTANT_MAX_TEXT_CHARS,
  type MorpheusAssistantAdmitTurnPayload,
  type MorpheusAssistantDraftPayload,
  type MorpheusAssistantSnapshot,
  type MorpheusAssistantDraft,
  type MorpheusAssistantTurn,
} from '../../shared/morpheus/assistant-session-types';

type OrbPresentationAction = 'hover' | 'collapse' | 'open' | 'focus';
type OrbEvent = Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>;

export type MorpheusOrbBridgeOptions = {
  getOrbWebContents: () => WebContents | null;
  snapshot: () => Promise<MorpheusAssistantSnapshot>;
  updateDraft: (payload: MorpheusAssistantDraftPayload) => Promise<MorpheusAssistantDraft>;
  admitTurn: (payload: MorpheusAssistantAdmitTurnPayload) => Promise<MorpheusAssistantTurn>;
  present: (action: OrbPresentationAction) => void;
};

function exactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && Object.keys(value).every((key) => keys.includes(key)));
}

function requireTrustedOrb(event: OrbEvent, getOrbWebContents: () => WebContents | null): void {
  const trusted = getOrbWebContents();
  if (!trusted || trusted.isDestroyed() || event.sender !== trusted || event.senderFrame !== trusted.mainFrame) {
    throw new Error('Untrusted Morpheus orb request');
  }
}

function requireDraft(value: unknown): MorpheusAssistantDraftPayload {
  if (!exactRecord(value, ['conversationId', 'expectedRevision', 'text'])
    || typeof value.conversationId !== 'string' || value.conversationId.length < 1 || value.conversationId.length > 200
    || !Number.isSafeInteger(value.expectedRevision) || (value.expectedRevision as number) < 0
    || typeof value.text !== 'string' || value.text.length > MORPHEUS_ASSISTANT_MAX_TEXT_CHARS) {
    throw new Error('Invalid orb draft');
  }
  return value as MorpheusAssistantDraftPayload;
}

function requireTurn(value: unknown): MorpheusAssistantAdmitTurnPayload {
  if (!exactRecord(value, ['conversationId', 'clientRequestId', 'text', 'source'])
    || typeof value.conversationId !== 'string' || value.conversationId.length < 1 || value.conversationId.length > 200
    || typeof value.clientRequestId !== 'string' || value.clientRequestId.length < 1 || value.clientRequestId.length > 128
    || typeof value.text !== 'string' || !value.text.trim() || value.text.length > MORPHEUS_ASSISTANT_MAX_TEXT_CHARS
    || value.source !== 'orb') {
    throw new Error('Invalid orb turn');
  }
  return value as MorpheusAssistantAdmitTurnPayload;
}

const dictionaries = { en, zh, ja, ru };

/** The orb has no generic host bridge. Only these fixed, sender-checked actions exist. */
export function createMorpheusOrbHandlers(options: MorpheusOrbBridgeOptions) {
  const trust = (event: OrbEvent) => requireTrustedOrb(event, options.getOrbWebContents);
  return {
    snapshot: async (event: OrbEvent, ...args: unknown[]) => {
      trust(event);
      if (args.length !== 0) throw new Error('Invalid orb snapshot request');
      const snapshot = await options.snapshot();
      const language = resolveSupportedLanguage(await getSetting('language'), resolveSupportedLanguage(app.getLocale()));
      const messages = dictionaries[language].morpheus;
      return {
        ...snapshot,
        presentation: {
          language,
          placeholder: messages.workspace.placeholder,
          submit: messages.activationV2.send,
          open: messages.workspace.openCompact,
        },
      };
    },
    updateDraft: async (event: OrbEvent, ...args: unknown[]) => {
      trust(event);
      if (args.length !== 1) throw new Error('Invalid orb draft request');
      return options.updateDraft(requireDraft(args[0]));
    },
    admitTurn: async (event: OrbEvent, ...args: unknown[]) => {
      trust(event);
      if (args.length !== 1) throw new Error('Invalid orb turn request');
      return options.admitTurn(requireTurn(args[0]));
    },
    present: (event: OrbEvent, ...args: unknown[]) => {
      trust(event);
      if (args.length !== 1 || !['hover', 'collapse', 'open', 'focus'].includes(args[0] as string)) {
        throw new Error('Invalid orb presentation request');
      }
      options.present(args[0] as OrbPresentationAction);
    },
  };
}

export function registerMorpheusOrbBridge(options: MorpheusOrbBridgeOptions): () => void {
  const handlers = createMorpheusOrbHandlers(options);
  const entries = [
    ['morpheus-orb:snapshot', handlers.snapshot],
    ['morpheus-orb:update-draft', handlers.updateDraft],
    ['morpheus-orb:admit-turn', handlers.admitTurn],
    ['morpheus-orb:present', handlers.present],
  ] as const;
  for (const [channel, handler] of entries) ipcMain.handle(channel, handler);
  return () => { for (const [channel] of entries) ipcMain.removeHandler(channel); };
}
