export const MORPHEUS_VOICE_VERSION = 3 as const;
export const MORPHEUS_VOICE_MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MORPHEUS_VOICE_MAX_DURATION_MS = 120_000;
export const MORPHEUS_VOICE_MAX_TRANSCRIPT_CHARS = 8_000;
export const MORPHEUS_VOICE_PROVIDER_TIMEOUT_MS = 30_000;
export const MORPHEUS_SPEECH_MAX_TEXT_CHARS = 4_000;
export const MORPHEUS_SPEECH_MAX_AUDIO_BYTES = 8 * 1024 * 1024;
export const MORPHEUS_SPEECH_VOICES = Object.freeze([
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable',
  'nova', 'onyx', 'sage', 'shimmer', 'verse',
] as const);
export type MorpheusSpeechVoice = typeof MORPHEUS_SPEECH_VOICES[number];
export const MORPHEUS_AMBIENT_MIN_SILENCE_MS = 500;
export const MORPHEUS_AMBIENT_MAX_SILENCE_MS = 3_000;
export const MORPHEUS_AMBIENT_MIN_UTTERANCE_MS = 2_000;
export const MORPHEUS_AMBIENT_MAX_UTTERANCE_MS = 30_000;
export const MORPHEUS_AMBIENT_WAKE_PHRASE_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} '-]{0,47}$/u;

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
  /** Null reuses the selected/default compatible provider. */
  speechProviderAccountId: string | null;
  speechModelId: string;
  speechVoice: MorpheusSpeechVoice;
  autoSubmitTranscript: boolean;
  /** Explicitly opt-in. When true, bounded speech segments may reach the configured provider. */
  ambientEnabled: boolean;
  wakePhrase: string;
  ambientSilenceMs: number;
  ambientMaxUtteranceMs: number;
  bargeIn: boolean;
};

export type MorpheusVoicePresenceState =
  | 'asleep'
  | 'armed'
  | 'listening'
  | 'transcribing'
  | 'understanding'
  | 'waiting-for-approval'
  | 'working'
  | 'speaking'
  | 'error';

export type MorpheusVoicePresence = {
  v: typeof MORPHEUS_VOICE_VERSION;
  state: MorpheusVoicePresenceState;
  ambientEnabled: boolean;
  sessionStartedAt?: string;
  providerLabel?: string;
  reason?: string;
};

export type MorpheusVoiceProviderOption = {
  accountId: string;
  label: string;
  isDefault: boolean;
  configured: boolean;
};

export type MorpheusVoiceStatus = {
  settings: MorpheusVoiceSettings;
  presence: MorpheusVoicePresence;
  transcriptionAvailable: boolean;
  neuralSpeechAvailable: boolean;
  /** Safe provider metadata only. API keys never cross the Main boundary. */
  providers: readonly MorpheusVoiceProviderOption[];
  providerLabel?: string;
  speechProviderLabel?: string;
  reason?: string;
};

export type MorpheusVoiceSettingsPatch = Partial<Pick<
  MorpheusVoiceSettings,
  | 'enabled'
  | 'providerAccountId'
  | 'modelId'
  | 'speakResponses'
  | 'speechProviderAccountId'
  | 'speechModelId'
  | 'speechVoice'
  | 'autoSubmitTranscript'
  | 'ambientEnabled'
  | 'wakePhrase'
  | 'ambientSilenceMs'
  | 'ambientMaxUtteranceMs'
  | 'bargeIn'
>>;

export type MorpheusAmbientListeningPayload = { listening: boolean };

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
  /** Privacy-safe provider round-trip timing. Audio and transcript content are excluded. */
  providerLatencyMs?: number;
};

export type MorpheusSynthesizeSpeechPayload = {
  /** Ephemeral final-result presentation. Main validates and never persists it. */
  text: string;
};

export type MorpheusSynthesizeSpeechResult = {
  audioBase64: string;
  mimeType: 'audio/mpeg';
  providerAccountId: string;
  modelId: string;
  voice: MorpheusSpeechVoice;
  providerLatencyMs: number;
};
