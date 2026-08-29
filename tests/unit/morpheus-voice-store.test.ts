import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  voiceStatus: vi.fn(),
  transcribeAudio: vi.fn(),
  submitObjective: vi.fn(),
  routeInteraction: vi.fn(),
  expandCompanionSurface: vi.fn(),
  beginAmbientVoice: vi.fn(),
  endAmbientVoice: vi.fn(),
  setVoiceSpeaking: vi.fn(),
  voicePresenceHandler: null as ((...args: unknown[]) => void) | null,
}));

vi.mock('@/lib/host-api', () => ({
  hostApi: {
    morpheus: {
      voiceStatus: mocks.voiceStatus,
      transcribeAudio: mocks.transcribeAudio,
      submitObjective: mocks.submitObjective,
      routeInteraction: mocks.routeInteraction,
      expandCompanionSurface: mocks.expandCompanionSurface,
      beginAmbientVoice: mocks.beginAmbientVoice,
      endAmbientVoice: mocks.endAmbientVoice,
      setVoiceSpeaking: mocks.setVoiceSpeaking,
    },
  },
}));

vi.mock('@/lib/host-events', () => ({
  hostEvents: {
    onMorpheusObjectiveEvent: vi.fn(() => vi.fn()),
    onMorpheusPlanConsent: vi.fn(() => vi.fn()),
    onMorpheusVoicePresence: vi.fn((handler: (...args: unknown[]) => void) => {
      mocks.voicePresenceHandler = handler;
      return vi.fn();
    }),
  },
}));

import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { classifyMorpheusVoiceError, useMorpheusVoiceStore } from '@/stores/morpheus-voice';
import { useMorpheusOperatorStore } from '@/stores/morpheus-operator';

class FakeMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  state: RecordingState = 'inactive';
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['voice-bytes'], { type: 'audio/webm' }) } as BlobEvent);
    this.onstop?.();
  }
}

const track = { stop: vi.fn() };
const getUserMedia = vi.fn(async () => ({ getTracks: () => [track] }));

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: FakeMediaRecorder });
  Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: FakeMediaRecorder });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  mocks.voiceStatus.mockResolvedValue({
    settings: {
      v: 1, enabled: true, providerAccountId: null, modelId: 'whisper-1',
      speakResponses: true, autoSubmitTranscript: true,
    },
    transcriptionAvailable: true,
    providers: [{ accountId: 'openai', label: 'OpenAI Voice', isDefault: true, configured: true }],
    providerLabel: 'OpenAI Voice',
  });
  mocks.transcribeAudio.mockResolvedValue({
    transcript: 'Open Notepad', providerAccountId: 'openai', modelId: 'whisper-1', durationMs: 1_000,
  });
  mocks.submitObjective.mockResolvedValue({ objectiveRunId: 'objective-voice', accepted: true });
  mocks.routeInteraction.mockResolvedValue({
    route: 'objective', reason: 'actionable-intent', confidence: 'high', text: 'Open Notepad',
  });
  mocks.expandCompanionSurface.mockResolvedValue({ mode: 'full' });
  mocks.beginAmbientVoice.mockResolvedValue({
    state: 'armed', ambientEnabled: true, listening: false,
    providerLabel: 'OpenAI Voice', sessionId: 'ambient-session', reason: null,
  });
  mocks.endAmbientVoice.mockResolvedValue({
    state: 'asleep', ambientEnabled: false, listening: false,
    providerLabel: null, sessionId: null, reason: null,
  });
  mocks.voicePresenceHandler = null;
  useMorpheusOperatorStore.setState({
    mode: 'auto', lastDecision: null, clarification: null, pendingConversation: null,
  });
  useMorpheusVoiceStore.setState({
    phase: 'idle', status: null, transcript: null, error: null, errorKind: null, source: null, startedAt: null,
  });
  useMorpheusCommandStore.setState({
    input: '', plan: null, unsupported: null, interpreting: false, executing: false,
    planResult: null, objectiveRun: null, objectiveHistory: null,
  });
});

describe('Morpheus renderer voice controller', () => {
  it('does not start or retry ambient capture when transcription is unavailable', async () => {
    const unavailableStatus = {
      settings: {
        v: 1, enabled: true, ambientEnabled: true, providerAccountId: null, modelId: 'whisper-1',
        speakResponses: true, autoSubmitTranscript: true,
      },
      transcriptionAvailable: false,
      providers: [],
      providerLabel: null,
      reason: 'Configure a provider.',
      presence: {
        state: 'error', ambientEnabled: true, listening: false,
        providerLabel: null, sessionId: null, reason: 'Configure a provider.',
      },
    } as const;
    useMorpheusVoiceStore.setState({
      status: unavailableStatus,
      presence: unavailableStatus.presence,
    });

    await useMorpheusVoiceStore.getState().ensureAmbient();
    const unsubscribe = useMorpheusVoiceStore.getState().subscribePresence();
    mocks.voicePresenceHandler?.(unavailableStatus.presence);
    await Promise.resolve();

    expect(mocks.beginAmbientVoice).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('does not restart ambient capture from the cleanup presence after a failed start', async () => {
    const readyStatus = {
      settings: {
        v: 1, enabled: true, ambientEnabled: true, providerAccountId: null, modelId: 'whisper-1',
        speakResponses: true, autoSubmitTranscript: true,
      },
      transcriptionAvailable: true,
      providers: [{ accountId: 'openai', label: 'OpenAI Voice', isDefault: true, configured: true }],
      providerLabel: 'OpenAI Voice',
      presence: {
        state: 'asleep', ambientEnabled: true, listening: false,
        providerLabel: null, sessionId: null, reason: null,
      },
    } as const;
    mocks.voiceStatus.mockResolvedValue(readyStatus);
    mocks.beginAmbientVoice.mockRejectedValueOnce(new Error('Provider runtime unavailable.'));
    await useMorpheusVoiceStore.getState().loadStatus();
    const unsubscribe = useMorpheusVoiceStore.getState().subscribePresence();

    await expect(useMorpheusVoiceStore.getState().ensureAmbient()).rejects.toThrow('Provider runtime unavailable.');
    mocks.voicePresenceHandler?.(readyStatus.presence);
    await Promise.resolve();

    expect(mocks.beginAmbientVoice).toHaveBeenCalledOnce();
    expect(mocks.endAmbientVoice).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('does not request the microphone when transcription is unavailable', async () => {
    mocks.voiceStatus.mockResolvedValue({
      settings: {
        v: 1, enabled: true, providerAccountId: null, modelId: 'whisper-1',
        speakResponses: true, autoSubmitTranscript: true,
      },
      transcriptionAvailable: false,
      providers: [],
      reason: 'Configure a provider.',
    });
    await useMorpheusVoiceStore.getState().startListening();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(useMorpheusVoiceStore.getState().phase).toBe('error');
    expect(useMorpheusVoiceStore.getState().errorKind).toBe('configuration');
  });

  it('asks for one natural repeat after an empty transcript and can listen again', async () => {
    mocks.transcribeAudio.mockRejectedValueOnce(
      new Error('Transcription provider returned an empty or oversized transcript.'),
    );

    await useMorpheusVoiceStore.getState().startListening('quick-command');
    useMorpheusVoiceStore.getState().stopListening();

    await vi.waitFor(() => expect(useMorpheusVoiceStore.getState()).toMatchObject({
      phase: 'error', errorKind: 'repeat', source: 'quick-command',
    }));
    await useMorpheusVoiceStore.getState().startListening('quick-command');
    expect(useMorpheusVoiceStore.getState()).toMatchObject({
      phase: 'listening', errorKind: null, source: 'quick-command',
    });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    useMorpheusVoiceStore.getState().cancel();
  });

  it('does not mislabel provider, permission or Audit failures as unclear speech', () => {
    expect(classifyMorpheusVoiceError(new Error('No compatible transcription provider is configured.'))).toBe('configuration');
    expect(classifyMorpheusVoiceError(new Error('Transcription provider timed out after 30 seconds.'))).toBe('network');
    expect(classifyMorpheusVoiceError(new Error('Microphone permission denied.'))).toBe('permission');
    expect(classifyMorpheusVoiceError(new Error('Voice is blocked while Audit is unavailable.'))).toBe('security');
  });

  it('keeps recording ephemeral, transcribes through Main and enters the unified objective pipeline', async () => {
    await useMorpheusVoiceStore.getState().startListening('global-shortcut');
    expect(useMorpheusVoiceStore.getState().phase).toBe('listening');
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        autoGainControl: true,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
      video: false,
    });
    useMorpheusVoiceStore.getState().stopListening();

    await vi.waitFor(() => expect(mocks.transcribeAudio).toHaveBeenCalledOnce());
    expect(mocks.routeInteraction).toHaveBeenCalledWith({
      text: 'Open Notepad', mode: 'auto', surface: 'voice',
    });
    await vi.waitFor(() => expect(mocks.submitObjective).toHaveBeenCalledWith({
      objective: 'Open Notepad',
      originType: 'voice',
      workspaceId: 'morpheus-files',
      projectId: 'personal',
    }));
    expect(track.stop).toHaveBeenCalled();
    expect(useMorpheusVoiceStore.getState()).toMatchObject({
      phase: 'ready',
      transcript: 'Open Notepad',
      source: 'global-shortcut',
    });
    const payload = mocks.transcribeAudio.mock.calls[0]?.[0];
    expect(payload).toMatchObject({ mimeType: 'audio/webm', durationMs: 100 });
    expect(payload.audioBase64).toBe(window.btoa('voice-bytes'));
  });

  it('uses the real transcription path for onboarding without submitting a command', async () => {
    mocks.transcribeAudio.mockResolvedValue({
      transcript: 'My name is Larry', providerAccountId: 'openai', modelId: 'whisper-1', durationMs: 800,
    });

    await useMorpheusVoiceStore.getState().startListening('onboarding');
    useMorpheusVoiceStore.getState().stopListening();

    await vi.waitFor(() => expect(useMorpheusVoiceStore.getState()).toMatchObject({
      phase: 'ready', transcript: 'My name is Larry', source: 'onboarding',
    }));
    expect(mocks.transcribeAudio).toHaveBeenCalledOnce();
    expect(mocks.routeInteraction).not.toHaveBeenCalled();
    expect(mocks.submitObjective).not.toHaveBeenCalled();
    expect(useMorpheusCommandStore.getState().input).toBe('');
    expect(track.stop).toHaveBeenCalled();
  });
});
