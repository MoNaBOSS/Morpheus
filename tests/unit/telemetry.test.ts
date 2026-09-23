import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  shutdownMock,
  captureMock,
  getSettingMock,
  setSettingMock,
  loggerDebugMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  shutdownMock: vi.fn(),
  captureMock: vi.fn(),
  getSettingMock: vi.fn(),
  setSettingMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('posthog-node', () => ({
  PostHog: vi.fn(function PostHogMock() {
    return {
      capture: captureMock,
      shutdown: shutdownMock,
    };
  }),
}));

vi.mock('@electron/utils/store', () => ({
  getSetting: getSettingMock,
  setSetting: setSettingMock,
}));

vi.mock('@electron/utils/logger', () => ({
  logger: {
    debug: loggerDebugMock,
    error: loggerErrorMock,
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.2.1',
  },
}));

describe('main telemetry shutdown', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    getSettingMock.mockImplementation(async (key: string) => {
      switch (key) {
        case 'telemetryEnabled':
          return true;
        case 'telemetryConsentVersion':
          return 1;
        case 'telemetryIdentityVersion':
          return 1;
        case 'machineId':
          return 'existing-machine-id';
        case 'hasReportedInstall':
          return true;
        default:
          return undefined;
      }
    });
    setSettingMock.mockResolvedValue(undefined);
    captureMock.mockReturnValue(undefined);
  });

  it('ignores PostHog network timeout errors during shutdown', async () => {
    shutdownMock.mockRejectedValueOnce(
      Object.assign(new Error('Network error while fetching PostHog'), {
        name: 'PostHogFetchNetworkError',
        cause: Object.assign(new Error('The operation was aborted due to timeout'), {
          name: 'TimeoutError',
        }),
      }),
    );

    const { initTelemetry, shutdownTelemetry } = await import('@electron/utils/telemetry');
    await initTelemetry();
    await shutdownTelemetry();

    expect(loggerErrorMock).not.toHaveBeenCalled();
    expect(loggerDebugMock).toHaveBeenCalledWith(
      'Ignored telemetry shutdown network error:',
      expect.objectContaining({ name: 'PostHogFetchNetworkError' }),
    );
  });

  it('does not send inherited enabled-by-default telemetry without recorded consent', async () => {
    getSettingMock.mockImplementation(async (key: string) => key === 'telemetryEnabled' ? true : 0);
    const { initTelemetry } = await import('@electron/utils/telemetry');
    await initTelemetry();
    expect(captureMock).not.toHaveBeenCalled();
    expect(setSettingMock).not.toHaveBeenCalled();
  });

  it('rotates a legacy hardware ID to a random installation ID after consent', async () => {
    getSettingMock.mockImplementation(async (key: string) => ({
      telemetryEnabled: true, telemetryConsentVersion: 1, telemetryIdentityVersion: 0,
      machineId: 'legacy-hardware-id', hasReportedInstall: true,
    })[key]);
    const { initTelemetry } = await import('@electron/utils/telemetry');
    await initTelemetry();
    expect(setSettingMock).toHaveBeenCalledWith('machineId', expect.any(String));
    expect(setSettingMock).toHaveBeenCalledWith('telemetryIdentityVersion', 1);
    expect(captureMock).toHaveBeenCalledWith(expect.objectContaining({ event: 'app_opened', distinctId: expect.not.stringContaining('legacy-hardware-id') }));
  });
});
