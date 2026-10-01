// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp',
    isPackaged: true,
  },
  utilityProcess: {
    fork: vi.fn(),
  },
}));

import { buildGatewayRuntimeEnv, drainGatewayStdout } from '@electron/gateway/process-launcher';

describe('Gateway process launcher environment', () => {
  it('enables safe startup tracing and preserves the source environment', () => {
    const source = {
      PATH: '/usr/bin',
      OPENCLAW_DISABLE_BONJOUR: '0',
      OPENCLAW_GATEWAY_STARTUP_TRACE: '0',
    };

    expect(buildGatewayRuntimeEnv(source)).toEqual({
      PATH: '/usr/bin',
      OPENCLAW_DISABLE_BONJOUR: '1',
      OPENCLAW_GATEWAY_STARTUP_TRACE: '1',
    });
    expect(source).toEqual({
      PATH: '/usr/bin',
      OPENCLAW_DISABLE_BONJOUR: '0',
      OPENCLAW_GATEWAY_STARTUP_TRACE: '0',
    });
  });

  it('consumes piped Gateway stdout so OpenClaw cannot block on a full pipe', () => {
    const on = vi.fn();

    drainGatewayStdout({ on } as unknown as NodeJS.ReadableStream);

    expect(on).toHaveBeenCalledTimes(1);
    expect(on).toHaveBeenCalledWith('data', expect.any(Function));
  });

  it('omits cleared credentials without dropping empty values or mutating overrides', () => {
    const source = { OPENAI_API_KEY: undefined, ANTHROPIC_API_KEY: undefined,
      CLAWX_PROVIDER_SELECTED: 'synthetic-selected', EMPTY: '', PATH: '/fixture/bin' };
    const result = buildGatewayRuntimeEnv(source);
    expect(result).not.toHaveProperty('OPENAI_API_KEY');
    expect(result).not.toHaveProperty('ANTHROPIC_API_KEY');
    expect(result).toMatchObject({ CLAWX_PROVIDER_SELECTED: 'synthetic-selected', EMPTY: '', PATH: '/fixture/bin' });
    expect(Object.values(result).every((value) => typeof value === 'string')).toBe(true);
    expect(source).toHaveProperty('OPENAI_API_KEY', undefined);
  });

  it.runIf(process.platform === 'win32')('also omits differently cased Windows aliases of a cleared key', () => {
    const result = buildGatewayRuntimeEnv({ OpenAI_Api_Key: 'stale-inherited', OPENAI_API_KEY: undefined });
    expect(result).not.toHaveProperty('OpenAI_Api_Key');
    expect(result).not.toHaveProperty('OPENAI_API_KEY');
  });
});
