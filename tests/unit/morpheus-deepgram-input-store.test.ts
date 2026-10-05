import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MorpheusAmbientVoiceCaptureOptions } from '@/lib/morpheus-ambient-voice';
import { MORPHEUS_VOICE_VERSION, type MorpheusTranscriptionResult, type MorpheusVoiceStatus } from '@shared/morpheus/voice-types';

type CaptureFixture = {
  options: MorpheusAmbientVoiceCaptureOptions;
  start: () => Promise<void>;
  stop: () => void;
  setSuppressed: (value: boolean) => void;
};
const mocks = vi.hoisted(() => ({
  captures: [] as CaptureFixture[],
  order: [] as string[],
  captureStart: vi.fn(async () => {}), captureStop: vi.fn(),
  voiceStatus: vi.fn(), updateVoiceSettings: vi.fn(),
  begin: vi.fn(), feed: vi.fn(), wait: vi.fn(), finish: vi.fn(), cancel: vi.fn(),
  transcribeAudio: vi.fn(), prepareVoiceOutput: vi.fn(),
  runObjective: vi.fn(), setInput: vi.fn(), clearObjectiveSpeech: vi.fn(), bindObjectiveSpeech: vi.fn(), correctObjective: vi.fn(),
  setDraft: vi.fn(), submitConversation: vi.fn(), route: vi.fn(),
  stopSpeech: vi.fn(), prepareAmbientVoiceInput: vi.fn(), endAmbientVoice: vi.fn(),
  meterMicrophone: vi.fn(), convertRecordedAudio: vi.fn(),
  presenceHandler: null as ((presence: MorpheusVoiceStatus['presence']) => void) | null,
}));

vi.mock('@/lib/host-api', () => ({ hostApi: { morpheus: {
  voiceStatus: mocks.voiceStatus, updateVoiceSettings: mocks.updateVoiceSettings,
  beginDeepgramVoiceInput: mocks.begin, feedDeepgramVoiceInput: mocks.feed, waitDeepgramVoiceInput: mocks.wait,
  finishDeepgramVoiceInput: mocks.finish, cancelDeepgramVoiceInput: mocks.cancel,
  transcribeAudio: mocks.transcribeAudio, prepareVoiceOutput: mocks.prepareVoiceOutput,
  prepareAmbientVoiceInput: mocks.prepareAmbientVoiceInput, endAmbientVoice: mocks.endAmbientVoice,
} } }));
vi.mock('@/lib/morpheus-ambient-voice', () => ({
  morpheusBlobToBase64: vi.fn(),
  MorpheusAmbientVoiceCapture: class {
    constructor(readonly options: MorpheusAmbientVoiceCaptureOptions) { mocks.captures.push(this); }
    start = async () => { mocks.order.push('start-microphone'); await mocks.captureStart(); };
    stop = () => { mocks.order.push('stop-microphone'); mocks.captureStop(); };
    setSuppressed = vi.fn();
  },
}));
vi.mock('@/lib/morpheus-speech-player', () => ({ stopMorpheusSpeech: mocks.stopSpeech }));
vi.mock('@/lib/morpheus-wake-cue', () => ({ playMorpheusWakeCue: vi.fn(), stopMorpheusWakeCue: vi.fn() }));
vi.mock('@/lib/morpheus-audio-level', () => ({ meterMorpheusMicrophone: mocks.meterMicrophone }));
vi.mock('@/lib/morpheus-managed-audio', () => ({ morpheusManagedRecording: mocks.convertRecordedAudio }));
vi.mock('@/stores/morpheus-command', () => ({ useMorpheusCommandStore: { getState: () => ({
  objectiveRun: null, runObjective: mocks.runObjective, setInput: mocks.setInput,
  clearObjectiveSpeech: mocks.clearObjectiveSpeech, bindObjectiveSpeech: mocks.bindObjectiveSpeech, correctObjective: mocks.correctObjective,
}) } }));
vi.mock('@/stores/morpheus-conversation', () => ({ useMorpheusConversationStore: { getState: () => ({
  setDraft: mocks.setDraft, submit: mocks.submitConversation, dispatchError: null,
}) } }));
vi.mock('@/stores/morpheus-operator', () => ({ useMorpheusOperatorStore: { getState: () => ({ route: mocks.route }) } }));
vi.mock('@/lib/host-events', () => ({ hostEvents: {
  onMorpheusVoicePresence: vi.fn((callback: typeof mocks.presenceHandler) => { mocks.presenceHandler = callback; return vi.fn(); }),
} }));

import { useMorpheusVoiceStore } from '@/stores/morpheus-voice';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function status(enabled = true): MorpheusVoiceStatus {
  return {
    settings: { v: MORPHEUS_VOICE_VERSION, engine: 'deepgram', enabled, inputDeviceId: 'selected-microphone',
      providerAccountId: null, modelId: 'nova-3', speakResponses: true, replySpeechMode: 'orb',
      speechProviderAccountId: null, speechModelId: 'flux-kit-en', speechVoice: 'cedar',
      autoSubmitTranscript: true, ambientEnabled: false, localWakeEnabled: true, wakePhrase: 'Morpheus',
      ambientSilenceMs: 900, ambientMaxUtteranceMs: 30_000, bargeIn: true, handsFreeFollowUp: true },
    presence: { v: MORPHEUS_VOICE_VERSION, state: 'asleep', ambientEnabled: false, inputEnabled: enabled, authorityRevision: 0, settingsRevision: 0 },
    transcriptionAvailable: enabled, neuralSpeechAvailable: true, captureFormat: 'pcm16-wav', speechFormat: 'pcm24', providers: [],
    providerLabel: 'Deepgram Nova-3', speechProviderLabel: 'Deepgram Kit',
  };
}
function result(transcript = 'Open YouTube.'): MorpheusTranscriptionResult {
  return { transcript, providerAccountId: 'morpheus-deepgram', modelId: 'nova-3', durationMs: 800 };
}
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
let final: ReturnType<typeof deferred<MorpheusTranscriptionResult>>;

beforeEach(async () => {
  useMorpheusVoiceStore.getState().cancel();
  useMorpheusVoiceStore.setState({ ambientScope: 'conversation', ambientReady: false, phase: 'idle', status: null, presence: null,
    transcript: null, error: null, errorKind: null, source: null, startedAt: null, followUpUntil: null, recovery: null, replyTurn: null });
  vi.clearAllMocks(); mocks.captures.length = 0; mocks.order.length = 0; mocks.presenceHandler = null;
  mocks.captureStart.mockResolvedValue(undefined);
  mocks.voiceStatus.mockResolvedValue(status()); mocks.updateVoiceSettings.mockResolvedValue(status());
  mocks.begin.mockImplementation(async () => { mocks.order.push('begin-main'); return { sessionId: 'cloud-input-1' }; });
  mocks.feed.mockResolvedValue({ ready: true });
  final = deferred<MorpheusTranscriptionResult>(); mocks.wait.mockReturnValue(final.promise);
  mocks.finish.mockImplementation(async () => { mocks.order.push('finish-main'); return { finished: true }; });
  mocks.cancel.mockImplementation(async () => { mocks.order.push('cancel-main'); return { cancelled: true }; });
  mocks.endAmbientVoice.mockResolvedValue(status().presence);
  mocks.route.mockImplementation(async (text: string) => ({ route: 'objective', reason: 'actionable-intent', confidence: 'high', text }));
  mocks.runObjective.mockImplementation(async (_text: string, _origin: string, admitted?: (id: string) => void) => { admitted?.('objective-cloud'); return true; });
  mocks.submitConversation.mockResolvedValue(true);
  vi.stubGlobal('MediaRecorder', vi.fn());
  const getUserMedia = vi.fn(); Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  // Release a deliberate mute from an earlier test only through successful save.
  await useMorpheusVoiceStore.getState().updateSettings({ enabled: true });
  vi.clearAllMocks(); mocks.order.length = 0;
});
afterEach(async () => {
  useMorpheusVoiceStore.getState().cancel(); await settle(); vi.unstubAllGlobals();
});

describe('Deepgram renderer input contract', () => {
  it('begins Main input before the selected microphone and sends sequenced PCM without recorded upload or task dispatch', async () => {
    await useMorpheusVoiceStore.getState().startListening('quick-command');
    expect(mocks.order.slice(0, 2)).toEqual(['begin-main', 'start-microphone']);
    expect(mocks.captures).toHaveLength(1); const capture = mocks.captures[0];
    expect(capture.options.inputDeviceId).toBe('selected-microphone'); expect(capture.options.shouldCapture?.()).toBe(false);
    await capture.options.onAudioFrame!(new Uint8Array([1, 2, 3, 4])); await capture.options.onAudioFrame!(new Uint8Array([5, 6]));
    expect(mocks.feed.mock.calls.map(call => call[0])).toEqual([
      { sessionId: 'cloud-input-1', sequence: 0, pcmBase64: window.btoa('\x01\x02\x03\x04') },
      { sessionId: 'cloud-input-1', sequence: 1, pcmBase64: window.btoa('\x05\x06') },
    ]);
    expect(useMorpheusVoiceStore.getState()).toMatchObject({ phase: 'listening', transcript: null });
    expect(MediaRecorder).not.toHaveBeenCalled(); expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(mocks.transcribeAudio).not.toHaveBeenCalled(); expect(mocks.convertRecordedAudio).not.toHaveBeenCalled();
    expect(mocks.meterMicrophone).not.toHaveBeenCalled(); expect(mocks.prepareVoiceOutput).not.toHaveBeenCalled();
    expect(mocks.route).not.toHaveBeenCalled(); expect(mocks.runObjective).not.toHaveBeenCalled();
  });

  it('stops microphone on the provider final and dispatches the admitted final once with compact reply ownership', async () => {
    await useMorpheusVoiceStore.getState().startListening('quick-command'); const capture = mocks.captures[0];
    await capture.options.onAudioFrame!(new Uint8Array([1, 2])); expect(mocks.route).not.toHaveBeenCalled();
    final.resolve(result()); final.resolve(result('Different stale result.')); await settle();
    expect(mocks.captureStop).toHaveBeenCalledOnce(); expect(mocks.route).toHaveBeenCalledExactlyOnceWith('Open YouTube.', 'voice');
    expect(mocks.runObjective).toHaveBeenCalledExactlyOnceWith('Open YouTube.', 'voice', expect.any(Function));
    expect(mocks.bindObjectiveSpeech).toHaveBeenCalledWith('objective-cloud', { surface: 'compact', input: 'voice' });
    expect(useMorpheusVoiceStore.getState()).toMatchObject({ phase: 'ready', transcript: 'Open YouTube.', startedAt: null });
    expect(mocks.transcribeAudio).not.toHaveBeenCalled(); expect(mocks.finish).not.toHaveBeenCalled();
  });

  it('onboarding uses real final input as calibration without altering drafts or executing the spoken words', async () => {
    await useMorpheusVoiceStore.getState().startListening('onboarding'); final.resolve(result('Open YouTube.')); await settle();
    expect(useMorpheusVoiceStore.getState()).toMatchObject({ phase: 'ready', transcript: 'Open YouTube.', source: 'onboarding' });
    expect(mocks.captureStop).toHaveBeenCalledOnce(); expect(mocks.setInput).not.toHaveBeenCalled(); expect(mocks.setDraft).not.toHaveBeenCalled();
    expect(mocks.route).not.toHaveBeenCalled(); expect(mocks.runObjective).not.toHaveBeenCalled(); expect(mocks.submitConversation).not.toHaveBeenCalled();
  });

  it('manual finish releases the microphone before Main finish and preserves the pending final until it arrives', async () => {
    await useMorpheusVoiceStore.getState().startListening('quick-command'); mocks.order.length = 0;
    useMorpheusVoiceStore.getState().stopListening(); await settle();
    expect(mocks.order).toEqual(['stop-microphone', 'finish-main']);
    expect(mocks.finish).toHaveBeenCalledExactlyOnceWith({ sessionId: 'cloud-input-1' }); expect(mocks.cancel).not.toHaveBeenCalled();
    expect(useMorpheusVoiceStore.getState().phase).toBe('transcribing'); expect(mocks.route).not.toHaveBeenCalled();
    useMorpheusVoiceStore.getState().stopListening(); expect(mocks.finish).toHaveBeenCalledOnce();
    final.resolve(result()); await settle(); expect(mocks.runObjective).toHaveBeenCalledOnce();
    expect(mocks.captureStop).toHaveBeenCalledOnce(); expect(useMorpheusVoiceStore.getState().phase).toBe('ready');
  });

  it('cancellation retires current input and prevents late PCM or a late final from becoming a command', async () => {
    await useMorpheusVoiceStore.getState().startListening('quick-command'); const capture = mocks.captures[0];
    useMorpheusVoiceStore.getState().cancel(); final.resolve(result()); await settle();
    await expect(capture.options.onAudioFrame!(new Uint8Array([1, 2]))).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.captureStop).toHaveBeenCalledOnce(); expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith({ sessionId: 'cloud-input-1' });
    expect(mocks.feed).not.toHaveBeenCalled(); expect(mocks.route).not.toHaveBeenCalled(); expect(mocks.runObjective).not.toHaveBeenCalled();
    expect(useMorpheusVoiceStore.getState()).toMatchObject({ phase: 'idle', transcript: null, source: null });
  });

  it('manual mute wins immediately while its settings save is pending, ignoring a simultaneous final', async () => {
    await useMorpheusVoiceStore.getState().startListening('quick-command'); const capture = mocks.captures[0];
    const save = deferred<MorpheusVoiceStatus>(); mocks.updateVoiceSettings.mockReturnValueOnce(save.promise);
    const muted = useMorpheusVoiceStore.getState().updateSettings({ enabled: false });
    expect(mocks.captureStop).toHaveBeenCalledOnce(); final.resolve(result()); await settle();
    await expect(capture.options.onAudioFrame!(new Uint8Array([1, 2]))).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.route).not.toHaveBeenCalled(); expect(mocks.runObjective).not.toHaveBeenCalled(); expect(useMorpheusVoiceStore.getState().transcript).toBeNull();
    save.resolve(status(false)); await muted; expect(useMorpheusVoiceStore.getState().status?.settings.enabled).toBe(false);
    await useMorpheusVoiceStore.getState().startListening('quick-command'); expect(mocks.begin).toHaveBeenCalledOnce();
    expect(useMorpheusVoiceStore.getState().errorKind).toBe('muted');
  });

  it('Main mute presence revokes the cloud turn before a late provider final', async () => {
    const unsubscribe = useMorpheusVoiceStore.getState().subscribePresence();
    await useMorpheusVoiceStore.getState().startListening('quick-command');
    mocks.presenceHandler?.({ ...status().presence, inputEnabled: false }); final.resolve(result()); await settle();
    expect(mocks.captureStop).toHaveBeenCalledOnce(); expect(mocks.cancel).toHaveBeenCalledOnce();
    expect(mocks.route).not.toHaveBeenCalled(); expect(mocks.runObjective).not.toHaveBeenCalled(); expect(useMorpheusVoiceStore.getState().transcript).toBeNull(); unsubscribe();
  });

  it('never opens a microphone when a cancelled Main admission resolves late', async () => {
    const admission = deferred<{ sessionId: string }>(); mocks.begin.mockReturnValueOnce(admission.promise);
    const started = useMorpheusVoiceStore.getState().startListening('quick-command'); await settle();
    useMorpheusVoiceStore.getState().cancel(); admission.resolve({ sessionId: 'retired-input' }); await started;
    expect(mocks.captures).toHaveLength(0); expect(mocks.wait).not.toHaveBeenCalled();
    expect(mocks.cancel).toHaveBeenCalledWith({ sessionId: 'retired-input' }); expect(useMorpheusVoiceStore.getState().phase).toBe('idle');
  });

  it('retires a microphone still acquiring when provider failure arrives and does not execute', async () => {
    const acquiring = deferred<void>(); mocks.captureStart.mockReturnValueOnce(acquiring.promise);
    const started = useMorpheusVoiceStore.getState().startListening('quick-command'); await settle();
    final.reject(new Error('Voice provider could not be reached.')); await settle();
    expect(mocks.captureStop).toHaveBeenCalledOnce(); acquiring.resolve(); await started;
    expect(useMorpheusVoiceStore.getState()).toMatchObject({ phase: 'error', transcript: null });
    expect(mocks.route).not.toHaveBeenCalled(); expect(mocks.runObjective).not.toHaveBeenCalled();
  });

  it('keeps a completed transcript editable when automatic submission is disabled', async () => {
    const manual = status(); manual.settings.autoSubmitTranscript = false; mocks.voiceStatus.mockResolvedValue(manual);
    await useMorpheusVoiceStore.getState().startListening('command-center'); final.resolve(result()); await settle();
    expect(mocks.setInput).toHaveBeenCalledExactlyOnceWith('Open YouTube.'); expect(mocks.setDraft).toHaveBeenCalledWith('Open YouTube.', undefined);
    expect(mocks.route).not.toHaveBeenCalled(); expect(mocks.runObjective).not.toHaveBeenCalled(); expect(useMorpheusVoiceStore.getState().phase).toBe('ready');
  });
});
