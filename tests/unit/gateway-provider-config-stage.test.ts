// @vitest-environment node

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GatewayManager } from '@electron/gateway/manager';
import {
  mutateOpenClawConfig,
  registerOpenClawConfigCoordinator,
  resetOpenClawConfigCoordinatorForTests,
} from '@electron/gateway/config-delivery';

const boundary = vi.hoisted(() => ({
  configPath: '',
  providerEnv: {} as Record<string, string | undefined>,
  events: [] as string[],
  loadProviderEnv: vi.fn(),
  prepareLaunch: vi.fn(),
  startup: vi.fn(),
  launch: vi.fn(),
  terminate: vi.fn(),
}));

vi.mock('electron', () => ({ app: { getPath: () => 'synthetic-unit-unused', isPackaged: false } }));
vi.mock('@electron/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@electron/utils/config', () => ({ getPort: () => 18789 }));
vi.mock('@electron/utils/paths', () => ({ resolveOpenClawConfigPath: () => boundary.configPath }));
vi.mock('@electron/utils/telemetry', () => ({ captureTelemetryEvent: vi.fn(), trackMetric: vi.fn() }));
vi.mock('@electron/utils/device-identity', () => ({
  loadOrCreateDeviceIdentity: vi.fn(async () => ({ deviceId: 'synthetic-unit-device' })),
}));
vi.mock('@electron/utils/control-ui-device-pairing', () => ({
  cancelLocalDeviceAutoApproval: vi.fn(), scheduleLocalDeviceAutoApproval: vi.fn(),
}));
vi.mock('@electron/utils/openclaw-upgrade-snapshot', () => ({
  removeOpenClaw2026_7_1UpgradeSnapshot: vi.fn(async () => ({ status: 'missing' })),
}));
vi.mock('@electron/gateway/config-sync', () => ({
  loadProviderEnv: boundary.loadProviderEnv,
  prepareGatewayLaunchContext: boundary.prepareLaunch,
}));
vi.mock('@electron/gateway/startup-orchestrator', () => ({ runGatewayStartupSequence: boundary.startup }));
vi.mock('@electron/gateway/process-launcher', () => ({ launchGatewayProcess: boundary.launch }));
vi.mock('@electron/gateway/ws-client', () => ({ connectGatewaySocket: vi.fn(), waitForGatewayReady: vi.fn() }));
vi.mock('@electron/gateway/supervisor', () => ({
  terminateOwnedGatewayProcess: boundary.terminate,
  findExistingGatewayProcess: vi.fn(), runOpenClawDoctorRepair: vi.fn(),
  unloadLaunchctlGatewayService: vi.fn(), waitForPortFree: vi.fn(), warmupManagedPythonReadiness: vi.fn(),
}));

const SECRET_REF = 'MORPHEUS_PROVIDER_KEY_SYNTHETIC_STAGE';
const MODEL = 'openrouter/openai/synthetic-stage-model';
const ENDPOINT = 'https://synthetic-stage.example.invalid/api/v1';
const OLD_ENV = { OPENROUTER_API_KEY: 'synthetic-unit-old-key' };
const NEW_ENV = { OPENROUTER_API_KEY: 'synthetic-unit-new-key', [SECRET_REF]: 'synthetic-unit-new-key' };

interface GatewayInternals {
  ownsProcess: boolean;
  process: { pid: number } | null;
  launchEnvFingerprints: Record<string, string>;
  fingerprintEnvValue(value: string | undefined): string;
  stateController: { setStatus(update: Record<string, unknown>): void };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function oldConfig() {
  return {
    sentinel: 'synthetic-unit-existing-config',
    models: { providers: { openrouter: {
      baseUrl: 'https://synthetic-old.example.invalid/api/v1', api: 'openai-completions',
      models: [{ id: 'openai/synthetic-old-model' }],
    } } },
    agents: {
      defaults: { model: { primary: 'openrouter/openai/synthetic-old-model' } },
      list: [{ id: 'synthetic-unit-agent', model: 'openrouter/openai/synthetic-old-model' }],
    },
  };
}

async function deliverSelectedConfig() {
  await mutateOpenClawConfig((config) => {
    config.models = { providers: { openrouter: {
      baseUrl: ENDPOINT, api: 'openai-completions',
      apiKey: { source: 'env', provider: 'default', id: SECRET_REF },
      models: [{ id: 'openai/synthetic-stage-model' }],
    } } };
  });
  await mutateOpenClawConfig((config) => {
    const agents = config.agents as ReturnType<typeof oldConfig>['agents'];
    agents.defaults.model.primary = MODEL;
  });
  await mutateOpenClawConfig((config) => {
    const agents = config.agents as ReturnType<typeof oldConfig>['agents'];
    agents.list[0].model = MODEL;
  });
}

function expectSelectedConfig(config: unknown) {
  expect(config).toMatchObject({
    sentinel: 'synthetic-unit-existing-config',
    models: { providers: { openrouter: {
      baseUrl: ENDPOINT, api: 'openai-completions',
      apiKey: { source: 'env', provider: 'default', id: SECRET_REF },
      models: [{ id: 'openai/synthetic-stage-model' }],
    } } },
    agents: {
      defaults: { model: { primary: MODEL } },
      list: [{ id: 'synthetic-unit-agent', model: MODEL }],
    },
  });
}

describe('GatewayManager provider configuration stage', () => {
  let testDir: string;
  let manager: GatewayManager;
  let internals: GatewayInternals;
  let runningEnv: Record<string, string | undefined>;
  let onLaunch: (config: unknown) => void;
  let nextPid: number;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetOpenClawConfigCoordinatorForTests();
    testDir = await mkdtemp(join(tmpdir(), 'morpheus-provider-config-stage-unit-'));
    boundary.configPath = join(testDir, 'synthetic-openclaw.json');
    await writeFile(boundary.configPath, JSON.stringify(oldConfig()));
    boundary.events = [];
    boundary.providerEnv = { ...NEW_ENV };
    runningEnv = { ...OLD_ENV };
    nextPid = 501;
    onLaunch = () => undefined;
    manager = new GatewayManager();
    internals = manager as unknown as GatewayInternals;
    internals.ownsProcess = true;
    internals.process = { pid: nextPid };
    internals.stateController.setStatus({ state: 'running', pid: nextPid });
    internals.launchEnvFingerprints = Object.fromEntries(Object.entries(runningEnv)
      .map(([key, value]) => [key, internals.fingerprintEnvValue(value)]));
    registerOpenClawConfigCoordinator(manager);
    boundary.loadProviderEnv.mockImplementation(async () => ({
      providerEnv: { ...boundary.providerEnv }, loadedProviderKeyCount: 1,
    }));
    boundary.prepareLaunch.mockImplementation(async () => ({ forkEnv: { ...boundary.providerEnv } }));
    boundary.terminate.mockImplementation(async () => { boundary.events.push('stop'); });
    boundary.launch.mockImplementation(async ({ onSpawn }: { onSpawn: (pid: number) => void }) => {
      const config = JSON.parse(await readFile(boundary.configPath, 'utf8')) as unknown;
      onLaunch(config);
      boundary.events.push('launch');
      runningEnv = { ...boundary.providerEnv };
      nextPid += 1;
      onSpawn(nextPid);
      return { child: { pid: nextPid }, lastSpawnSummary: 'synthetic-unit-launch' };
    });
    boundary.startup.mockImplementation(async (options: {
      assertLifecycle(phase: string): void;
      startProcess(): Promise<void>;
    }) => {
      options.assertLifecycle('synthetic-unit-before-spawn');
      await options.startProcess();
      options.assertLifecycle('synthetic-unit-after-spawn');
      internals.stateController.setStatus({ state: 'running' });
    });
    vi.spyOn(manager, 'rpc').mockImplementation(async (method, params) => {
      if (method === 'config.get') {
        return { config: JSON.parse(await readFile(boundary.configPath, 'utf8')), hash: 'synthetic-unit-hash' } as never;
      }
      if (method === 'config.set') {
        const raw = (params as { raw: string }).raw;
        const config = JSON.parse(raw) as { models?: { providers?: { openrouter?: { apiKey?: { id: string } } } } };
        const ref = config.models?.providers?.openrouter?.apiKey?.id;
        if (ref && !runningEnv[ref]) throw new Error(`synthetic-unit missing env SecretRef ${ref}`);
        await writeFile(boundary.configPath, raw);
        boundary.events.push('rpc:set');
        return { ok: true } as never;
      }
      throw new Error(`Unexpected synthetic-unit RPC: ${method}`);
    });
  });

  afterEach(async () => {
    resetOpenClawConfigCoordinatorForTests();
    await manager.stop();
    vi.restoreAllMocks();
    await rm(testDir, { recursive: true, force: true });
  });

  it('reproduces config.set rejecting a new native SecretRef absent from the running child', async () => {
    await expect(deliverSelectedConfig()).rejects.toThrow(`synthetic-unit missing env SecretRef ${SECRET_REF}`);
    expect(manager.rpc).toHaveBeenCalledWith('config.set', expect.any(Object));
    expect(JSON.parse(await readFile(boundary.configPath, 'utf8'))).toEqual(oldConfig());
    expect(boundary.terminate).not.toHaveBeenCalled();
    expect(boundary.launch).not.toHaveBeenCalled();
  });

  it('stops the stale owned child and durably delivers provider, default and agent configuration before launch', async () => {
    onLaunch = expectSelectedConfig;
    const validator = vi.fn(async () => true);
    const callback = vi.fn(async (staged: boolean) => {
      expect(staged).toBe(true);
      expect(manager.getStatus().state).toBe('stopped');
      boundary.events.push('callback');
      await deliverSelectedConfig();
      expectSelectedConfig(JSON.parse(await readFile(boundary.configPath, 'utf8')));
      boundary.events.push('durable');
      return validator;
    });
    expect(await manager.deliverProviderConfiguration(callback)).toBe(true);
    expect(boundary.events).toEqual(['stop', 'callback', 'durable', 'launch']);
    expect(boundary.terminate).toHaveBeenCalledOnce();
    expect(boundary.launch).toHaveBeenCalledOnce();
    expect(manager.getStatus()).toMatchObject({ state: 'running', pid: 502 });
    expect(manager.rpc).not.toHaveBeenCalled();
    expect(validator).toHaveBeenCalled();
  });

  it('uses normal coordinator RPC delivery without stopping an owned child with unchanged launch env', async () => {
    boundary.providerEnv = { ...OLD_ENV };
    const callback = vi.fn(async (staged: boolean) => {
      expect(staged).toBe(false);
      await mutateOpenClawConfig((config) => { config.syntheticUnitChanged = true; });
    });
    expect(await manager.deliverProviderConfiguration(callback)).toBe(true);
    expect(manager.rpc).toHaveBeenCalledWith('config.set', expect.any(Object));
    expect(boundary.terminate).not.toHaveBeenCalled();
    expect(boundary.launch).not.toHaveBeenCalled();
    expect(manager.getStatus()).toMatchObject({ state: 'running', pid: 501 });
  });

  it('delivers through the stopped-file path without starting an initially stopped Gateway', async () => {
    internals.process = null;
    internals.ownsProcess = false;
    internals.stateController.setStatus({ state: 'stopped', pid: undefined });
    const callback = vi.fn(async (staged: boolean) => {
      expect(staged).toBe(true);
      await deliverSelectedConfig();
    });
    expect(await manager.deliverProviderConfiguration(callback)).toBe(true);
    expectSelectedConfig(JSON.parse(await readFile(boundary.configPath, 'utf8')));
    expect(manager.getStatus().state).toBe('stopped');
    expect(manager.rpc).not.toHaveBeenCalled();
    expect(boundary.terminate).not.toHaveBeenCalled();
    expect(boundary.launch).not.toHaveBeenCalled();
  });

  it('refuses to stop or deliver configuration to a running Gateway it does not own', async () => {
    internals.ownsProcess = false;
    const callback = vi.fn(async () => undefined);
    expect(await manager.deliverProviderConfiguration(callback)).toBe(false);
    expect(callback).not.toHaveBeenCalled();
    expect(boundary.terminate).not.toHaveBeenCalled();
    expect(boundary.launch).not.toHaveBeenCalled();
    expect(manager.rpc).not.toHaveBeenCalled();
  });

  it('propagates delivery failure while leaving the stale child stopped without a fresh launch', async () => {
    await expect(manager.deliverProviderConfiguration(async () => {
      throw new Error('synthetic-unit delivery failed');
    })).rejects.toThrow('synthetic-unit delivery failed');
    expect(manager.getStatus().state).toBe('stopped');
    expect(boundary.terminate).toHaveBeenCalledOnce();
    expect(boundary.launch).not.toHaveBeenCalled();
  });

  it('rejects a changed-selection validator without launching a fresh child', async () => {
    await expect(manager.deliverProviderConfiguration(async () => {
      await deliverSelectedConfig();
      return async () => false;
    })).rejects.toThrow('Provider selection changed');
    expect(manager.getStatus().state).toBe('stopped');
    expect(boundary.terminate).toHaveBeenCalledOnce();
    expect(boundary.launch).not.toHaveBeenCalled();
    expect(manager.rpc).not.toHaveBeenCalled();
  });

  it('honors a manual stop while the delivery callback is blocked', async () => {
    const entered = deferred();
    const release = deferred();
    const delivery = manager.deliverProviderConfiguration(async () => {
      entered.resolve();
      await release.promise;
      await deliverSelectedConfig();
    });
    await entered.promise;
    await manager.stop();
    release.resolve();
    expect(await delivery).toBe(false);
    expect(manager.getStatus().state).toBe('stopped');
    expect(boundary.launch).not.toHaveBeenCalled();
    expect(manager.rpc).not.toHaveBeenCalled();
  });

  it('does not spawn after manual stop while the fresh launch context is loading', async () => {
    const preparing = deferred();
    const release = deferred();
    boundary.prepareLaunch.mockImplementationOnce(async () => {
      preparing.resolve();
      await release.promise;
      return { forkEnv: { ...boundary.providerEnv } };
    });
    const delivery = manager.deliverProviderConfiguration(async () => {
      await deliverSelectedConfig();
      return async () => true;
    });
    await preparing.promise;
    await manager.stop();
    release.resolve();
    expect(await delivery).toBe(false);
    expect(manager.getStatus().state).toBe('stopped');
    expect(boundary.launch).not.toHaveBeenCalled();
    expect(manager.rpc).not.toHaveBeenCalled();
  });

  it('disables automatic recovery when final staged selection validation throws', async () => {
    const validator = vi.fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('synthetic-unit selection read failed'));
    await expect(manager.deliverProviderConfiguration(async () => {
      await deliverSelectedConfig();
      return validator;
    })).rejects.toThrow('synthetic-unit selection read failed');
    expect(boundary.launch).not.toHaveBeenCalled();
    expect(manager as unknown as { shouldReconnect: boolean; reconnectTimer: unknown })
      .toMatchObject({ shouldReconnect: false, reconnectTimer: null });
  });

  it.each(['start', 'restart'] as const)('rejects manual %s while the configuration callback is blocked', async (operation) => {
    const entered = deferred();
    const release = deferred();
    const delivery = manager.deliverProviderConfiguration(async () => {
      entered.resolve();
      await release.promise;
      await deliverSelectedConfig();
    });
    await entered.promise;
    await expect(manager[operation]()).rejects.toThrow('configuration delivery is in progress');
    expect(boundary.launch).not.toHaveBeenCalled();
    expect(manager.getStatus().state).toBe('stopped');
    release.resolve();
    expect(await delivery).toBe(true);
    expect(boundary.launch).toHaveBeenCalledOnce();
    expect(manager.rpc).not.toHaveBeenCalled();
  });

  it('serializes a provider-secret refresh behind a blocked configuration delivery', async () => {
    const entered = deferred();
    const release = deferred();
    const delivery = manager.deliverProviderConfiguration(async () => {
      entered.resolve();
      await release.promise;
      await deliverSelectedConfig();
    });
    await entered.promise;
    const refresh = manager.restartOwnedForProviderSecretChange();
    expect(boundary.launch).not.toHaveBeenCalled();
    release.resolve();
    expect(await delivery).toBe(true);
    expect(await refresh).toBe(true);
    expect(boundary.terminate).toHaveBeenCalledOnce();
    expect(boundary.launch).toHaveBeenCalledOnce();
  });

  it('serializes configuration delivery behind an in-flight provider-secret refresh', async () => {
    const stopping = deferred();
    const release = deferred();
    boundary.terminate.mockImplementationOnce(async () => {
      boundary.events.push('stop');
      stopping.resolve();
      await release.promise;
    });
    const refresh = manager.restartOwnedForProviderSecretChange();
    await stopping.promise;
    const callback = vi.fn(async (staged: boolean) => {
      expect(staged).toBe(false);
      await deliverSelectedConfig();
    });
    const delivery = manager.deliverProviderConfiguration(callback);
    expect(callback).not.toHaveBeenCalled();
    release.resolve();
    expect(await refresh).toBe(true);
    expect(await delivery).toBe(true);
    expect(callback).toHaveBeenCalledOnce();
    expect(boundary.terminate).toHaveBeenCalledOnce();
    expect(boundary.launch).toHaveBeenCalledOnce();
    expectSelectedConfig(JSON.parse(await readFile(boundary.configPath, 'utf8')));
  });
});
