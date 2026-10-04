import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  voiceStatus: vi.fn(),
  prepareVoiceOutput: vi.fn(async () => ({ prepared: true })),
  transcribeAudio: vi.fn(),
  submitObjective: vi.fn(),
  routeInteraction: vi.fn(),
  expandCompanionSurface: vi.fn(),
  beginAmbientVoice: vi.fn(),
  endAmbientVoice: vi.fn(),
  setVoiceSpeaking: vi.fn(),
  submitConversation: vi.fn(),
  setDraft: vi.fn(),
  updateVoiceSettings: vi.fn(),
  voicePresenceHandler: null as ((...args: unknown[]) => void) | null,
}));

vi.mock('@/lib/host-api', () => ({
  hostApi: {
    morpheus: {
      voiceStatus: mocks.voiceStatus,
      prepareVoiceOutput: mocks.prepareVoiceOutput,
      transcribeAudio: mocks.transcribeAudio,
      submitObjective: mocks.submitObjective,
      routeInteraction: mocks.routeInteraction,
      expandCompanionSurface: mocks.expandCompanionSurface,
      beginAmbientVoice: mocks.beginAmbientVoice,
      endAmbientVoice: mocks.endAmbientVoice,
      setVoiceSpeaking: mocks.setVoiceSpeaking,
      cancelSpeech: vi.fn(),
      updateVoiceSettings: mocks.updateVoiceSettings,
    },
  },
}));

vi.mock('@/stores/morpheus-conversation', () => ({ useMorpheusConversationStore: { getState: () => ({
  submit: mocks.submitConversation, setDraft: mocks.setDraft, dispatchError: null,
}) } }));

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
const getUserMedia = vi.fn(async () => ({ getTracks: () => [track], getAudioTracks: () => [] }));

beforeEach(async () => {
  vi.clearAllMocks();
  getUserMedia.mockResolvedValue({ getTracks: () => [track], getAudioTracks: () => [] });
  vi.stubGlobal('AudioContext', class {
    createAnalyser() { return { fftSize: 32, getByteTimeDomainData: (sample: Uint8Array) => sample.fill(128) }; }
    createMediaStreamSource() { return { connect: vi.fn() }; }
    close = vi.fn(async () => undefined);
  });
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
    mode: 'auto', lastDecision: null, clarification: null, pendingConversation: null, pendingConversations: [],
  });
  useMorpheusVoiceStore.setState({
    ambientScope: 'conversation', ambientReady: false,
    phase: 'idle', status: null, presence: null, transcript: null, error: null, errorKind: null, source: null, startedAt: null,
    followUpUntil: null,
    replyTurn: null,
  });
  useMorpheusCommandStore.setState({
    input: '', plan: null, unsupported: null, interpreting: false, executing: false,
    planResult: null, objectiveRun: null, objectiveHistory: null,
  });
  // Only a successful explicit unmute releases the runtime veto, including tests.
  mocks.updateVoiceSettings.mockResolvedValue(await mocks.voiceStatus());
  await useMorpheusVoiceStore.getState().updateSettings({ enabled: true });
  useMorpheusVoiceStore.setState({ status: null, presence: null });
  vi.clearAllMocks();
});

afterEach(async () => {
  useMorpheusVoiceStore.getState().cancel();
  await useMorpheusVoiceStore.getState().setAmbientScope('conversation');
  vi.unstubAllGlobals();
});

describe('Morpheus renderer voice controller', () => {
  const companionStatus = async () => ({ ...await mocks.voiceStatus(), settings: {
    ...(await mocks.voiceStatus()).settings, ambientEnabled: true, localWakeEnabled: true,
    ambientSilenceMs: 1000, ambientMaxUtteranceMs: 20000,
  } });

  it('preserves automatic voice consent while foreground chat and settings never acquire a microphone', async () => {
    const status = await companionStatus();
    mocks.voiceStatus.mockResolvedValue(status); mocks.updateVoiceSettings.mockResolvedValue(status);
    await useMorpheusVoiceStore.getState().loadStatus();
    await useMorpheusVoiceStore.getState().ensureAmbient();
    await useMorpheusVoiceStore.getState().updateSettings({ ambientEnabled: true });
    expect(useMorpheusVoiceStore.getState().status?.settings.ambientEnabled).toBe(true);
    expect(mocks.beginAmbientVoice).not.toHaveBeenCalled(); expect(getUserMedia).not.toHaveBeenCalled();
    await useMorpheusVoiceStore.getState().startListening('quick-command');
    expect(useMorpheusVoiceStore.getState().phase).toBe('listening');
    expect(getUserMedia).toHaveBeenCalledOnce(); expect(mocks.prepareVoiceOutput).toHaveBeenCalledOnce();
  });
  it('starts consented companion capture once and releases it on returning to typed conversation', async () => {
    const status = await companionStatus(); mocks.voiceStatus.mockResolvedValue(status);
    await useMorpheusVoiceStore.getState().loadStatus();
    await useMorpheusVoiceStore.getState().setAmbientScope('companion');
    expect(useMorpheusVoiceStore.getState().ambientReady).toBe(true);
    await useMorpheusVoiceStore.getState().ensureAmbient();
    expect(getUserMedia).toHaveBeenCalledOnce();
    await useMorpheusVoiceStore.getState().setAmbientScope('conversation');
    expect(track.stop).toHaveBeenCalledOnce(); expect(mocks.endAmbientVoice).toHaveBeenCalledOnce();
    expect(useMorpheusVoiceStore.getState()).toMatchObject({ ambientReady: false, ambientScope: 'conversation' });
    expect(useMorpheusVoiceStore.getState().status?.settings.ambientEnabled).toBe(true);
    await useMorpheusVoiceStore.getState().setAmbientScope('companion');
    expect(getUserMedia).toHaveBeenCalledTimes(2); expect(useMorpheusVoiceStore.getState().ambientReady).toBe(true);
  });

  it('reloads committed native settings once and applies tray off/on only in companion scope', async () => {
    const base = await companionStatus();
    const statusAt = (revision: number, ambientEnabled: boolean) => ({ ...base,
      settings: { ...base.settings, ambientEnabled },
      presence: { v: 4, state: 'asleep', ambientEnabled, settingsRevision: revision },
    });
    const initial = statusAt(0, false);
    mocks.voiceStatus.mockResolvedValue(initial);
    await useMorpheusVoiceStore.getState().loadStatus();
    await useMorpheusVoiceStore.getState().setAmbientScope('companion');
    const unsubscribe = useMorpheusVoiceStore.getState().subscribePresence();
    mocks.voiceStatus.mockClear();
    const enabled = statusAt(1, true);
    mocks.voiceStatus.mockResolvedValue(enabled);
    mocks.beginAmbientVoice.mockResolvedValue({ ...enabled.presence, state: 'armed' });
    mocks.voicePresenceHandler?.(enabled.presence);
    await vi.waitFor(() => expect(useMorpheusVoiceStore.getState().ambientReady).toBe(true));
    mocks.voicePresenceHandler?.({ ...enabled.presence, state: 'armed' });
    expect(mocks.voiceStatus).toHaveBeenCalledOnce(); expect(getUserMedia).toHaveBeenCalledOnce();
    const disabled = statusAt(2, false);
    mocks.voiceStatus.mockResolvedValue(disabled);
    mocks.voicePresenceHandler?.(disabled.presence);
    expect(track.stop).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(useMorpheusVoiceStore.getState().status?.settings.ambientEnabled).toBe(false));
    const restored = statusAt(3, true);
    mocks.voiceStatus.mockResolvedValue(restored);
    mocks.beginAmbientVoice.mockResolvedValue({ ...restored.presence, state: 'armed' });
    mocks.voicePresenceHandler?.(restored.presence);
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    await useMorpheusVoiceStore.getState().setAmbientScope('conversation');
    const foregroundEdit = statusAt(4, true);
    mocks.voiceStatus.mockResolvedValue(foregroundEdit);
    mocks.voicePresenceHandler?.(foregroundEdit.presence);
    await vi.waitFor(() => expect(useMorpheusVoiceStore.getState().presence?.settingsRevision).toBe(4));
    await Promise.resolve();
    expect(getUserMedia).toHaveBeenCalledTimes(2); expect(mocks.beginAmbientVoice).toHaveBeenCalledTimes(2);
    expect(useMorpheusVoiceStore.getState().ambientReady).toBe(false);
    unsubscribe();
  });

  it('keeps immediate master mute while a native settings reload and persistence are pending', async () => {
    const base = await companionStatus();
    const status = { ...base, presence: { v: 4, state: 'armed', ambientEnabled: true, settingsRevision: 0 } };
    mocks.voiceStatus.mockResolvedValue(status);
    await useMorpheusVoiceStore.getState().loadStatus();
    await useMorpheusVoiceStore.getState().setAmbientScope('companion');
    const unsubscribe = useMorpheusVoiceStore.getState().subscribePresence();
    let reload!: (value: unknown) => void, persist!: (value: unknown) => void;
    mocks.voiceStatus.mockReturnValueOnce(new Promise(resolve => { reload = resolve; }));
    mocks.voicePresenceHandler?.({ ...status.presence, settingsRevision: 1 });
    mocks.updateVoiceSettings.mockReturnValueOnce(new Promise(resolve => { persist = resolve; }));
    const muting = useMorpheusVoiceStore.getState().updateSettings({ enabled: false });
    reload({ ...status, presence: { ...status.presence, settingsRevision: 1 } });
    await Promise.resolve(); await Promise.resolve();
    await useMorpheusVoiceStore.getState().ensureAmbient();
    mocks.voicePresenceHandler?.({ ...status.presence, settingsRevision: 1, state: 'understanding', wakeSequence: 50, wakeCommand: 'Open YouTube' });
    await useMorpheusVoiceStore.getState().startListening();
    expect(getUserMedia).toHaveBeenCalledOnce(); expect(mocks.routeInteraction).not.toHaveBeenCalled();
    expect(useMorpheusVoiceStore.getState().status?.settings.enabled).toBe(false);
    const muted = { ...status, settings: { ...status.settings, enabled: false },
      presence: { ...status.presence, state: 'asleep', settingsRevision: 2 } };
    persist(muted); await muting;
    const nativeEdit = { ...muted, presence: { ...muted.presence, settingsRevision: 3 } };
    mocks.voiceStatus.mockResolvedValue(nativeEdit);
    mocks.voicePresenceHandler?.(nativeEdit.presence);
    await vi.waitFor(() => expect(useMorpheusVoiceStore.getState().status?.presence.settingsRevision).toBe(3));
    expect(getUserMedia).toHaveBeenCalledOnce(); expect(useMorpheusVoiceStore.getState().ambientReady).toBe(false);
    unsubscribe();
  });

  it.each([false, true])('synchronizes committed tray consent %s after cancellation without a stale capture restart', async ambientEnabled => {
    const base = await companionStatus();
    const initial = { ...base, settings: { ...base.settings, ambientEnabled: !ambientEnabled },
      presence: { v: 4, state: 'asleep', ambientEnabled: !ambientEnabled, settingsRevision: 0 } };
    mocks.voiceStatus.mockResolvedValue(initial);
    await useMorpheusVoiceStore.getState().loadStatus();
    await useMorpheusVoiceStore.getState().setAmbientScope('companion');
    const acquisitions = getUserMedia.mock.calls.length;
    const unsubscribe = useMorpheusVoiceStore.getState().subscribePresence();
    let reload!: (value: unknown) => void;
    mocks.voiceStatus.mockClear();
    mocks.voiceStatus.mockReturnValueOnce(new Promise(resolve => { reload = resolve; }));
    const committed = { ...base, settings: { ...base.settings, ambientEnabled },
      presence: { v: 4, state: 'armed', ambientEnabled, settingsRevision: 1 } };
    mocks.voicePresenceHandler?.(committed.presence);
    const live = { ...committed.presence, state: 'asleep', wakeSequence: 2 };
    mocks.voicePresenceHandler?.(live);
    useMorpheusVoiceStore.getState().cancel();
    reload(committed);
    await vi.waitFor(() => expect(useMorpheusVoiceStore.getState().status?.settings.ambientEnabled).toBe(ambientEnabled));
    await Promise.resolve();
    expect(useMorpheusVoiceStore.getState().status?.presence).toEqual(live);
    expect(useMorpheusVoiceStore.getState().presence).toEqual(live);
    expect(getUserMedia).toHaveBeenCalledTimes(acquisitions);
    mocks.voicePresenceHandler?.(live);
    expect(mocks.voiceStatus).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('keeps a committed tray reload valid during a new explicit recording without opening automatic capture', async () => {
    const base = await companionStatus();
    const initial = { ...base, settings: { ...base.settings, ambientEnabled: false },
      presence: { v: 4, state: 'asleep', ambientEnabled: false, settingsRevision: 0 } };
    mocks.voiceStatus.mockResolvedValue(initial);
    await useMorpheusVoiceStore.getState().loadStatus();
    await useMorpheusVoiceStore.getState().setAmbientScope('companion');
    const unsubscribe = useMorpheusVoiceStore.getState().subscribePresence();
    const committed = { ...base, presence: { v: 4, state: 'armed', ambientEnabled: true, settingsRevision: 1 } };
    let reload!: (value: unknown) => void;
    mocks.voiceStatus.mockReturnValueOnce(new Promise(resolve => { reload = resolve; })).mockResolvedValue(committed);
    mocks.voicePresenceHandler?.(committed.presence);
    await useMorpheusVoiceStore.getState().startListening('onboarding');
    expect(useMorpheusVoiceStore.getState().phase).toBe('listening');
    reload(committed);
    await vi.waitFor(() => expect(useMorpheusVoiceStore.getState().status?.settings.ambientEnabled).toBe(true));
    await Promise.resolve(); await Promise.resolve();
    expect(useMorpheusVoiceStore.getState().phase).toBe('listening');
    expect(getUserMedia).toHaveBeenCalledOnce(); expect(mocks.beginAmbientVoice).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('does not let a delayed tray reload clear a later permission failure or retry acquisition', async () => {
    const base = await companionStatus();
    const initial = { ...base, presence: { v: 4, state: 'asleep', ambientEnabled: true, settingsRevision: 0 } };
    mocks.voiceStatus.mockResolvedValue(initial);
    getUserMedia.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));
    await useMorpheusVoiceStore.getState().loadStatus();
    await expect(useMorpheusVoiceStore.getState().setAmbientScope('companion')).rejects.toThrow('Permission denied');
    const unsubscribe = useMorpheusVoiceStore.getState().subscribePresence();
    const committed = { ...base, presence: { v: 4, state: 'armed', ambientEnabled: true, settingsRevision: 1 } };
    let reload!: (value: unknown) => void;
    mocks.voiceStatus.mockReturnValueOnce(new Promise(resolve => { reload = resolve; })).mockResolvedValue(committed);
    mocks.voicePresenceHandler?.(committed.presence);
    getUserMedia.mockRejectedValueOnce(new DOMException('Still denied', 'NotAllowedError'));
    await useMorpheusVoiceStore.getState().startListening('onboarding');
    const permissionFailure = useMorpheusVoiceStore.getState().error;
    expect(permissionFailure).toContain('Still denied');
    reload(committed);
    await vi.waitFor(() => expect(useMorpheusVoiceStore.getState().status?.settings.ambientEnabled).toBe(true));
    await Promise.resolve(); await Promise.resolve();
    await useMorpheusVoiceStore.getState().loadStatus();
    await useMorpheusVoiceStore.getState().ensureAmbient();
    expect(useMorpheusVoiceStore.getState()).toMatchObject({ phase: 'error', errorKind: 'permission', error: permissionFailure, ambientReady: false });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('rejects a superseded status read and an older explicit recording response after a tray edit', async () => {
    const base = await companionStatus();
    const initial = { ...base, presence: { v: 4, state: 'asleep', ambientEnabled: true, settingsRevision: 0 } };
    mocks.voiceStatus.mockResolvedValue(initial);
    await useMorpheusVoiceStore.getState().loadStatus();
    let oldRead!: (value: unknown) => void, oldRecording!: (value: unknown) => void;
    mocks.voiceStatus.mockReturnValueOnce(new Promise(resolve => { oldRead = resolve; }));
    const reading = useMorpheusVoiceStore.getState().loadStatus();
    mocks.voiceStatus.mockReturnValueOnce(new Promise(resolve => { oldRecording = resolve; }));
    const recording = useMorpheusVoiceStore.getState().startListening('onboarding');
    const unsubscribe = useMorpheusVoiceStore.getState().subscribePresence();
    const committed = { ...base, settings: { ...base.settings, ambientEnabled: false },
      presence: { v: 4, state: 'asleep', ambientEnabled: false, settingsRevision: 1 } };
    mocks.voiceStatus.mockResolvedValue(committed);
    mocks.voicePresenceHandler?.(committed.presence);
    await vi.waitFor(() => expect(useMorpheusVoiceStore.getState().status?.settings.ambientEnabled).toBe(false));
    oldRead(initial); expect(await reading).toBeNull();
    oldRecording(initial); await recording;
    expect(useMorpheusVoiceStore.getState()).toMatchObject({ phase: 'idle', status: { settings: { ambientEnabled: false } } });
    expect(getUserMedia).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('preserves a failed acquisition until a deliberate committed settings edit retries it', async () => {
    const base = await companionStatus();
    const status = { ...base, presence: { v: 4, state: 'asleep', ambientEnabled: true, settingsRevision: 0 } };
    mocks.voiceStatus.mockResolvedValue(status);
    getUserMedia.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));
    await useMorpheusVoiceStore.getState().loadStatus();
    await expect(useMorpheusVoiceStore.getState().setAmbientScope('companion')).rejects.toThrow('Permission denied');
    const unsubscribe = useMorpheusVoiceStore.getState().subscribePresence();
    mocks.voicePresenceHandler?.({ ...status.presence, state: 'armed' });
    await useMorpheusVoiceStore.getState().loadStatus();
    await useMorpheusVoiceStore.getState().ensureAmbient();
    expect(getUserMedia).toHaveBeenCalledOnce(); expect(useMorpheusVoiceStore.getState().errorKind).toBe('permission');
    const deliberate = { ...status, presence: { ...status.presence, settingsRevision: 1 } };
    mocks.voiceStatus.mockResolvedValue(deliberate);
    mocks.beginAmbientVoice.mockResolvedValue({ ...deliberate.presence, state: 'armed' });
    mocks.voicePresenceHandler?.(deliberate.presence);
    await vi.waitFor(() => expect(useMorpheusVoiceStore.getState().ambientReady).toBe(true));
    expect(getUserMedia).toHaveBeenCalledTimes(2); expect(useMorpheusVoiceStore.getState().error).toBeNull();
    unsubscribe();
  });

  it('discards a microphone returned after a rapid companion to chat transition', async () => {
    const status = await companionStatus(); mocks.voiceStatus.mockResolvedValue(status);
    let acquire!: (value: Awaited<ReturnType<typeof getUserMedia>>) => void;
    getUserMedia.mockReturnValueOnce(new Promise(resolve => { acquire = resolve; }));
    await useMorpheusVoiceStore.getState().loadStatus();
    const starting = useMorpheusVoiceStore.getState().setAmbientScope('companion');
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    await useMorpheusVoiceStore.getState().setAmbientScope('conversation');
    acquire({ getTracks: () => [track], getAudioTracks: () => [] }); await starting;
    expect(track.stop).toHaveBeenCalledOnce();
    expect(useMorpheusVoiceStore.getState()).toMatchObject({ ambientReady: false, ambientScope: 'conversation', error: null });
  });

  it('keeps permission failure unready and cannot dispatch a stale wake into foreground chat', async () => {
    const status = await companionStatus(); mocks.voiceStatus.mockResolvedValue(status);
    getUserMedia.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));
    await useMorpheusVoiceStore.getState().loadStatus();
    await expect(useMorpheusVoiceStore.getState().setAmbientScope('companion')).rejects.toThrow('Permission denied');
    expect(useMorpheusVoiceStore.getState()).toMatchObject({ ambientReady: false, phase: 'error', errorKind: 'permission' });
    const failure = useMorpheusVoiceStore.getState().error;
    await useMorpheusVoiceStore.getState().setAmbientScope('conversation');
    const unsubscribe = useMorpheusVoiceStore.getState().subscribePresence();
    mocks.voicePresenceHandler?.({ state: 'understanding', ambientEnabled: true, wakeSequence: 10, wakeCommand: 'Open YouTube' });
    expect(mocks.routeInteraction).not.toHaveBeenCalled();
    expect(useMorpheusVoiceStore.getState().error).toBe(failure);
    expect(mocks.prepareVoiceOutput).not.toHaveBeenCalled(); unsubscribe();
  });

  it('master mute prevents companion restart without discarding saved consent', async () => {
    const status = await companionStatus(); mocks.voiceStatus.mockResolvedValue(status);
    await useMorpheusVoiceStore.getState().loadStatus();
    await useMorpheusVoiceStore.getState().setAmbientScope('companion');
    mocks.updateVoiceSettings.mockResolvedValue({ ...status, settings: { ...status.settings, enabled: false } });
    await useMorpheusVoiceStore.getState().updateSettings({ enabled: false });
    await useMorpheusVoiceStore.getState().setAmbientScope('conversation');
    await useMorpheusVoiceStore.getState().setAmbientScope('companion');
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(useMorpheusVoiceStore.getState()).toMatchObject({ ambientReady: false, status: { settings: { enabled: false, ambientEnabled: true } } });
  });

  it('mutes synchronously while settings persistence is pending and ignores stale wake events', async () => {
    const status = await companionStatus(); mocks.voiceStatus.mockResolvedValue(status);
    await useMorpheusVoiceStore.getState().loadStatus();
    await useMorpheusVoiceStore.getState().setAmbientScope('companion');
    let persist!: (value: unknown) => void;
    mocks.updateVoiceSettings.mockReturnValueOnce(new Promise(resolve => { persist = resolve; }));
    const mute = useMorpheusVoiceStore.getState().updateSettings({ enabled: false });
    expect(track.stop).toHaveBeenCalledOnce();
    expect(useMorpheusVoiceStore.getState()).toMatchObject({ ambientReady: false, status: { settings: { enabled: false, ambientEnabled: true } } });
    const unsubscribe = useMorpheusVoiceStore.getState().subscribePresence();
    mocks.voicePresenceHandler?.({ state: 'understanding', ambientEnabled: true, wakeSequence: 20, wakeCommand: 'Open YouTube' });
    await useMorpheusVoiceStore.getState().loadStatus();
    await useMorpheusVoiceStore.getState().ensureAmbient();
    await useMorpheusVoiceStore.getState().startListening();
    expect(mocks.routeInteraction).not.toHaveBeenCalled(); expect(getUserMedia).toHaveBeenCalledOnce();
    persist({ ...status, settings: { ...status.settings, enabled: false } }); await mute; unsubscribe();
  });

  it('does not resume a permission-failed companion microphone on hide and show', async () => {
    const status = await companionStatus(); mocks.voiceStatus.mockResolvedValue(status);
    getUserMedia.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));
    await useMorpheusVoiceStore.getState().loadStatus();
    await expect(useMorpheusVoiceStore.getState().setAmbientScope('companion')).rejects.toThrow();
    await useMorpheusVoiceStore.getState().setAmbientScope('conversation');
    await useMorpheusVoiceStore.getState().setAmbientScope('companion');
    await useMorpheusVoiceStore.getState().ensureAmbient();
    expect(getUserMedia).toHaveBeenCalledOnce(); expect(mocks.beginAmbientVoice).toHaveBeenCalledOnce();
    expect(useMorpheusVoiceStore.getState()).toMatchObject({ ambientReady: false, phase: 'error' });
  });

  it('keeps failed microphone recovery through a settings refresh until deliberate retry', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('Requested device not found', 'NotFoundError'));
    await useMorpheusVoiceStore.getState().startListening('quick-command');
    const failure = useMorpheusVoiceStore.getState().error;
    expect(useMorpheusVoiceStore.getState()).toMatchObject({ phase: 'error', errorKind: 'device' });
    await useMorpheusVoiceStore.getState().loadStatus();
    expect(useMorpheusVoiceStore.getState()).toMatchObject({ phase: 'error', errorKind: 'device', error: failure });
    expect(getUserMedia).toHaveBeenCalledOnce();
    await useMorpheusVoiceStore.getState().startListening('quick-command');
    expect(useMorpheusVoiceStore.getState()).toMatchObject({ phase: 'listening', error: null, errorKind: null });
    useMorpheusVoiceStore.getState().cancel();
  });

  it('settles a cleared error to idle after explicit settings repair without claiming capture success', async () => {
    useMorpheusVoiceStore.setState({ phase: 'error', errorKind: 'device', error: 'Requested device not found' });
    mocks.updateVoiceSettings.mockResolvedValue(await mocks.voiceStatus());
    await useMorpheusVoiceStore.getState().updateSettings({ inputDeviceId: 'new-device' });
    expect(useMorpheusVoiceStore.getState()).toMatchObject({ phase: 'idle', error: null, errorKind: null });
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('binds spoken conversation only to the exact Main admission before reply dispatch', async () => {
    mocks.routeInteraction.mockResolvedValue({ route: 'conversation', text: 'How are you?', confidence: 'high' });
    const turn = { conversationId: 'chat', turnId: 'admitted-voice', clientRequestId: 'request', source: 'voice', status: 'admitted', generation: 1, admittedAt: '2026-10-03T00:00:00Z' };
    mocks.submitConversation.mockImplementation(async (_text, _source, onAdmitted) => { onAdmitted(turn); return true; });
    await useMorpheusVoiceStore.getState().startListening('quick-command'); useMorpheusVoiceStore.getState().stopListening();
    await vi.waitFor(() => expect(useMorpheusVoiceStore.getState().replyTurn?.turn).toEqual(turn));
    expect(mocks.submitObjective).not.toHaveBeenCalled();
    expect(useMorpheusVoiceStore.getState().claimReplyTurn(turn.turnId)).toBe(true);
    expect(useMorpheusVoiceStore.getState().claimReplyTurn(turn.turnId)).toBe(false);
    useMorpheusVoiceStore.getState().cancel(); expect(useMorpheusVoiceStore.getState().replyTurn).toBeNull();
  });
  it('does not bind an admission that returns after cancellation', async () => {
    mocks.routeInteraction.mockResolvedValue({ route: 'conversation', text: 'Hello' });
    let admitted!: () => void;
    mocks.submitConversation.mockImplementation(async (_text, _source, callback) => {
      await new Promise<void>((resolve) => { admitted = resolve; });
      callback({ turnId: 'late', source: 'voice' }); return true;
    });
    await useMorpheusVoiceStore.getState().startListening(); useMorpheusVoiceStore.getState().stopListening();
    await vi.waitFor(() => expect(mocks.submitConversation).toHaveBeenCalledOnce());
    useMorpheusVoiceStore.getState().cancel(); admitted(); await Promise.resolve(); await Promise.resolve();
    expect(useMorpheusVoiceStore.getState().replyTurn).toBeNull();
  });
  it('discards late routing after cancellation before admitting another turn', async () => {
    let decide!: (value: unknown) => void;
    mocks.routeInteraction.mockReturnValueOnce(new Promise((resolve) => { decide = resolve; }));
    await useMorpheusVoiceStore.getState().startListening(); useMorpheusVoiceStore.getState().stopListening();
    await vi.waitFor(() => expect(mocks.routeInteraction).toHaveBeenCalledOnce());
    useMorpheusVoiceStore.getState().cancel(); decide({ route: 'conversation', text: 'Hello' }); await Promise.resolve();
    expect(mocks.submitConversation).not.toHaveBeenCalled();
  });
  it('manual microphone mute clears reply authority and prevents follow-up capture', async () => {
    await useMorpheusVoiceStore.getState().startListening();
    const status = await mocks.voiceStatus(); status.settings.enabled = false;
    mocks.updateVoiceSettings.mockResolvedValue(status);
    await useMorpheusVoiceStore.getState().updateSettings({ enabled: false });
    expect(track.stop).toHaveBeenCalled(); expect(useMorpheusVoiceStore.getState().phase).toBe('idle');
    await useMorpheusVoiceStore.getState().continueAfterResponse(); expect(getUserMedia).toHaveBeenCalledOnce();
  });
  it('service invalidation releases capture and discards late status/transcription without submitting', async () => {
    const unsubscribe = useMorpheusVoiceStore.getState().subscribePresence();
    await useMorpheusVoiceStore.getState().startListening();
    expect(useMorpheusVoiceStore.getState().phase).toBe('listening');
    let status!: (value: unknown) => void;
    mocks.voiceStatus.mockReturnValueOnce(new Promise((resolve) => { status = resolve; }));
    const stale = useMorpheusVoiceStore.getState().loadStatus();
    mocks.voiceStatus.mockResolvedValue({ presence: { state: 'asleep', ambientEnabled: false, authorityRevision: 1 },
      settings: { enabled: true, ambientEnabled: false }, transcriptionAvailable: false, providers: [] });
    mocks.voicePresenceHandler?.({ v: 4, state: 'asleep', ambientEnabled: false, authorityRevision: 1 });
    status({ transcriptionAvailable: true, presence: { authorityRevision: 0 } }); await stale; await Promise.resolve();
    expect(useMorpheusVoiceStore.getState().phase).toBe('idle');
    expect(useMorpheusVoiceStore.getState().status?.transcriptionAvailable).toBe(false);
    expect(track.stop).toHaveBeenCalled(); expect(mocks.transcribeAudio).not.toHaveBeenCalled(); expect(mocks.submitObjective).not.toHaveBeenCalled();
    const reads = mocks.voiceStatus.mock.calls.length;
    mocks.voicePresenceHandler?.({ v: 4, state: 'armed', ambientEnabled: true, authorityRevision: 0 });
    expect(mocks.voiceStatus).toHaveBeenCalledTimes(reads);
    expect(useMorpheusVoiceStore.getState().presence?.authorityRevision).toBe(1);
    unsubscribe();
  });

  it('releases old capture when a status reply reveals replacement before its authority event', async () => {
    const base = await companionStatus();
    const initial = { ...base, presence: { v: 4, state: 'armed', ambientEnabled: true, authorityRevision: 0 } };
    mocks.voiceStatus.mockResolvedValue(initial);
    await useMorpheusVoiceStore.getState().loadStatus();
    await useMorpheusVoiceStore.getState().setAmbientScope('companion');
    await useMorpheusVoiceStore.getState().startListening('onboarding');
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    const replacement = { ...base, presence: { v: 4, state: 'asleep', ambientEnabled: true, authorityRevision: 1 } };
    mocks.voiceStatus.mockResolvedValue(replacement);
    await useMorpheusVoiceStore.getState().loadStatus();
    expect(useMorpheusVoiceStore.getState()).toMatchObject({ phase: 'idle', ambientReady: false, presence: { authorityRevision: 1 } });
    expect(track.stop).toHaveBeenCalledTimes(2);
    const unsubscribe = useMorpheusVoiceStore.getState().subscribePresence();
    mocks.voicePresenceHandler?.({ ...replacement.presence, state: 'armed' });
    await useMorpheusVoiceStore.getState().ensureAmbient();
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('keeps master mute when a pending unmute reply reveals a replacement service', async () => {
    const base = await companionStatus();
    const initial = { ...base, presence: { v: 4, state: 'armed', ambientEnabled: true, authorityRevision: 0 } };
    mocks.voiceStatus.mockResolvedValue(initial);
    await useMorpheusVoiceStore.getState().loadStatus();
    await useMorpheusVoiceStore.getState().setAmbientScope('companion');
    mocks.updateVoiceSettings.mockResolvedValue({ ...initial, settings: { ...base.settings, enabled: false } });
    await useMorpheusVoiceStore.getState().updateSettings({ enabled: false });
    const replacement = { ...base, presence: { v: 4, state: 'asleep', ambientEnabled: true, authorityRevision: 1 } };
    mocks.updateVoiceSettings.mockResolvedValue(replacement);
    await useMorpheusVoiceStore.getState().updateSettings({ enabled: true });
    await useMorpheusVoiceStore.getState().ensureAmbient();
    await useMorpheusVoiceStore.getState().startListening('onboarding');
    expect(useMorpheusVoiceStore.getState()).toMatchObject({ ambientReady: false, status: { settings: { enabled: false } }, presence: { authorityRevision: 1 } });
    expect(getUserMedia).toHaveBeenCalledOnce();
    // A new deliberate request against the current service can release the veto.
    mocks.beginAmbientVoice.mockResolvedValue({ ...replacement.presence, state: 'armed' });
    await useMorpheusVoiceStore.getState().updateSettings({ enabled: true });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });
  it('classifies disconnected and missing microphone errors for localized recovery', () => {
    expect(classifyMorpheusVoiceError(new Error('Microphone disconnected. Reconnect it and restart ambient voice.'))).toBe('device');
    expect(classifyMorpheusVoiceError(new DOMException('Requested device not found', 'NotFoundError'))).toBe('device');
    expect(classifyMorpheusVoiceError(new DOMException('The selected input vanished', 'NotFoundError'))).toBe('device');
    expect(classifyMorpheusVoiceError(new DOMException('This request cannot proceed', 'NotAllowedError'))).toBe('permission');
    expect(classifyMorpheusVoiceError(new Error('Test microphone is disconnected'))).toBe('device');
  });
  it('dispatches a Main-audited local command once without recording or paid transcription', async () => {
    const status = await mocks.voiceStatus();
    status.settings.localWakeEnabled = true;
    status.settings.ambientEnabled = true;
    // No capture startup is needed to exercise a real Main event handoff.
    status.transcriptionAvailable = false;
    useMorpheusVoiceStore.setState({ ambientScope: 'companion', status, presence: { v: 1, state: 'armed', ambientEnabled: true, wakeSequence: 1 } });
    const unsubscribe = useMorpheusVoiceStore.getState().subscribePresence();
    const presence = { v: 1, state: 'understanding', ambientEnabled: true, wakeSequence: 2, wakeCommand: 'Open Notepad' };
    mocks.voicePresenceHandler?.(presence);
    mocks.voicePresenceHandler?.(presence);
    await vi.waitFor(() => expect(mocks.submitObjective).toHaveBeenCalledOnce());
    expect(mocks.routeInteraction).toHaveBeenCalledOnce();
    expect(mocks.transcribeAudio).not.toHaveBeenCalled();
    expect(getUserMedia).not.toHaveBeenCalled();
    unsubscribe();
  });
  it('ignores a completed transcription after the user cancels the interaction', async () => {
    let deliver!: (value: unknown) => void;
    mocks.transcribeAudio.mockReturnValueOnce(new Promise((resolve) => { deliver = resolve; }));
    await useMorpheusVoiceStore.getState().startListening('quick-command');
    useMorpheusVoiceStore.getState().stopListening();
    await vi.waitFor(() => expect(mocks.transcribeAudio).toHaveBeenCalledOnce());
    useMorpheusVoiceStore.getState().cancel();
    deliver({ transcript: 'Open Notepad', providerAccountId: 'openai', modelId: 'whisper-1', durationMs: 1000 });
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.routeInteraction).not.toHaveBeenCalled();
    expect(mocks.submitObjective).not.toHaveBeenCalled();
    expect(useMorpheusVoiceStore.getState().transcript).toBeNull();
  });
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
      ambientScope: 'companion',
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
    useMorpheusVoiceStore.setState({ ambientScope: 'companion' });
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

  it('does not reopen the foreground chat microphone after a spoken reply', async () => {
    vi.useFakeTimers();
    try {
      useMorpheusVoiceStore.setState({
        phase: 'ready',
        source: 'quick-command',
        status: {
          settings: {
            v: 4, enabled: true, providerAccountId: null, modelId: 'whisper-1',
            speakResponses: true, speechProviderAccountId: null,
            speechModelId: 'gpt-4o-mini-tts', speechVoice: 'cedar',
            autoSubmitTranscript: true, ambientEnabled: false,
            wakePhrase: 'Morpheus', ambientSilenceMs: 1_000,
            ambientMaxUtteranceMs: 20_000, bargeIn: true,
            handsFreeFollowUp: true,
          },
          transcriptionAvailable: true,
          neuralSpeechAvailable: false,
          providers: [],
        },
      });

      const pending = useMorpheusVoiceStore.getState().continueAfterResponse();
      expect(useMorpheusVoiceStore.getState().followUpUntil).toBeNull();
      await vi.advanceTimersByTimeAsync(320);
      await pending;

      expect(useMorpheusVoiceStore.getState()).toMatchObject({
        phase: 'ready', source: 'quick-command', followUpUntil: null,
      });
      expect(getUserMedia).not.toHaveBeenCalled();
      useMorpheusVoiceStore.getState().cancel();
    } finally {
      vi.useRealTimers();
    }
  });
});
