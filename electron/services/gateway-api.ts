import type { GatewayManager } from '../gateway/manager';
import type { CompleteHostServiceRegistry } from '../main/ipc/host-contract';
import { PORTS } from '../utils/config';
import { approvePendingLocalDeviceRequests } from '../utils/control-ui-device-pairing';
import { logger } from '../utils/logger';
import { buildOpenClawControlUiUrl } from '../utils/openclaw-control-ui';
import { getSetting } from '../utils/store';
import { isRecord } from './payload-utils';

type HealthPayload = {
  probe?: unknown;
};

type RpcPayload = {
  method?: unknown;
  params?: unknown;
  timeoutMs?: unknown;
};

/**
 * Renderer-visible Gateway RPC is compatibility glue for the existing Chat and
 * Channels stores. Keep this list narrow: privileged or newly introduced
 * methods must receive a typed Main-owned host route instead of becoming a
 * generic renderer-controlled RPC.
 */
export const RENDERER_GATEWAY_RPC_METHODS = Object.freeze([
  'sessions.subscribe',
  'sessions.list',
  'channels.status',
  'channels.add',
  'channels.delete',
  'channels.connect',
  'channels.disconnect',
  'channels.requestQr',
] as const);

const rendererGatewayRpcMethods = new Set<string>(RENDERER_GATEWAY_RPC_METHODS);

export function isRendererGatewayRpcMethod(method: string): boolean {
  return rendererGatewayRpcMethods.has(method);
}

function parseTimeoutMs(timeoutMs: unknown): number | undefined {
  if (timeoutMs === undefined) return undefined;
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Invalid gateway RPC timeout');
  }
  return timeoutMs;
}

export function createGatewayApi(gatewayManager: GatewayManager): CompleteHostServiceRegistry['gateway'] {
  return {
    status: () => gatewayManager.getStatus(),
    start: async () => {
      await gatewayManager.start();
      return { success: true };
    },
    stop: async () => {
      await gatewayManager.stop();
      return { success: true };
    },
    restart: async () => {
      await gatewayManager.restart();
      return { success: true };
    },
    health: async (payload) => {
      const body = isRecord(payload) ? payload as HealthPayload : {};
      return gatewayManager.checkHealth({ probe: body.probe === true });
    },
    controlUi: async () => {
      const status = gatewayManager.getStatus();
      const token = await getSetting('gatewayToken');
      const port = status.port || PORTS.OPENCLAW_GATEWAY;
      const url = buildOpenClawControlUiUrl(port, token);
      void approvePendingLocalDeviceRequests(gatewayManager).catch((error) => {
        logger.debug(`[gateway] Control UI device auto-approve skipped: ${String(error)}`);
      });
      return { success: true, url, token, port };
    },
    rpc: async (payload) => {
      const body = isRecord(payload) ? payload as RpcPayload : {};
      const method = typeof body.method === 'string' ? body.method.trim() : '';
      if (!method) {
        throw new Error('Invalid gateway RPC method');
      }
      if (!isRendererGatewayRpcMethod(method)) {
        throw new Error(`Gateway RPC method is not available to the renderer: ${method}`);
      }
      const timeoutMs = parseTimeoutMs(body.timeoutMs);
      return gatewayManager.rpc(method, body.params, timeoutMs);
    },
  };
}
