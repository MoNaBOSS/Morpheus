export const MORPHEUS_VOICE_VERSION = 1 as const;
export const MORPHEUS_VOICE_MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MORPHEUS_VOICE_MAX_DURATION_MS = 120_000;
export const MORPHEUS_VOICE_MAX_TRANSCRIPT_CHARS = 8_000;

export const MORPHEUS_VOICE_MIME_TYPES = Object.freeze([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/mp4',
] as const);

export type MorpheusVoiceMimeType = typeof MORPHEUS_VOICE_MIME_TYPES[number];

export type MorpheusVoiceSettings = {
  v: typeof MORPHEUS_VOICE_VERSION;
  enabled: boolean;
  providerAccountId: string | null;
  modelId: string;
  speakResponses: boolean;
  autoSubmitTranscript: boolean;
};

export type MorpheusVoiceProviderOption = {
  accountId: string;
  label: string;
  isDefault: boolean;
  configured: boolean;
};

export type MorpheusVoiceStatus = {
  settings: MorpheusVoiceSettings;
  transcriptionAvailable: boolean;
  /** Safe provider metadata only. API keys never cross the Main boundary. */
  providers: readonly MorpheusVoiceProviderOption[];
  providerLabel?: string;
  reason?: string;
};

export type MorpheusVoiceSettingsPatch = Partial<Pick<
  MorpheusVoiceSettings,
  'enabled' | 'providerAccountId' | 'modelId' | 'speakResponses' | 'autoSubmitTranscript'
>>;

export type MorpheusTranscribeAudioPayload = {
  /** Bounded ephemeral bytes. Main decodes, validates and never persists them. */
  audioBase64: string;
  mimeType: MorpheusVoiceMimeType;
  durationMs: number;
};

export type MorpheusTranscriptionResult = {
  transcript: string;
  providerAccountId: string;
  modelId: string;
  durationMs: number;
};
