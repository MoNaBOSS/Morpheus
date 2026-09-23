import { describe, expect, it } from 'vitest';

import {
  MORPHEUS_PLANNER_MODELS,
  MORPHEUS_PROVIDER_POLICY_REVIEWED_AT,
  getMorpheusVoicePreset,
  speechVoicesForModel,
} from '../../shared/morpheus/provider-policy';

describe('Morpheus provider policy', () => {
  it('uses the cost-aware Luna tier instead of the premium Sol tier by default', () => {
    expect(MORPHEUS_PLANNER_MODELS.openaiBalanced).toBe('gpt-5.6-luna');
    expect(MORPHEUS_PLANNER_MODELS.openRouterBalanced).toBe('openai/gpt-5.6-luna');
    expect(MORPHEUS_PLANNER_MODELS.openRouterBalanced).not.toContain('sol');
    expect(MORPHEUS_PROVIDER_POLICY_REVIEWED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('keeps efficient and expressive OpenRouter speech as explicit choices', () => {
    expect(getMorpheusVoicePreset('openrouter-efficient')).toMatchObject({
      transcriptionModelId: 'openai/whisper-large-v3-turbo',
      speechModelId: 'hexgrad/kokoro-82m',
      speechVoice: 'am_onyx',
    });
    expect(getMorpheusVoicePreset('openrouter-expressive')).toMatchObject({
      speechModelId: 'canopylabs/orpheus-3b-0.1-ft',
      speechVoice: 'leo',
    });
  });

  it('offers only voices appropriate to known model families', () => {
    expect(speechVoicesForModel('hexgrad/kokoro-82m')).toContain('am_onyx');
    expect(speechVoicesForModel('hexgrad/kokoro-82m')).not.toContain('leo');
    expect(speechVoicesForModel('canopylabs/orpheus-3b-0.1-ft')).toContain('leo');
    expect(speechVoicesForModel('gpt-4o-mini-tts')).toContain('cedar');
  });
});
