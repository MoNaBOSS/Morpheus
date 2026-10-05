import { MORPHEUS_CURATED_SPEECH_VOICES } from './provider-policy';

export const MORPHEUS_VOICE_VERSION = 4 as const;
export const MORPHEUS_VOICE_MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MORPHEUS_VOICE_MAX_DURATION_MS = 120_000;
export const MORPHEUS_VOICE_MAX_TRANSCRIPT_CHARS = 8_000;
export const MORPHEUS_VOICE_PROVIDER_TIMEOUT_MS = 30_000;
export const MORPHEUS_SPEECH_MAX_TEXT_CHARS = 4_000;
export const MORPHEUS_SPEECH_MAX_AUDIO_BYTES = 8 * 1024 * 1024;
export const MORPHEUS_SPEECH_VOICES = MORPHEUS_CURATED_SPEECH_VOICES;
export type MorpheusSpeechVoice = typeof MORPHEUS_SPEECH_VOICES[number];
export const MORPHEUS_AMBIENT_MIN_SILENCE_MS = 500;
export const MORPHEUS_AMBIENT_MAX_SILENCE_MS = 3_000;
export const MORPHEUS_AMBIENT_MIN_UTTERANCE_MS = 2_000;
export const MORPHEUS_AMBIENT_MAX_UTTERANCE_MS = 30_000;
export const MORPHEUS_VOICE_FOLLOW_UP_MS = 15_000;
export const MORPHEUS_VOICE_CONVERSATION_MAX_MS = 5 * 60_000;
export const MORPHEUS_VOICE_CONVERSATION_MAX_TURNS = 8;
export const MORPHEUS_AMBIENT_WAKE_PHRASE_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} '-]{0,47}$/u;

export const MORPHEUS_VOICE_MIME_TYPES = Object.freeze([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/wav',
] as const);

export type MorpheusVoiceMimeType = typeof MORPHEUS_VOICE_MIME_TYPES[number];
export type MorpheusReplySpeechMode = 'orb' | 'voice' | 'all';
export type MorpheusReplySurface = 'compact' | 'full';
export type MorpheusReplySpeechOrigin = { surface: MorpheusReplySurface; input: 'typed' | 'voice' };

export type MorpheusVoiceSettings = {
  /** Included local voice is the default; preserved provider configuration is opt-in. */
  engine?: 'local' | 'provider';
  inputDeviceId?: string;
  v: typeof MORPHEUS_VOICE_VERSION;
  enabled: boolean;
  providerAccountId: string | null;
  modelId: string;
  speakResponses: boolean;
  /** Master speakResponses remains authoritative. Missing mode uses orb replies. */
  replySpeechMode?: MorpheusReplySpeechMode;
  /** Null reuses the selected/default compatible provider. */
  speechProviderAccountId: string | null;
  speechModelId: string;
  speechVoice: MorpheusSpeechVoice;
  autoSubmitTranscript: boolean;
  /** Explicitly opt-in. When true, bounded speech segments may reach the configured provider. */
  ambientEnabled: boolean;
  /** Opt-in Windows offline name detection; omitted retains legacy cloud mode. */
  localWakeEnabled?: boolean;
  wakePhrase: string;
  ambientSilenceMs: number;
  ambientMaxUtteranceMs: number;
  bargeIn: boolean;
  /** Re-open one bounded voice turn after a spoken result. */
  handsFreeFollowUp: boolean;
};

export type MorpheusVoicePresenceState =
  | 'asleep'
  | 'armed'
  | 'listening'
  | 'transcribing'
  | 'understanding'
  | 'waiting-for-approval'
  | 'working'
  | 'preparing-speech'
  | 'speaking'
  | 'error';

export type MorpheusVoicePresence = {
  /** Ephemeral Main-authored repair cue. Never grants capture or reuses words. */
  recovery?: { kind: 'wake-unverified' | 'no-speech'; sequence: number };
  /** Presentation pointer to the actual live Core question; choices stay Core-owned. */
  question?: { objectiveRunId: string };
  /** Effective Main input authority, including a mute veto before settings commit. */
  inputEnabled?: boolean;
  /** Invalidates capture and buffered playback when service authority changes. */
  authorityRevision?: number;
  /** Advances only after a deliberate voice settings edit is saved atomically. */
  settingsRevision?: number;
  v: typeof MORPHEUS_VOICE_VERSION;
  state: MorpheusVoicePresenceState;
  ambientEnabled: boolean;
  sessionStartedAt?: string;
  providerLabel?: string;
  reason?: string;
  /** Monotonic Main-audited local wake event, not a renderer-supplied transcript. */
  wakeSequence?: number;
  /** Ephemeral command suffix recognized locally in the same addressed utterance. */
  wakeCommand?: string;
  /** Main-authored admission window for one additional ambient turn. */
  followUpUntil?: string;
  /** Bounded turn number; presentation only and never permission authority. */
  conversationTurn?: number;
  /** Latest real speech failure this session; never a raw provider response. */
  speechFailure?: 'authentication' | 'access' | 'rate-limit' | 'endpoint' | 'unavailable';
};

export type MorpheusVoiceProviderOption = {
  accountId: string;
  vendorId: string;
  label: string;
  isDefault: boolean;
  configured: boolean;
};

export type MorpheusVoiceStatus = {
  /** Managed service requires canonical WAV input and streams mono PCM output. */
  captureFormat?: 'pcm16-wav';
  speechFormat?: 'pcm24' | 'wav';
  availableSpeechVoices?: readonly MorpheusSpeechVoice[];
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
  | 'engine'
  | 'inputDeviceId'
  | 'providerAccountId'
  | 'modelId'
  | 'speakResponses'
  | 'replySpeechMode'
  | 'speechProviderAccountId'
  | 'speechModelId'
  | 'speechVoice'
  | 'autoSubmitTranscript'
  | 'ambientEnabled'
  | 'localWakeEnabled'
  | 'wakePhrase'
  | 'ambientSilenceMs'
  | 'ambientMaxUtteranceMs'
  | 'bargeIn'
  | 'handsFreeFollowUp'
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
  /** Correlates ephemeral playback chunks. Not a path, endpoint or authority. */
  streamId?: string;
};

export type MorpheusSpeechChunk = { streamId: string; sequence: number; audioBase64: string; mimeType?: 'audio/mpeg' | 'audio/pcm'; source?: 'included-local' };

/** Main-authored completion totals. IPC chunks and the invoke response may arrive
 * in different orders; receipt of the response does not finish PCM delivery. */
export type MorpheusPcmStreamCompletion = { streamId: string; chunkCount: number; byteLength: number };

export type MorpheusSynthesizeSpeechResult = {
  audioBase64: string;
  mimeType: 'audio/mpeg' | 'audio/pcm' | 'audio/wav';
  providerAccountId: string;
  modelId: string;
  voice: MorpheusSpeechVoice;
  providerLatencyMs: number;
  /** First real generated segment, not fabricated playback progress. */
  firstAudioByteMs?: number;
  /** Present when PCM was emitted as sequenced chunks rather than collected. */
  pcmStream?: MorpheusPcmStreamCompletion;
};
