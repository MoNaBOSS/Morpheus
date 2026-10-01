// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp',
    isPackaged: false,
  },
  utilityProcess: {},
}));

vi.mock('@electron/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@electron/utils/config', () => ({
  PORTS: { OPENCLAW_GATEWAY: 18789 },
  getPort: () => 18789,
}));

vi.mock('@electron/gateway/startup-orchestrator', () => ({
  runGatewayStartupSequence: vi.fn(async () => {
    throw new Error('startup unavailable in unit test');
  }),
}));

vi.mock('@electron/gateway/config-sync', () => ({
  loadProviderEnv: vi.fn(async () => ({ providerEnv: { OPENAI_API_KEY: 'first' }, loadedProviderKeyCount: 1 })),
  prepareGatewayLaunchContext: vi.fn(),
}));

vi.mock('@electron/utils/openclaw-upgrade-snapshot', () => ({
  removeOpenClaw2026_7_1UpgradeSnapshot: vi.fn(async () => ({
    status: 'missing',
    snapshotDir: '/tmp/snapshot',
  })),
}));

describe('GatewayManager gatewayReady fallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets gatewayReady=false when entering starting state', async () => {
    vi.resetModules();
    const { GatewayManager } = await import('@electron/gateway/manager');
    const manager = new GatewayManager();

    const statusUpdates: Array<{ gatewayReady?: boolean }> = [];
    manager.on('status', (status: { gatewayReady?: boolean }) => {
      statusUpdates.push({ gatewayReady: status.gatewayReady });
    });

    const stateController = (manager as unknown as { stateController: { setStatus: (u: Record<string, unknown>) => void } }).stateController;
    stateController.setStatus({ state: 'starting', gatewayReady: false });

    const startingUpdate = statusUpdates.find((u) => u.gatewayReady === false);
    expect(startingUpdate).toBeDefined();
  });

  it('emits gatewayReady=true when gateway:ready event is received', async () => {
    vi.resetModules();
    const { GatewayManager } = await import('@electron/gateway/manager');
    const manager = new GatewayManager();

    // Force internal state to 'running' for the test
    const stateController = (manager as unknown as { stateController: { setStatus: (u: Record<string, unknown>) => void } }).stateController;
    stateController.setStatus({ state: 'running', connectedAt: Date.now() });

    const statusUpdates: Array<{ gatewayReady?: boolean; state: string }> = [];
    manager.on('status', (status: { gatewayReady?: boolean; state: string }) => {
      statusUpdates.push({ gatewayReady: status.gatewayReady, state: status.state });
    });

    manager.emit('gateway:ready', {});

    const readyUpdate = statusUpdates.find((u) => u.gatewayReady === true);
    expect(readyUpdate).toBeDefined();
  });

  it('records upgrade completion only for an owned Gateway', async () => {
    vi.resetModules();
    const { GatewayManager } = await import('@electron/gateway/manager');
    const { removeOpenClaw2026_7_1UpgradeSnapshot } = await import('@electron/utils/openclaw-upgrade-snapshot');
    const manager = new GatewayManager();

    manager.emit('gateway:ready', {});
    expect(removeOpenClaw2026_7_1UpgradeSnapshot).not.toHaveBeenCalled();

    (manager as unknown as { ownsProcess: boolean }).ownsProcess = true;
    manager.emit('gateway:ready', {});
    expect(removeOpenClaw2026_7_1UpgradeSnapshot).toHaveBeenCalledTimes(1);
  });

  it('refreshes changed owned launch secrets despite cooldown and skips unchanged/external children', async () => {
    vi.resetModules();
    const { GatewayManager } = await import('@electron/gateway/manager');
    const manager = new GatewayManager();
    const internals = manager as unknown as {
      ownsProcess: boolean;
      process: { pid: number } | null;
      stateController: { setStatus: (update: Record<string, unknown>) => void };
      launchEnvFingerprints: Record<string, string>;
      fingerprintEnvValue: (value: string | undefined) => string;
    };
    internals.stateController.setStatus({ state: 'running' });
    const { loadProviderEnv } = await import('@electron/gateway/config-sync');
    let currentKey = 'second';
    vi.mocked(loadProviderEnv).mockImplementation(async () => ({ providerEnv: { OPENAI_API_KEY: currentKey }, loadedProviderKeyCount: 1 }));
    internals.launchEnvFingerprints = { OPENAI_API_KEY: internals.fingerprintEnvValue('first') };
    const stop = vi.spyOn(manager, 'stop').mockResolvedValue(undefined);
    const start = vi.spyOn(manager, 'start').mockImplementation(async () => {
      internals.process = { pid: (internals.process?.pid ?? 500) + 1 };
      internals.launchEnvFingerprints = { OPENAI_API_KEY: internals.fingerprintEnvValue(currentKey) };
    });

    internals.process = { pid: 501 };
    expect(await manager.restartOwnedForProviderSecretChange()).toBe(false);
    expect(stop).not.toHaveBeenCalled();

    internals.ownsProcess = true;
    expect(await manager.restartOwnedForProviderSecretChange()).toBe(true);
    expect(start).toHaveBeenCalledOnce();

    expect(await manager.restartOwnedForProviderSecretChange()).toBe(true);
    expect(start).toHaveBeenCalledOnce();
    currentKey = 'third';
    expect(await manager.restartOwnedForProviderSecretChange()).toBe(true);
    expect(start).toHaveBeenCalledTimes(2);
    await manager.restart();
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('refreshes removed standard keys and SecretRefs when the active account becomes OAuth', async () => {
    vi.resetModules();
    const { GatewayManager } = await import('@electron/gateway/manager');
    const { loadProviderEnv } = await import('@electron/gateway/config-sync');
    const manager = new GatewayManager();
    const internals = manager as unknown as {
      ownsProcess: boolean; process: { pid: number };
      stateController: { setStatus: (update: Record<string, unknown>) => void };
      launchEnvFingerprints: Record<string, string>;
      fingerprintEnvValue: (value: string | undefined) => string;
    };
    internals.ownsProcess = true;
    internals.process = { pid: 501 };
    internals.stateController.setStatus({ state: 'running' });
    internals.launchEnvFingerprints = {
      OPENAI_API_KEY: internals.fingerprintEnvValue('old-static-key'),
      MORPHEUS_PROVIDER_KEY_OLD: internals.fingerprintEnvValue('old-static-key'),
    };
    // loadProviderEnv explicitly includes unset standard keys for OAuth and
    // omits SecretRefs belonging to a no-longer-active static account.
    vi.mocked(loadProviderEnv).mockResolvedValue({ providerEnv: { OPENAI_API_KEY: undefined }, loadedProviderKeyCount: 0 });
    vi.spyOn(manager, 'stop').mockResolvedValue(undefined);
    const start = vi.spyOn(manager, 'start').mockImplementation(async () => {
      internals.process = { pid: 502 };
      internals.launchEnvFingerprints = { OPENAI_API_KEY: internals.fingerprintEnvValue(undefined) };
    });
    expect(await manager.restartOwnedForProviderSecretChange()).toBe(true);
    expect(start).toHaveBeenCalledOnce();
    // Runtime-sync callers treat true as successfully refreshed/already fresh.
    expect(await manager.restartOwnedForProviderSecretChange()).toBe(true);
    expect(start).toHaveBeenCalledOnce();
  });

  it('serializes a changed default arriving during a secret refresh', async () => {
    vi.resetModules();
    const { GatewayManager } = await import('@electron/gateway/manager');
    const { loadProviderEnv } = await import('@electron/gateway/config-sync');
    const manager = new GatewayManager();
    const internals = manager as unknown as {
      ownsProcess: boolean; process: { pid: number };
      stateController: { setStatus: (update: Record<string, unknown>) => void };
      launchEnvFingerprints: Record<string, string>;
      fingerprintEnvValue: (value: string | undefined) => string;
    };
    internals.ownsProcess = true;
    internals.process = { pid: 501 };
    internals.stateController.setStatus({ state: 'running' });
    let key = 'second';
    vi.mocked(loadProviderEnv).mockImplementation(async () => ({ providerEnv: { OPENAI_API_KEY: key }, loadedProviderKeyCount: 1 }));
    internals.launchEnvFingerprints = { OPENAI_API_KEY: internals.fingerprintEnvValue('first') };
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(manager, 'stop').mockResolvedValue(undefined);
    const start = vi.spyOn(manager, 'start').mockImplementation(async () => {
      const launchedKey = key;
      if (start.mock.calls.length === 1) await blocked;
      internals.process = { pid: internals.process.pid + 1 };
      internals.launchEnvFingerprints = { OPENAI_API_KEY: internals.fingerprintEnvValue(launchedKey) };
    });
    const first = manager.restartOwnedForProviderSecretChange();
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
    key = 'third';
    const second = manager.restartOwnedForProviderSecretChange();
    release();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('auto-sets gatewayReady=true after fallback RPC router probe succeeds', async () => {
    vi.resetModules();
    const { GatewayManager } = await import('@electron/gateway/manager');
    const manager = new GatewayManager();
    const rpcSpy = vi.spyOn(manager as unknown as { rpc: (method: string, params?: unknown, timeoutMs?: number) => Promise<unknown> }, 'rpc')
      .mockResolvedValue({ ok: true });

    // Force internal state to 'running' without gatewayReady
    const stateController = (manager as unknown as { stateController: { setStatus: (u: Record<string, unknown>) => void } }).stateController;
    stateController.setStatus({ state: 'running', connectedAt: Date.now() });

    const statusUpdates: Array<{ gatewayReady?: boolean }> = [];
    manager.on('status', (status: { gatewayReady?: boolean }) => {
      statusUpdates.push({ gatewayReady: status.gatewayReady });
    });

    // Call the private scheduleGatewayReadyFallback method
    (manager as unknown as { scheduleGatewayReadyFallback: () => void }).scheduleGatewayReadyFallback();

    // The first readiness probe happens quickly after handshake, not after 30s.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(statusUpdates.find((u) => u.gatewayReady === true)).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1_000);
    const readyUpdate = statusUpdates.find((u) => u.gatewayReady === true);
    expect(readyUpdate).toBeDefined();
    expect(rpcSpy).toHaveBeenCalledWith('system-presence', {}, 5_000);
  });

  it('keeps gatewayReady=false when fallback RPC router probe fails', async () => {
    vi.resetModules();
    const { GatewayManager } = await import('@electron/gateway/manager');
    const manager = new GatewayManager();
    vi.spyOn(manager as unknown as { rpc: (method: string, params?: unknown, timeoutMs?: number) => Promise<unknown> }, 'rpc')
      .mockRejectedValue(new Error('RPC timeout: system-presence'));

    const stateController = (manager as unknown as { stateController: { setStatus: (u: Record<string, unknown>) => void } }).stateController;
    stateController.setStatus({ state: 'running', connectedAt: Date.now() });

    const statusUpdates: Array<{ gatewayReady?: boolean }> = [];
    manager.on('status', (status: { gatewayReady?: boolean }) => {
      statusUpdates.push({ gatewayReady: status.gatewayReady });
    });

    (manager as unknown as { scheduleGatewayReadyFallback: () => void }).scheduleGatewayReadyFallback();

    await vi.advanceTimersByTimeAsync(2_000);
    expect(statusUpdates.find((u) => u.gatewayReady === true)).toBeUndefined();
  });

  it('cancels fallback timer when gateway:ready event arrives first', async () => {
    vi.resetModules();
    const { GatewayManager } = await import('@electron/gateway/manager');
    const manager = new GatewayManager();

    const stateController = (manager as unknown as { stateController: { setStatus: (u: Record<string, unknown>) => void } }).stateController;
    stateController.setStatus({ state: 'running', connectedAt: Date.now() });

    const statusUpdates: Array<{ gatewayReady?: boolean }> = [];
    manager.on('status', (status: { gatewayReady?: boolean }) => {
      statusUpdates.push({ gatewayReady: status.gatewayReady });
    });

    // Schedule fallback
    (manager as unknown as { scheduleGatewayReadyFallback: () => void }).scheduleGatewayReadyFallback();

    // gateway:ready event arrives at 5s
    await vi.advanceTimersByTimeAsync(5_000);
    manager.emit('gateway:ready', {});
    expect(statusUpdates.filter((u) => u.gatewayReady === true)).toHaveLength(1);

    // After enough time, no duplicate gatewayReady=true
    await vi.advanceTimersByTimeAsync(30_000);
    expect(statusUpdates.filter((u) => u.gatewayReady === true)).toHaveLength(1);
  });
});
