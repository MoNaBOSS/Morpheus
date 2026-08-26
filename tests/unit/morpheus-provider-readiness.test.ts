import { describe, expect, it } from 'vitest';

import {
  isMorpheusPlannerAccountCompatible,
  morpheusPlannerProtocolFor,
} from '@shared/morpheus/provider-readiness';

describe('Morpheus provider planning readiness', () => {
  it('uses stable defaults for the provider families Morpheus Core supports', () => {
    expect(morpheusPlannerProtocolFor({ vendorId: 'openai' })).toBe('openai-responses');
    expect(morpheusPlannerProtocolFor({ vendorId: 'anthropic' })).toBe('anthropic-messages');
    expect(morpheusPlannerProtocolFor({ vendorId: 'minimax-portal' })).toBe('anthropic-messages');
    expect(morpheusPlannerProtocolFor({ vendorId: 'google' })).toBe('google-generative-ai');
    expect(morpheusPlannerProtocolFor({ vendorId: 'ollama' })).toBe('ollama');
  });

  it('distinguishes OpenClaw-only OAuth and unsupported protocols from planner-ready accounts', () => {
    expect(isMorpheusPlannerAccountCompatible({ vendorId: 'openai', authMode: 'api_key' })).toBe(true);
    expect(isMorpheusPlannerAccountCompatible({ vendorId: 'openai', authMode: 'oauth_browser' })).toBe(false);
    expect(isMorpheusPlannerAccountCompatible({
      vendorId: 'custom', apiProtocol: 'unsupported-protocol', authMode: 'api_key',
    })).toBe(false);
  });
});
