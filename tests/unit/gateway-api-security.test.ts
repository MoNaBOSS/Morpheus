import { describe, expect, it, vi } from 'vitest';

vi.mock('../../electron/utils/control-ui-device-pairing', () => ({
  approvePendingLocalDeviceRequests: vi.fn(),
}));
vi.mock('../../electron/utils/store', () => ({ getSetting: vi.fn() }));

import {
  RENDERER_GATEWAY_RPC_METHODS,
  createGatewayApi,
} from '../../electron/services/gateway-api';

describe('renderer Gateway RPC boundary', () => {
  it('forwards only the compatibility methods required by Chat and Channels', async () => {
    const rpc = vi.fn().mockResolvedValue({ ok: true });
    const api = createGatewayApi({ rpc } as never);

    for (const method of RENDERER_GATEWAY_RPC_METHODS) {
      await expect(api.rpc({ method, params: { marker: method } })).resolves.toEqual({ ok: true });
    }
    expect(rpc).toHaveBeenCalledTimes(RENDERER_GATEWAY_RPC_METHODS.length);
  });

  it('rejects privileged, arbitrary, and malformed methods before Gateway dispatch', async () => {
    const rpc = vi.fn();
    const api = createGatewayApi({ rpc } as never);

    await expect(api.rpc({ method: 'config.patch', params: {} }))
      .rejects.toThrow('not available to the renderer');
    await expect(api.rpc({ method: 'cron.create', params: {} }))
      .rejects.toThrow('not available to the renderer');
    await expect(api.rpc({ method: '' })).rejects.toThrow('Invalid gateway RPC method');
    expect(rpc).not.toHaveBeenCalled();
  });
});
