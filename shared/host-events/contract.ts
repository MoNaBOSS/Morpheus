import type {
  AcpPermissionRequestEnvelope,
  AcpSessionUpdateEnvelope,
} from '../acp-chat/types';
import type { UpdateStatusSnapshot } from '../host-api/contract';
import type { ChatRuntimeEvent } from '../chat-runtime-events';
import type { MorpheusActionEvent } from '../morpheus/action-types';
import type { MorpheusObjectiveEvent } from '../morpheus/core/objective-types';
import type { MorpheusRiskTier } from '../morpheus/actions/registry';
import type {
  GatewayNotification,
  GatewayRuntimePayload,
  GatewayRuntimeRecord,
  GatewayStatus,
} from '../types/gateway';
export type { GatewayRuntimePayload } from '../types/gateway';

export type JsonRecord = Record<string, unknown>;

export type GatewayErrorEvent = string | { message?: string };
export type GatewayChatMessageEvent = GatewayRuntimeRecord & {
  message?: GatewayRuntimePayload;
  runId?: GatewayRuntimePayload;
};
export type GatewayChannelStatusEvent = {
  channelId: string;
  status: string;
};
export type GatewayExitEvent = number | null | { code: number | null };

export type OAuthCodeEvent =
  | {
    provider: string;
    mode: 'manual';
    authorizationUrl: string;
    message?: string;
  }
  | {
    provider: string;
    mode?: 'device';
    verificationUri: string;
    userCode: string;
    expiresIn: number;
  };
export type OAuthSuccessEvent = {
  provider: string;
  accountId: string;
  success?: boolean;
};
export type OAuthErrorEvent = {
  message: string;
};

export type ChannelQrEvent = {
  qr?: string;
  raw?: string;
  sessionKey?: string;
};
export type ChannelSuccessEvent = {
  accountId?: string;
  rawAccountId?: string;
  message?: string;
};
export type ChannelErrorEvent = string | { message?: string };

export type UpdateAutoInstallCountdownEvent = {
  seconds: number;
  cancelled?: boolean;
};

export type HostEventContract = {
  gateway: {
    statusChanged: (payload: GatewayStatus) => void;
    message: (payload: unknown) => void;
    notification: (payload: GatewayNotification) => void;
    healthChanged: (payload: GatewayRuntimePayload) => void;
    presenceChanged: (payload: GatewayRuntimePayload) => void;
    chatMessage: (payload: GatewayChatMessageEvent) => void;
    channelStatus: (payload: GatewayChannelStatusEvent) => void;
    exit: (payload: GatewayExitEvent) => void;
    error: (payload: GatewayErrorEvent) => void;
  };
  chat: {
    runtimeEvent: (payload: ChatRuntimeEvent) => void;
    acpSessionUpdate: (payload: AcpSessionUpdateEnvelope) => void;
    acpPermissionRequest: (payload: AcpPermissionRequestEnvelope) => void;
  };
  oauth: {
    code: (payload: OAuthCodeEvent) => void;
    success: (payload: OAuthSuccessEvent) => void;
    error: (payload: OAuthErrorEvent) => void;
  };
  channel: {
    qr: (payload: ChannelQrEvent) => void;
    success: (payload: ChannelSuccessEvent) => void;
    error: (payload: ChannelErrorEvent) => void;
  };
  updates: {
    statusChanged: (payload: UpdateStatusSnapshot) => void;
    autoInstallCountdown: (payload: UpdateAutoInstallCountdownEvent) => void;
  };
  app: {
    navigate: (path: string) => void;
    newChat: () => void;
    openClawCliInstalled: (installedPath: string) => void;
  };
  /**
   * One channel for the whole Morpheus run lifecycle. The discriminated `phase`
   * in the envelope distinguishes transitions, so adding a phase never adds a
   * channel. Every emission originates from a real Main-process transition.
   */
  morpheus: {
    actionEvent: (payload: MorpheusActionEvent) => void;
    /** Fixed global shortcut requested the trusted Quick Command surface. */
    quickCommand: (payload: { trigger: 'global-shortcut' | 'tray' }) => void;
    /** Fixed global shortcut requested the trusted microphone surface. */
    voiceCommand: (payload: { trigger: 'global-shortcut' | 'tray' }) => void;
    /**
     * ONE batched consent request per plan, carrying only the trust boundaries
     * that are genuinely new. Separate from the run lifecycle because it is a
     * plan-level question, not a phase of any single run.
     */
    planConsent: (payload: MorpheusPlanConsentEvent) => void;
    /** Truthful Main-owned state of the unified objective pipeline. */
    objectiveEvent: (payload: MorpheusObjectiveEvent) => void;
  };
};

/** A trust boundary as presented to the user. */
export type MorpheusConsentBoundary = {
  boundaryId: string;
  capabilityId: string;
  /**
   * Trust group this decision actually covers, when there is one.
   *
   * The prompt must name the GROUP, not the single verb that triggered it —
   * approving "read this file" when the decision really grants reading,
   * listing and searching the whole workspace would understate what the user
   * is agreeing to.
   */
  capabilityGroup?: string;
  /** Exact resource — an application key or a canonical directory. */
  resourceScope: string;
  riskTier: MorpheusRiskTier;
  /** Steps this single approval covers. */
  stepIds: readonly string[];
  /**
   * Concrete targets Main resolved — the specific file or executable. The
   * scope is what a remembered grant covers; this is what happens now.
   */
  targets: readonly string[];
  /** When true, the decision may not be remembered. */
  mandatoryConfirmation: boolean;
};

export type MorpheusPlanConsentEvent = {
  planId: string;
  objective: string;
  boundaries: readonly MorpheusConsentBoundary[];
};

export type HostEventModule = keyof HostEventContract;
export type HostEventName<M extends HostEventModule> = keyof HostEventContract[M] & string;
export type HostEventHandler<
  M extends HostEventModule,
  E extends HostEventName<M>,
> = HostEventContract[M][E];
export type HostEventArgs<
  M extends HostEventModule,
  E extends HostEventName<M>,
> = HostEventHandler<M, E> extends (...args: infer Args) => void ? Args : never;

export const HOST_EVENT_CHANNELS = {
  gateway: {
    statusChanged: 'gateway:status-changed',
    message: 'gateway:message',
    notification: 'gateway:notification',
    healthChanged: 'gateway:health-changed',
    presenceChanged: 'gateway:presence-changed',
    chatMessage: 'gateway:chat-message',
    channelStatus: 'gateway:channel-status',
    exit: 'gateway:exit',
    error: 'gateway:error',
  },
  chat: {
    runtimeEvent: 'chat:runtime-event',
    acpSessionUpdate: 'chat:acp-session-update',
    acpPermissionRequest: 'chat:acp-permission-request',
  },
  oauth: {
    code: 'oauth:code',
    success: 'oauth:success',
    error: 'oauth:error',
  },
  updates: {
    statusChanged: 'update:status-changed',
    autoInstallCountdown: 'update:auto-install-countdown',
  },
  app: {
    navigate: 'navigate',
    newChat: 'new-chat',
    openClawCliInstalled: 'openclaw:cli-installed',
  },
  morpheus: {
    actionEvent: 'morpheus:action-event',
    quickCommand: 'morpheus:quick-command',
    voiceCommand: 'morpheus:voice-command',
    planConsent: 'morpheus:plan-consent',
    objectiveEvent: 'morpheus:objective-event',
  },
} as const satisfies {
  [M in Exclude<HostEventModule, 'channel'>]: {
    [E in HostEventName<M>]: string;
  };
};

export function buildHostChannelEventName(
  channel: string,
  event: HostEventName<'channel'>,
): string {
  return `channel:${channel}-${event}`;
}
