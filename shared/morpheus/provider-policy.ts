/**
 * Morpheus-owned provider recommendations.
 *
 * These are conservative product defaults, not an exhaustive model catalog and
 * never an authority boundary. Existing accounts keep the model chosen by the
 * user. Review the recommendations when providers change availability or price.
 */
export const MORPHEUS_PROVIDER_POLICY_REVIEWED_AT = '2026-09-16' as const;

export const MORPHEUS_PLANNER_MODELS = Object.freeze({
  openaiBalanced: 'gpt-5.6-luna',
  openRouterBalanced: 'openai/gpt-5.6-luna',
  openRouterEconomy: 'deepseek/deepseek-v4-flash-0731',
  openRouterPremium: 'openai/gpt-5.6-sol',
} as const);

export type MorpheusVoicePresetId =
  | 'openrouter-efficient'
  | 'openrouter-expressive'
  | 'openai-balanced';

export type MorpheusVoicePreset = {
  id: MorpheusVoicePresetId;
  vendorId: 'openrouter' | 'openai';
  transcriptionModelId: string;
  speechModelId: string;
  speechVoice: string;
};

export const MORPHEUS_VOICE_PRESETS = Object.freeze([
  {
    id: 'openrouter-efficient',
    vendorId: 'openrouter',
    transcriptionModelId: 'openai/whisper-large-v3-turbo',
    speechModelId: 'hexgrad/kokoro-82m',
    speechVoice: 'am_onyx',
  },
  {
    id: 'openrouter-expressive',
    vendorId: 'openrouter',
    transcriptionModelId: 'openai/whisper-large-v3-turbo',
    speechModelId: 'canopylabs/orpheus-3b-0.1-ft',
    speechVoice: 'leo',
  },
  {
    id: 'openai-balanced',
    vendorId: 'openai',
    transcriptionModelId: 'gpt-4o-mini-transcribe',
    speechModelId: 'gpt-4o-mini-tts',
    speechVoice: 'cedar',
  },
] as const satisfies readonly MorpheusVoicePreset[]);

const OPENAI_SPEECH_VOICES = Object.freeze([
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable',
  'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar',
] as const);

const ORPHEUS_SPEECH_VOICES = Object.freeze([
  'tara', 'leah', 'jess', 'leo', 'dan', 'mia', 'zac',
] as const);

const KOKORO_SPEECH_VOICES = Object.freeze([
  'af_heart', 'af_bella', 'af_sky', 'af_nova', 'af_sarah',
  'am_adam', 'am_echo', 'am_onyx', 'am_michael',
  'bf_emma', 'bf_isabella', 'bm_george', 'bm_lewis',
] as const);

export const MORPHEUS_CURATED_SPEECH_VOICES = Object.freeze([
  ...OPENAI_SPEECH_VOICES,
  ...ORPHEUS_SPEECH_VOICES,
  ...KOKORO_SPEECH_VOICES,
] as const);

export function getMorpheusVoicePreset(id: MorpheusVoicePresetId): MorpheusVoicePreset {
  const preset = MORPHEUS_VOICE_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown Morpheus voice preset: ${id}`);
  return preset;
}

export function speechVoicesForModel(modelId: string): readonly string[] {
  const normalized = modelId.trim().toLowerCase();
  if (normalized.includes('kokoro')) return KOKORO_SPEECH_VOICES;
  if (normalized.includes('orpheus')) return ORPHEUS_SPEECH_VOICES;
  return OPENAI_SPEECH_VOICES;
}
