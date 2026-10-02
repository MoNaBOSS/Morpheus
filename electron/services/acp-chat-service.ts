import type { BrowserWindow } from 'electron';
import { fork, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type Client,
  type ContentBlock,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
} from '@agentclientprotocol/sdk';
import { HOST_EVENT_CHANNELS } from '@shared/host-events/contract';
import type {
  AcpChatCancelPayload,
  AcpChatLoadPayload,
  AcpChatOperationResult,
  AcpChatPromptPayload,
  AcpChatRespondPermissionPayload,
  AcpPermissionRequestEnvelope,
  AcpSessionUpdateEnvelope,
} from '@shared/acp-chat/types';
import { getOpenClawEmbeddedForkSpec } from '../utils/openclaw-cli';
import {
  approvePendingLocalDeviceRequests,
  type GatewayPairingRpcClient,
} from '../utils/control-ui-device-pairing';
import { logger } from '../utils/logger';
import { recordAcpTrace } from './acp-trace';
import { AcpSessionAccessRegistry, type AcpSessionAccessContext } from './acp-session-access-registry';
import { expandPath } from '../utils/paths';
import { getSetting } from '../utils/store';
import { MORPHEUS_PERSONA_CONTENT_META, type MorpheusPersonaContext } from '@shared/morpheus/persona-context';

type AcpConnection = Pick<ClientSideConnection, 'initialize' | 'newSession' | 'loadSession' | 'prompt' | 'cancel'>;
type MainWindowLike = {
  webContents: Pick<BrowserWindow['webContents'], 'send'>;
};
type PermissionWaiter = {
  sessionKey: string;
  generation: number;
  envelope: AcpPermissionRequestEnvelope;
  resolve: (response: RequestPermissionResponse) => void;
};
type AcpSessionLoadBatch = {
  sessionKey: string;
  generation: number;
  sessionUpdates: Array<{
    acpSessionId: string;
    envelope: AcpSessionUpdateEnvelope;
  }>;
};
type AcpLivePromptContext = {
  sessionKey: string;
  acpSessionId: string;
  generation: number;
  accessGrant: AcpSessionAccessContext;
  completed: Promise<void>;
  finish: () => void;
};
// Recent Main-process receipts suppress renderer retries. Durable admissions and
// ACP history remain their owners; this cache is not permanent conversation storage.
const MAX_SETTLED_PROMPT_RECEIPTS = 256;
const MAX_ACTIVE_PROMPT_RECEIPTS = 32;
type AcpPromptReceipt = { fingerprint: string; promise?: Promise<AcpChatOperationResult>; dispatched: boolean; inFlight: boolean };
export type AcpPromptSettlement = { outcome: 'completed' | 'cancelled' | 'failed' };
export type AcpPromptDispatchHook = (payload: AcpChatPromptPayload) =>
  ((settlement: AcpPromptSettlement) => void | Promise<void>) | undefined;
type AcpChildProcess = ChildProcess & {
  stdin: NonNullable<ChildProcess['stdin']>;
  stdout: NonNullable<ChildProcess['stdout']>;
  stderr: NonNullable<ChildProcess['stderr']>;
};

function ok(generation?: number, sessionUpdates?: AcpSessionUpdateEnvelope[]): AcpChatOperationResult {
  return {
    success: true,
    ...(generation != null ? { generation } : {}),
    ...(sessionUpdates?.length ? { sessionUpdates } : {}),
  };
}

function fail(error: unknown): AcpChatOperationResult {
  return { success: false, error: error instanceof Error ? error.message : String(error) };
}

function cancelledPermissionResponse(): RequestPermissionResponse {
  return { outcome: { outcome: 'cancelled' } };
}

function isValidSessionKey(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('agent:') && value.length > 'agent:'.length;
}

function sessionUpdateType(notification: SessionNotification): string | undefined {
  const update = (notification as { update?: { sessionUpdate?: unknown } }).update;
  return typeof update?.sessionUpdate === 'string' ? update.sessionUpdate : undefined;
}

// OpenClaw can emit clack/doctor diagnostics to stdout during ACP startup.
// Keep those lines away from the SDK's strict NDJSON parser.
// Upstream fixed this in https://github.com/openclaw/openclaw/pull/89997 .
function filterAcpStdoutDiagnostics(output: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = output.getReader();
      let buffered = '';

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;

          buffered += decoder.decode(value, { stream: true });
          const lines = buffered.split('\n');
          buffered = lines.pop() ?? '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;
            if (trimmedLine.startsWith('{')) {
              controller.enqueue(encoder.encode(`${line}\n`));
            } else {
              logger.info(`[acp-chat] [stdout] ${line}`);
            }
          }
        }
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });
}

export class AcpChatService {
  private child: AcpChildProcess | null = null;
  private connection: AcpConnection | null;
  private initializing: Promise<AcpConnection> | null = null;
  private initialized = false;
  private generation = 0;
  private generationSeq = 0;
  private activeSessionKey: string | null = null;
  private activeAcpSessionId: string | null = null;
  private loadedSessionKey: string | null = null;
  private loadedAcpSessionId: string | null = null;
  private historicalSessionKey: string | null = null;
  private historicalGeneration: number | null = null;
  private permissionsEnabled = false;
  private loadQueue: Promise<void> | null = null;
  private loadRequestSeq = 0;
  private activeLoadBatch: AcpSessionLoadBatch | null = null;
  private readonly livePrompts = new Map<string, AcpLivePromptContext>();
  private readonly promptReceipts = new Map<string, AcpPromptReceipt>();
  private permissionSeq = 0;
  private readonly permissionWaiters = new Map<string, PermissionWaiter>();
  readonly client: Client;

  constructor(
    private readonly mainWindow: MainWindowLike,
    private readonly accessRegistry: AcpSessionAccessRegistry,
    injectedConnection?: AcpConnection,
    private readonly gateway?: GatewayPairingRpcClient,
    private readonly getCompanionPersona?: (payload: AcpChatPromptPayload) => MorpheusPersonaContext | undefined,
    private readonly onPromptDispatched?: AcpPromptDispatchHook,
  ) {
    this.connection = injectedConnection ?? null;
    this.client = {
      sessionUpdate: async (notification) => this.emitSessionUpdate(notification),
      requestPermission: async (request) => this.requestPermission(request),
    };
  }

  private trace(
    event: string,
    input: { direction?: string; sessionKey?: string | null; generation?: number; details?: unknown } = {},
  ): void {
    try {
      const sessionKey = input.sessionKey === null
        ? undefined
        : input.sessionKey ?? this.activeSessionKey ?? undefined;
      const generation = input.generation ?? (this.generation > 0 ? this.generation : undefined);
      recordAcpTrace({
        source: 'main',
        event,
        ...(input.direction ? { direction: input.direction } : {}),
        ...(sessionKey ? { sessionKey } : {}),
        ...(generation != null ? { generation } : {}),
        ...(input.details !== undefined ? { details: input.details } : {}),
      });
    } catch (error) {
      logger.warn(`[acp-chat] trace failed: ${String(error)}`);
    }
  }

  loadSession(payload: AcpChatLoadPayload): Promise<AcpChatOperationResult> {
    const requestSeq = ++this.loadRequestSeq;
    const loadPayload = payload.waitForActivePrompt === true ? { ...payload, createIfMissing: false } : payload;
    // Waiting for another owner's prompt must not occupy the global load slot:
    // the user can navigate elsewhere and return to answer its authority card.
    const activePrompt = loadPayload.waitForActivePrompt === true ? this.livePrompts.get(loadPayload.sessionKey) : undefined;
    if (activePrompt) return activePrompt.completed.then(() => this.loadRequestSeq === requestSeq
      ? this.loadSession({ ...loadPayload, waitForActivePrompt: false })
      : fail('ACP session recovery was superseded by another load'));
    const previousLoad = this.loadQueue;
    let releaseLoad!: () => void;
    const currentLoad = new Promise<void>((resolve) => {
      releaseLoad = resolve;
    });
    this.loadQueue = currentLoad;

    const run = async () => {
      if (previousLoad) await previousLoad;
      try {
        return await this.performLoadSession(loadPayload);
      } finally {
        releaseLoad();
        if (this.loadQueue === currentLoad) this.loadQueue = null;
      }
    };
    return run();
  }

  private async performLoadSession(payload: AcpChatLoadPayload): Promise<AcpChatOperationResult> {
    if (!isValidSessionKey(payload.sessionKey) || !payload.workspaceRoot || !payload.cwd) {
      return fail('Invalid ACP session load payload');
    }
    if (payload.waitForActivePrompt !== undefined && typeof payload.waitForActivePrompt !== 'boolean') {
      return fail('Invalid ACP prompt recovery control');
    }
    const previousPermissionsEnabled = this.permissionsEnabled;
    this.permissionsEnabled = false;
    this.trace('session/load:start', {
      sessionKey: payload.sessionKey,
      details: { createIfMissing: !!payload.createIfMissing, cwdPresent: Boolean(payload.cwd) },
    });

    let previousSessionKey = this.activeSessionKey;
    let previousAcpSessionId = this.activeAcpSessionId;
    let previousLoadedSessionKey = this.loadedSessionKey;
    let previousLoadedAcpSessionId = this.loadedAcpSessionId;
    let previousHistoricalSessionKey = this.historicalSessionKey;
    let previousHistoricalGeneration = this.historicalGeneration;
    let previousGeneration = this.generation;
    let nextGeneration = this.generationSeq + 1;
    let stateAdvanced = false;
    let loadBatch: AcpSessionLoadBatch | null = null;
    let previousAccessGrant: AcpSessionAccessContext | null = null;

    try {
      const connection = await this.ensureConnection();
      const livePrompt = this.livePrompts.get(payload.sessionKey);
      if (livePrompt) {
        const preparedAccessGrant = await this.accessRegistry.prepareGrant({
          sessionKey: payload.sessionKey,
          generation: livePrompt.generation,
          workspaceRoot: payload.workspaceRoot,
          executionCwd: payload.cwd,
        });
        if (
          preparedAccessGrant.workspaceRoot !== livePrompt.accessGrant.workspaceRoot
          || preparedAccessGrant.executionCwd !== livePrompt.accessGrant.executionCwd
        ) {
          throw new Error('Cannot change workspace while an ACP prompt is active');
        }
        this.generation = livePrompt.generation;
        this.activeSessionKey = livePrompt.sessionKey;
        this.activeAcpSessionId = livePrompt.acpSessionId;
        this.loadedSessionKey = livePrompt.sessionKey;
        this.loadedAcpSessionId = livePrompt.acpSessionId;
        this.historicalSessionKey = null;
        this.historicalGeneration = null;
        this.permissionsEnabled = true;
        this.accessRegistry.commitGrant(livePrompt.accessGrant);
        this.trace('session/load:resumed-active-prompt', {
          sessionKey: livePrompt.sessionKey,
          generation: livePrompt.generation,
          details: { acpSessionId: livePrompt.acpSessionId },
        });
        return {
          success: true,
          generation: livePrompt.generation,
          resumedActivePrompt: true,
          ...([...this.permissionWaiters.values()].some((waiter) => waiter.sessionKey === livePrompt.sessionKey)
            ? { pendingPermissions: [...this.permissionWaiters.values()].filter((waiter) => waiter.sessionKey === livePrompt.sessionKey).map((waiter) => waiter.envelope) }
            : {}),
        };
      }
      previousSessionKey = this.activeSessionKey;
      previousAcpSessionId = this.activeAcpSessionId;
      previousLoadedSessionKey = this.loadedSessionKey;
      previousLoadedAcpSessionId = this.loadedAcpSessionId;
      previousHistoricalSessionKey = this.historicalSessionKey;
      previousHistoricalGeneration = this.historicalGeneration;
      previousGeneration = this.generation;
      nextGeneration = this.generationSeq + 1;
      previousAccessGrant = this.accessRegistry.snapshot();
      const preparedAccessGrant = await this.accessRegistry.prepareGrant({
        sessionKey: payload.sessionKey,
        generation: nextGeneration,
        workspaceRoot: payload.workspaceRoot,
        executionCwd: payload.cwd,
      });

      this.generation = nextGeneration;
      this.activeSessionKey = payload.sessionKey;
      this.activeAcpSessionId = payload.createIfMissing ? null : payload.sessionKey;
      this.loadedSessionKey = null;
      this.loadedAcpSessionId = null;
      this.historicalSessionKey = payload.createIfMissing ? null : payload.sessionKey;
      this.historicalGeneration = payload.createIfMissing ? null : nextGeneration;
      loadBatch = {
        sessionKey: payload.sessionKey,
        generation: nextGeneration,
        sessionUpdates: [],
      };
      this.activeLoadBatch = loadBatch;
      stateAdvanced = true;
      if (previousSessionKey && !this.livePrompts.has(previousSessionKey)) {
        this.resolvePermissionWaitersForSession(previousSessionKey, cancelledPermissionResponse());
      }

      let acpSessionId = payload.sessionKey;
      if (payload.createIfMissing) {
        const created = await connection.newSession({
          cwd: preparedAccessGrant.executionCwd,
          mcpServers: [],
          _meta: { sessionKey: payload.sessionKey, prefixCwd: true },
        });
        acpSessionId = created.sessionId;
      } else {
        await connection.loadSession({
          sessionId: payload.sessionKey,
          cwd: preparedAccessGrant.executionCwd,
          mcpServers: [],
        });
      }
      this.activeAcpSessionId = acpSessionId;
      this.loadedSessionKey = payload.sessionKey;
      this.loadedAcpSessionId = acpSessionId;
      this.generationSeq = nextGeneration;
      this.accessRegistry.commitGrant(preparedAccessGrant);
      this.trace('session/load:success', {
        sessionKey: payload.sessionKey,
        generation: nextGeneration,
        details: { createIfMissing: !!payload.createIfMissing, acpSessionId },
      });
      if (this.activeLoadBatch === loadBatch) this.activeLoadBatch = null;
      return ok(
        nextGeneration,
        loadBatch.sessionUpdates
          .filter((entry) => entry.acpSessionId === acpSessionId)
          .map((entry) => entry.envelope),
      );
    } catch (error) {
      if (this.activeLoadBatch === loadBatch) this.activeLoadBatch = null;
      this.resolvePermissionWaitersForSession(payload.sessionKey, cancelledPermissionResponse());
      if (
        stateAdvanced
        && this.activeSessionKey === payload.sessionKey
        && this.generation === nextGeneration
      ) {
        this.generation = previousGeneration;
        this.activeSessionKey = previousSessionKey;
        this.activeAcpSessionId = previousAcpSessionId;
        this.loadedSessionKey = previousLoadedSessionKey;
        this.loadedAcpSessionId = previousLoadedAcpSessionId;
        this.historicalSessionKey = previousHistoricalSessionKey;
        this.historicalGeneration = previousHistoricalGeneration;
        this.permissionsEnabled = previousPermissionsEnabled;
        this.accessRegistry.restore(previousAccessGrant);
      }
      logger.error(`[acp-chat] loadSession failed: ${String(error)}`);
      this.trace('session/load:failed', {
        sessionKey: payload.sessionKey,
        generation: previousGeneration,
        details: { error: error instanceof Error ? error.message : String(error) },
      });
      return fail(error);
    }
  }

  sendPrompt(payload: AcpChatPromptPayload): Promise<AcpChatOperationResult> {
    if (!payload.messageId) return this.performSendPrompt(payload);
    if (typeof payload.messageId !== 'string' || payload.messageId.length > 256) return Promise.resolve(fail('Invalid ACP message identity'));
    const key = `${payload.sessionKey}\0${payload.messageId}`;
    const fingerprint = createHash('sha256').update(JSON.stringify([payload.cwd, payload.message ?? '', payload.media ?? []])).digest('hex');
    let receipt = this.promptReceipts.get(key);
    if (receipt && receipt.fingerprint !== fingerprint) return Promise.resolve(fail('ACP message identity was reused with different content'));
    if (receipt?.promise) {
      if (receipt.inFlight) return receipt.promise;
      // A replayed receipt confirms dispatch only. Its original projection
      // generation must not rewind a renderer which has since replayed history.
      return receipt.promise.then((result) => { const replay = { ...result }; delete replay.generation; return replay; });
    }
    if ([...this.promptReceipts.values()].filter((entry) => entry.inFlight).length >= MAX_ACTIVE_PROMPT_RECEIPTS) {
      return Promise.resolve(fail('Too many ACP prompts are active; wait for one to finish'));
    }
    if (!receipt) {
      receipt = { fingerprint, dispatched: false, inFlight: false };
      this.promptReceipts.set(key, receipt);
    }
    const ownedReceipt = receipt;
    ownedReceipt.inFlight = true;
    ownedReceipt.promise = Promise.resolve().then(() => this.performSendPrompt(payload, () => { ownedReceipt.dispatched = true; }))
      .then((result) => {
        // A proven pre-dispatch failure can be explicitly retried with the same
        // identity. Successful or uncertain effects remain protected from replay.
        if (!result.success && !ownedReceipt.dispatched) ownedReceipt.promise = undefined;
        ownedReceipt.inFlight = false;
        // Completion order determines the recent retention window. Active
        // receipts are never evicted, including while other sessions complete.
        this.promptReceipts.delete(key);
        this.promptReceipts.set(key, ownedReceipt);
        let settledCount = [...this.promptReceipts.values()].filter((entry) => !entry.inFlight).length;
        for (const [oldKey, oldReceipt] of this.promptReceipts) {
          if (settledCount <= MAX_SETTLED_PROMPT_RECEIPTS) break;
          if (!oldReceipt.inFlight) { this.promptReceipts.delete(oldKey); settledCount -= 1; }
        }
        return result;
      });
    return ownedReceipt.promise;
  }

  private async performSendPrompt(payload: AcpChatPromptPayload, onDispatched?: () => void): Promise<AcpChatOperationResult> {
    if (!isValidSessionKey(payload.sessionKey) || !payload.cwd) return fail('Invalid ACP prompt payload');
    if (!this.activeSessionKey) return fail('No active ACP session');
    if (payload.sessionKey !== this.activeSessionKey) return fail('ACP prompt session is not active');
    if (this.loadedSessionKey !== payload.sessionKey || !this.loadedAcpSessionId) return fail('ACP session is not loaded');
    if (this.livePrompts.has(payload.sessionKey)) return fail('ACP prompt is already active');
    const generation = this.generation;
    const acpSessionId = this.loadedAcpSessionId;
    const accessGrant = this.accessRegistry.get(payload.sessionKey, generation);
    if (!accessGrant) return fail('ACP session access grant is not active');
    let finish!: () => void;
    const completed = new Promise<void>((resolve) => { finish = resolve; });
    const promptContext: AcpLivePromptContext = {
      sessionKey: payload.sessionKey,
      acpSessionId,
      generation,
      accessGrant,
      completed,
      finish,
    };
    this.livePrompts.set(payload.sessionKey, promptContext);
    let settleAdmission: ReturnType<AcpPromptDispatchHook>;
    let dispatched = false;
    let admissionSettled = false;
    try {
      const promptCwd = payload.cwd === accessGrant.executionCwd
        ? payload.cwd
        : await import('node:fs/promises')
          .then((fsP) => fsP.realpath(expandPath(payload.cwd)))
          .catch(() => null);
      if (promptCwd !== accessGrant.executionCwd) {
        return fail('ACP prompt cwd does not match the registered execution cwd');
      }
      this.trace('session/prompt:start', {
        sessionKey: payload.sessionKey,
        generation,
        details: { messageLength: payload.message?.length ?? 0, mediaCount: payload.media?.length ?? 0 },
      });
      const connection = await this.ensureConnection();
      const prompt = await this.buildPromptBlocks(payload);
      if (this.historicalSessionKey === payload.sessionKey) {
        this.historicalSessionKey = null;
        this.historicalGeneration = null;
      }
      this.permissionsEnabled = true;
      const messageId = payload.messageId ?? randomUUID();
      const isSlashCommand = payload.message?.trimStart().startsWith('/') === true;
      // The Main adapter binds the admission now, not after a renderer reload.
      settleAdmission = this.onPromptDispatched?.(payload);
      onDispatched?.();
      dispatched = true;
      const response = await connection.prompt({
        sessionId: acpSessionId,
        prompt,
        // ACP 1.1 removed messageId from the PromptRequest wire shape. Keep
        // ClawX correlation metadata in the protocol extension envelope.
        // OpenClaw must receive slash commands without its textual cwd prefix
        // so the Gateway can classify and fold command replies into chat final.
        _meta: { sessionKey: payload.sessionKey, prefixCwd: !isSlashCommand, messageId },
      });
      const cancelled = response.stopReason === 'cancelled';
      this.trace(cancelled ? 'session/prompt:cancelled' : 'session/prompt:success', {
        sessionKey: payload.sessionKey,
        generation,
        details: { blockCount: prompt.length, acpSessionId },
      });
      admissionSettled = true;
      await settleAdmission?.({ outcome: cancelled ? 'cancelled' : 'completed' });
      return cancelled ? { ...fail('ACP prompt was cancelled'), generation } : ok(generation);
    } catch (error) {
      if (dispatched && !admissionSettled) {
        // A transport failure after dispatch has unknown effects. Consume the
        // bound admission as failed rather than automatically sending it again.
        try { await settleAdmission?.({ outcome: 'failed' }); }
        catch (settlementError) { logger.error(`[acp-chat] admission settlement failed: ${String(settlementError)}`); }
      }
      logger.error(`[acp-chat] prompt failed: ${String(error)}`);
      this.trace('session/prompt:failed', {
        sessionKey: payload.sessionKey,
        details: { error: error instanceof Error ? error.message : String(error) },
      });
      return fail(error);
    } finally {
      if (this.livePrompts.get(payload.sessionKey) === promptContext) {
        this.livePrompts.delete(payload.sessionKey);
        this.resolvePermissionWaitersForSession(payload.sessionKey, cancelledPermissionResponse());
      }
      this.permissionsEnabled = this.activeSessionKey != null && this.livePrompts.has(this.activeSessionKey);
      promptContext.finish();
    }
  }

  async cancelSession(payload: AcpChatCancelPayload): Promise<AcpChatOperationResult> {
    if (!isValidSessionKey(payload.sessionKey)) return fail('Invalid ACP cancel payload');
    const livePrompt = this.livePrompts.get(payload.sessionKey);
    const sessionId = livePrompt?.acpSessionId ?? (payload.sessionKey === this.activeSessionKey ? this.loadedAcpSessionId : null);
    if (!sessionId) return fail('ACP session is not loaded');

    try {
      this.trace('session/cancel:start', { sessionKey: payload.sessionKey });
      const connection = await this.ensureConnection();
      await connection.cancel({ sessionId });
      if (payload.sessionKey === this.activeSessionKey) this.permissionsEnabled = false;
      this.resolvePermissionWaitersForSession(payload.sessionKey, cancelledPermissionResponse());
      this.trace('session/cancel:success', { sessionKey: payload.sessionKey });
      return ok(livePrompt?.generation ?? this.generation);
    } catch (error) {
      logger.error(`[acp-chat] cancel failed: ${String(error)}`);
      this.trace('session/cancel:failed', {
        sessionKey: payload.sessionKey,
        details: { error: error instanceof Error ? error.message : String(error) },
      });
      return fail(error);
    }
  }

  async respondPermission(payload: AcpChatRespondPermissionPayload): Promise<AcpChatOperationResult> {
    const waiter = this.permissionWaiters.get(payload.requestId);
    if (!waiter || waiter.sessionKey !== payload.sessionKey) return fail('Unknown ACP permission request');

    waiter.resolve({ outcome: payload.outcome });
    this.permissionWaiters.delete(payload.requestId);
    this.trace('permission/responded', {
      sessionKey: payload.sessionKey,
      details: { requestId: payload.requestId, outcome: payload.outcome.outcome },
    });
    return ok(waiter.generation);
  }

  private async ensureConnection(): Promise<AcpConnection> {
    if (this.connection && this.initialized) return this.connection;
    if (this.initializing) return this.initializing;

    this.initializing = this.initializeConnection();
    try {
      return await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  private async initializeConnection(): Promise<AcpConnection> {
    await this.approveLocalDeviceRequests();

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await this.initializeConnectionOnce(attempt);
      } catch (error) {
        if (attempt >= 2) throw error;
        logger.info(
          `[acp-chat] ACP connect failed on attempt ${attempt}; auto-approving local device requests and retrying: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        await this.approveLocalDeviceRequests();
      }
    }

    throw new Error('ACP connection failed');
  }

  private async initializeConnectionOnce(attempt: number): Promise<AcpConnection> {
    if (!this.connection) this.connection = await this.spawnConnection();
    const connection = this.connection;
    const child = this.child;

    this.trace('connection/initialize:start', { details: { attempt } });
    const initOutcome = await Promise.race([
      connection.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {},
      }).then((result) => ({ kind: 'initialized' as const, result })),
      this.waitForChildExit(child).then((exitCode) => ({ kind: 'exited' as const, exitCode })),
    ]);

    if (initOutcome.kind === 'exited') {
      if (child) this.dropConnectionForChild(child);
      throw new Error(`ACP process exited with code ${String(initOutcome.exitCode)}`);
    }

    const result = initOutcome.result;
    if (this.connection !== connection) {
      throw new Error('ACP connection closed during initialization');
    }
    if (!result.agentCapabilities?.loadSession) {
      this.trace('connection/initialize:failed', { details: { reason: 'missing-loadSession-capability' } });
      throw new Error('ACP agent does not support session/load');
    }
    this.initialized = true;
    this.trace('connection/initialize:success', { details: { protocolVersion: PROTOCOL_VERSION, attempt } });

    return connection;
  }

  private async approveLocalDeviceRequests(): Promise<void> {
    if (!this.gateway) return;
    try {
      await approvePendingLocalDeviceRequests(this.gateway, { discovery: 'local' });
    } catch (error) {
      logger.debug(`[acp-chat] Local device auto-approve skipped: ${String(error)}`);
    }
  }

  private waitForChildExit(child: AcpChildProcess | null): Promise<number | null> {
    if (!child) return Promise.resolve(null);
    if (child.exitCode !== null) return Promise.resolve(child.exitCode);
    if (child.signalCode) return Promise.resolve(child.exitCode);

    return new Promise((resolve) => {
      const onExit = (code: number | null) => {
        child.off('exit', onExit);
        resolve(code);
      };
      child.on('exit', onExit);
    });
  }

  private async spawnConnection(): Promise<ClientSideConnection> {
    const port = this.gateway?.getStatus?.().port;
    if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      throw new Error('The local Gateway port is invalid');
    }
    const spec = getOpenClawEmbeddedForkSpec(['acp']);
    if (port !== undefined) {
      // Use the same Main-owned endpoint/authentication as the running engine.
      // A default CLI discovery URL can target another installation. Never put
      // the local authentication token into argv or diagnostic records.
      // OpenClaw deliberately ignores env authentication with CLI --url. Set
      // both via the owned env instead; remove Windows case aliases first.
      const env = { ...spec.options.env };
      for (const key of Object.keys(env)) {
        if (/^OPENCLAW_GATEWAY_(URL|TOKEN|PASSWORD)$/i.test(key)) delete env[key];
      }
      env.OPENCLAW_GATEWAY_URL = `ws://127.0.0.1:${port}`;
      env.OPENCLAW_GATEWAY_TOKEN = await getSetting('gatewayToken');
      spec.options.env = env;
    }
    const forked = fork(spec.modulePath, spec.args, spec.options);
    if (!forked.stdin || !forked.stdout || !forked.stderr) {
      forked.kill();
      throw new Error('ACP process did not expose stdio pipes');
    }
    this.child = forked as AcpChildProcess;

    const child = this.child;

    child.stderr.on('data', (chunk) => {
      const message = String(chunk).trimEnd();
      if (message) logger.info(`[acp-chat] ${message}`);
    });
    child.on('error', (error) => {
      logger.error(`[acp-chat] ACP process error: ${String(error)}`);
      this.dropConnectionForChild(child);
    });
    child.on('exit', (code) => {
      logger.info(`[acp-chat] ACP process exited with code ${String(code)}`);
      this.dropConnectionForChild(child);
    });

    const input = Writable.toWeb(child.stdin) as WritableStream<Uint8Array>;
    const output = filterAcpStdoutDiagnostics(Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>);
    const stream = ndJsonStream(input, output);
    return new ClientSideConnection(() => this.client, stream);
  }

  private dropConnectionForChild(child: AcpChildProcess): void {
    if (this.child !== child) return;
    this.trace('connection/dropped', { details: { pendingPermissionCount: this.permissionWaiters.size } });
    this.resolveAllPermissionWaiters(cancelledPermissionResponse());
    this.initialized = false;
    this.initializing = null;
    this.connection = null;
    this.child = null;
    this.loadedSessionKey = null;
    this.loadedAcpSessionId = null;
    this.historicalSessionKey = null;
    this.historicalGeneration = null;
    this.permissionsEnabled = false;
    for (const context of this.livePrompts.values()) context.finish();
    this.livePrompts.clear();
  }

  private emitSessionUpdate(notification: SessionNotification): void {
    const acpSessionId = notification.sessionId;
    const livePrompt = [...this.livePrompts.values()].find((context) => context.acpSessionId === acpSessionId);
    const sessionKey = livePrompt?.sessionKey ?? this.activeSessionKey;
    const generation = livePrompt?.generation ?? this.generation;
    const updateType = sessionUpdateType(notification);
    this.trace('session-update:received', {
      direction: 'upstream',
      sessionKey: sessionKey ?? null,
      details: { acpSessionId, updateType },
    });
    if (!sessionKey) {
      this.trace('session-update:ignored', {
        direction: 'upstream',
        sessionKey: null,
        details: { reason: 'no-active-session', acpSessionId, updateType },
      });
      return;
    }
    if (!livePrompt && this.activeAcpSessionId && acpSessionId !== this.activeAcpSessionId) {
      this.trace('session-update:ignored', {
        direction: 'upstream',
        sessionKey,
        details: { reason: 'session-mismatch', acpSessionId, activeAcpSessionId: this.activeAcpSessionId, updateType },
      });
      return;
    }

    const envelope: AcpSessionUpdateEnvelope = {
      sessionKey,
      generation,
      ...(!livePrompt && this.historicalSessionKey === sessionKey && this.historicalGeneration === generation
        ? { historical: true }
        : {}),
      notification: { ...notification, sessionId: sessionKey },
    };
    const loadBatch = this.activeLoadBatch;
    if (loadBatch?.sessionKey === sessionKey && loadBatch.generation === generation) {
      loadBatch.sessionUpdates.push({ acpSessionId, envelope });
      this.trace('session-update:buffered', {
        direction: 'downstream',
        sessionKey,
        details: { acpSessionId, updateType, historical: !!envelope.historical },
      });
      return;
    }
    this.mainWindow.webContents.send(HOST_EVENT_CHANNELS.chat.acpSessionUpdate, envelope);
    this.trace('session-update:forwarded', {
      direction: 'downstream',
      sessionKey,
      details: { acpSessionId, updateType, historical: !!envelope.historical },
    });
  }

  private requestPermission(request: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const acpSessionId = request.sessionId;
    const livePrompt = [...this.livePrompts.values()].find((context) => context.acpSessionId === acpSessionId);
    const sessionKey = livePrompt?.sessionKey ?? this.activeSessionKey;
    const generation = livePrompt?.generation ?? this.generation;
    if (!livePrompt && !this.permissionsEnabled) {
      this.trace('permission:ignored', {
        direction: 'upstream',
        sessionKey: sessionKey ?? null,
        details: { reason: 'no-active-prompt', acpSessionId },
      });
      return Promise.resolve(cancelledPermissionResponse());
    }
    if (this.activeLoadBatch && !livePrompt) {
      this.trace('permission:ignored', {
        direction: 'upstream',
        sessionKey: sessionKey ?? null,
        details: { reason: 'session-loading', acpSessionId },
      });
      return Promise.resolve(cancelledPermissionResponse());
    }
    if (!sessionKey || (!livePrompt && this.activeAcpSessionId && acpSessionId !== this.activeAcpSessionId)) {
      this.trace('permission:ignored', {
        direction: 'upstream',
        sessionKey: sessionKey ?? null,
        details: {
          reason: !sessionKey ? 'no-active-session' : 'session-mismatch',
          acpSessionId,
          activeAcpSessionId: this.activeAcpSessionId,
        },
      });
      return Promise.resolve(cancelledPermissionResponse());
    }

    const requestId = `acp-permission-${Date.now()}-${this.permissionSeq += 1}`;
    const envelope: AcpPermissionRequestEnvelope = {
      sessionKey,
      generation,
      requestId,
      request: { ...request, sessionId: sessionKey },
    };
    return new Promise((resolve) => {
      this.permissionWaiters.set(requestId, { sessionKey, generation, envelope, resolve });
      this.mainWindow.webContents.send(HOST_EVENT_CHANNELS.chat.acpPermissionRequest, envelope);
      this.trace('permission:forwarded', {
        direction: 'downstream', sessionKey,
        details: { requestId, acpSessionId, optionCount: request.options.length },
      });
    });
  }

  private resolvePermissionWaitersForSession(sessionKey: string, response: RequestPermissionResponse): void {
    for (const [requestId, waiter] of this.permissionWaiters) {
      if (waiter.sessionKey !== sessionKey) continue;
      waiter.resolve(response);
      this.permissionWaiters.delete(requestId);
    }
  }

  private resolveAllPermissionWaiters(response: RequestPermissionResponse): void {
    for (const [requestId, waiter] of this.permissionWaiters) {
      waiter.resolve(response);
      this.permissionWaiters.delete(requestId);
    }
  }

  private async buildPromptBlocks(payload: AcpChatPromptPayload): Promise<ContentBlock[]> {
    const blocks: ContentBlock[] = [];
    const persona = this.getCompanionPersona?.(payload);
    if (persona) blocks.push({ type: 'text', text: persona.instructions, _meta: MORPHEUS_PERSONA_CONTENT_META });
    const text = payload.message?.trim();
    if (text) blocks.push({ type: 'text', text });

    const media = payload.media ?? [];
    if (media.length > 0) {
      const fsP = await import('node:fs/promises');
      for (const item of media) {
        const mimeType = item.mimeType || 'application/octet-stream';
        if (mimeType.startsWith('image/')) {
          const data = await fsP.readFile(item.filePath, 'base64');
          blocks.push({
            type: 'image',
            data,
            mimeType,
            uri: item.filePath,
            _meta: {
              clawx: {
                stagingId: item.stagingId,
                ...(item.fileName ? { fileName: item.fileName } : {}),
              },
            },
          });
        } else {
          blocks.push({
            type: 'resource_link',
            uri: item.filePath,
            name: item.fileName ?? item.filePath,
            mimeType: item.mimeType,
            _meta: {
              clawx: {
                stagingId: item.stagingId,
              },
            },
          });
        }
      }
    }

    if (blocks.length === 0) blocks.push({ type: 'text', text: '' });
    return blocks;
  }
}

export function createAcpChatService(
  mainWindow: MainWindowLike,
  accessRegistry: AcpSessionAccessRegistry,
  gateway?: GatewayPairingRpcClient,
  getCompanionPersona?: (payload: AcpChatPromptPayload) => MorpheusPersonaContext | undefined,
  onPromptDispatched?: AcpPromptDispatchHook,
): AcpChatService {
  return new AcpChatService(mainWindow, accessRegistry, undefined, gateway, getCompanionPersona, onPromptDispatched);
}
