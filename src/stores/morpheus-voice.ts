import { create } from 'zustand';

import { hostApi } from '@/lib/host-api';
import { stopMorpheusSpeech } from '@/lib/morpheus-speech-player';
import { hostEvents } from '@/lib/host-events';
import {
  morpheusBlobToBase64,
  MorpheusAmbientVoiceCapture,
} from '@/lib/morpheus-ambient-voice';
import { meterMorpheusMicrophone } from '@/lib/morpheus-audio-level';
import { morpheusManagedRecording } from '@/lib/morpheus-managed-audio';
import { MorpheusVoiceDialogue } from '@/lib/morpheus-voice-dialogue';
import { playMorpheusWakeCue, stopMorpheusWakeCue } from '@/lib/morpheus-wake-cue';
import { useMorpheusCommandStore } from './morpheus-command';
import { useMorpheusConversationStore } from './morpheus-conversation';
import { useMorpheusOperatorStore } from './morpheus-operator';
import {
  MORPHEUS_VOICE_MAX_AUDIO_BYTES,
  MORPHEUS_VOICE_CONVERSATION_MAX_TURNS,
  MORPHEUS_VOICE_FOLLOW_UP_MS,
  MORPHEUS_VOICE_MAX_DURATION_MS,
  MORPHEUS_VOICE_MIME_TYPES,
  type MorpheusVoiceMimeType,
  type MorpheusVoicePresence,
  type MorpheusVoiceSettingsPatch,
  type MorpheusVoiceStatus,
} from '@shared/morpheus/voice-types';

export type MorpheusVoicePhase =
  | 'idle'
  | 'requesting'
  | 'listening'
  | 'transcribing'
  | 'ready'
  | 'error';

export type MorpheusVoiceSource =
  | 'command-center'
  | 'quick-command'
  | 'global-shortcut'
  | 'ambient'
  | 'onboarding';

export type MorpheusVoiceErrorKind =
  | 'repeat'
  | 'network'
  | 'configuration'
  | 'permission'
  | 'security'
  | 'device'
  | 'recording';

export function classifyMorpheusVoiceError(error: unknown): MorpheusVoiceErrorKind {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (message.includes('microphone disconnected') || message.includes('notfounderror')
    || message.includes('requested device not found')) return 'device';
  if (message.includes('empty') || message.includes('no speech') || message.includes("couldn't hear")) {
    return 'repeat';
  }
  if (message.includes('timed out') || message.includes('network') || message.includes('could not be reached')) {
    return 'network';
  }
  if (message.includes('managed') || message.includes('provider') || message.includes('api key') || message.includes('endpoint')
    || message.includes('http ') || message.includes('transcription is not configured')) {
    return 'configuration';
  }
  if (message.includes('permission') || message.includes('denied') || message.includes('notallowed')) {
    return 'permission';
  }
  if (message.includes('audit') || message.includes('security')) return 'security';
  return 'recording';
}

export type MorpheusVoiceState = {
  phase: MorpheusVoicePhase;
  status: MorpheusVoiceStatus | null;
  presence: MorpheusVoicePresence | null;
  transcript: string | null;
  error: string | null;
  errorKind: MorpheusVoiceErrorKind | null;
  lastAmbientHeardAt: number | null;
  source: MorpheusVoiceSource | null;
  startedAt: number | null;
  followUpUntil: number | null;
  endFollowUp: () => void;
  continueAfterResponse: () => Promise<void>;
  loadStatus: () => Promise<MorpheusVoiceStatus | null>;
  subscribePresence: () => () => void;
  updateSettings: (patch: MorpheusVoiceSettingsPatch) => Promise<void>;
  ensureAmbient: () => Promise<void>;
  stopAmbient: () => Promise<void>;
  startListening: (source?: MorpheusVoiceSource) => Promise<void>;
  stopListening: () => void;
  cancel: () => void;
  dismiss: () => void;
};

let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let chunks: Blob[] = [];
let chunkBytes = 0;
let durationTimer: number | null = null;
let operationGeneration = 0;
let discardRecording = false;
let ambientCapture: MorpheusAmbientVoiceCapture | null = null;
let ambientStarting: Promise<void> | null = null;
let ambientAutoStartBlocked = false;
let ambientGeneration = 0;
let stopMeter: (() => void) | null = null;
const dialogue = new MorpheusVoiceDialogue();
let followUpTimer: number | undefined;
let explicitConversationTurns = 0;

function clearDurationTimer(): void {
  if (durationTimer !== null) window.clearTimeout(durationTimer);
  durationTimer = null;
}

function stopStream(): void {
  stopMeter?.();
  stopMeter = null;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
}

function releaseRecording(): void {
  clearDurationTimer();
  stopStream();
  recorder = null;
  chunks = [];
  chunkBytes = 0;
}

function supportedMimeType(): MorpheusVoiceMimeType | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return MORPHEUS_VOICE_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? null;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 32 * 1024;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return window.btoa(binary);
}

async function routeVoiceInput(text: string): Promise<void> {
  const operator = useMorpheusOperatorStore.getState();
  const decision = await operator.route(text, 'voice');
  if (decision.route === 'objective') {
    if (await useMorpheusCommandStore.getState().runObjective(decision.text, 'voice')) {
      useMorpheusConversationStore.getState().setDraft('');
    }
    return;
  }
  if (decision.route === 'conversation') {
    await useMorpheusConversationStore.getState().submit(decision.text, 'voice');
  }
}

export const useMorpheusVoiceStore = create<MorpheusVoiceState>((set, get) => {
  const endFollowUp = (): void => {
    stopMorpheusWakeCue();
    dialogue.reset();
    window.clearTimeout(followUpTimer);
    explicitConversationTurns = 0;
    set({ followUpUntil: null });
  };
  const setFollowUpWindow = (until: number): void => {
    window.clearTimeout(followUpTimer);
    set({ followUpUntil: until });
    followUpTimer = window.setTimeout(() => {
      dialogue.reset();
      explicitConversationTurns = 0;
      set({ followUpUntil: null });
    }, Math.max(0, until - Date.now()));
  };
  const acknowledgeWake = (presence?: MorpheusVoicePresence): void => {
    stopMorpheusSpeech();
    if (get().status?.settings.speakResponses) playMorpheusWakeCue();
    const mainUntil = presence?.followUpUntil ? Date.parse(presence.followUpUntil) : Number.NaN;
    const until = Number.isFinite(mainUntil) && mainUntil > Date.now()
      ? mainUntil
      : dialogue.open(Date.now());
    set({ followUpUntil: until, phase: 'idle', source: 'ambient', transcript: null });
    setFollowUpWindow(until);
  };
  const fail = (error: unknown): void => {
    operationGeneration += 1;
    discardRecording = true;
    try {
      if (recorder?.state === 'recording') recorder.stop();
    } catch {
      // The stream cleanup below is authoritative.
    }
    releaseRecording();
    ambientCapture?.setSuppressed(false);
    set({
      phase: 'error',
      error: error instanceof Error ? error.message : String(error),
      errorKind: classifyMorpheusVoiceError(error),
      startedAt: null,
    });
  };

  const finishRecording = async (
    generation: number,
    mimeType: MorpheusVoiceMimeType,
    startedAt: number,
  ): Promise<void> => {
    clearDurationTimer();
    stopStream();
    if (generation !== operationGeneration || discardRecording) {
      releaseRecording();
      return;
    }
    const audioChunks = chunks;
    const bytes = chunkBytes;
    recorder = null;
    chunks = [];
    chunkBytes = 0;
    if (bytes === 0 || bytes > MORPHEUS_VOICE_MAX_AUDIO_BYTES) {
      fail(new Error('The voice recording was empty or exceeded the safe size limit.'));
      return;
    }
    try {
      const durationMs = Math.min(MORPHEUS_VOICE_MAX_DURATION_MS, Math.max(100, Date.now() - startedAt));
      const blob = new Blob(audioChunks, { type: mimeType });
      const payload = get().status?.captureFormat === 'pcm16-wav' ? await morpheusManagedRecording(blob) : {
        audioBase64: await blobToBase64(blob),
        mimeType,
        durationMs,
      };
      if (generation !== operationGeneration) return;
      const result = await hostApi.morpheus.transcribeAudio(payload);
      if (generation !== operationGeneration) return;
      const status = get().status;
      const source = get().source;
      // Activation uses the same real microphone and provider-backed
      // transcription path as normal voice commands, but calibration must
      // never become an Objective or leak a person's name into the command
      // composer. The transcript remains ephemeral renderer state until the
      // user explicitly accepts it as their preferred name.
      if (source !== 'onboarding') {
        useMorpheusCommandStore.getState().setInput(result.transcript);
        useMorpheusConversationStore.getState().setDraft(result.transcript);
      }
      set({
        phase: 'ready',
        transcript: result.transcript,
        error: null,
        errorKind: null,
        startedAt: null,
      });
      if (status?.settings.autoSubmitTranscript && source !== 'onboarding') {
        await routeVoiceInput(result.transcript);
      }
    } catch (error) {
      if (generation === operationGeneration) fail(error);
    } finally {
      ambientCapture?.setSuppressed(false);
    }
  };

  const stopAmbientLocal = (): void => {
    ambientGeneration += 1;
    endFollowUp();
    ambientCapture?.stop();
    ambientCapture = null;
    ambientStarting = null;
  };

  const startAmbientCapture = async (status: MorpheusVoiceStatus): Promise<void> => {
    if (ambientCapture || ambientStarting || !status.settings.ambientEnabled) return;
    const sessionGeneration = ++ambientGeneration;
    let capturedFollowUp = false;
    ambientStarting = (async () => {
      const presence = await hostApi.morpheus.beginAmbientVoice();
      if (sessionGeneration !== ambientGeneration) return;
      set({ presence, error: null, errorKind: null });
      const controller = new MorpheusAmbientVoiceCapture({
        inputDeviceId: status.settings.inputDeviceId,
        silenceMs: status.settings.ambientSilenceMs,
        maxUtteranceMs: status.settings.ambientMaxUtteranceMs,
        shouldCapture: () => {
          const presenceState = get().presence?.state;
          if (presenceState && !['armed', 'listening'].includes(presenceState)) return false;
          return !status.settings.localWakeEnabled || (get().followUpUntil ?? 0) > Date.now();
        },
        async onCaptureStarted() {
          capturedFollowUp = (get().followUpUntil ?? 0) > Date.now();
          const next = await hostApi.morpheus.setAmbientVoiceListening({ listening: true });
          set({ presence: next });
        },
        async onCaptureEnded() {
          const next = await hostApi.morpheus.setAmbientVoiceListening({ listening: false });
          set({ presence: next });
        },
        onBargeIn() {
          if (status.settings.bargeIn) stopMorpheusSpeech();
        },
        async onUtterance(blob, mimeType, durationMs) {
          const inputGeneration = operationGeneration;
          const payload = status.captureFormat === 'pcm16-wav' ? await morpheusManagedRecording(blob) : {
            audioBase64: await morpheusBlobToBase64(blob), mimeType, durationMs,
          };
          if (sessionGeneration !== ambientGeneration || inputGeneration !== operationGeneration) return;
          const result = await hostApi.morpheus.transcribeAmbientAudio(payload);
          if (sessionGeneration !== ambientGeneration || inputGeneration !== operationGeneration) return;
          const address = capturedFollowUp && result.transcript.trim()
            ? { kind: 'command' as const, text: result.transcript.trim() }
            : dialogue.accept(result.transcript, status.settings.wakePhrase, Date.now());
          capturedFollowUp = false;
          if (address.kind === 'wake') { acknowledgeWake(); return; }
          const objective = address.kind === 'command' ? address.text : null;
          endFollowUp();
          set({
            lastAmbientHeardAt: Date.now(),
            transcript: objective,
            source: objective ? 'ambient' : null,
            error: null,
            errorKind: null,
          });
          if (!objective) return;
          useMorpheusCommandStore.getState().setInput(objective);
          useMorpheusConversationStore.getState().setDraft(objective);
          if (status.settings.autoSubmitTranscript) {
            await routeVoiceInput(objective);
          }
        },
        onError(error) {
          if (sessionGeneration !== ambientGeneration) return;
          ambientAutoStartBlocked = true;
          stopAmbientLocal();
          void hostApi.morpheus.endAmbientVoice().catch(() => undefined);
          set({ phase: 'error', error: error.message, errorKind: classifyMorpheusVoiceError(error) });
        },
      });
      await controller.start();
      if (sessionGeneration !== ambientGeneration) { controller.stop(); return; }
      ambientCapture = controller;
    })();
    try {
      await ambientStarting;
    } catch (error) {
      if (sessionGeneration !== ambientGeneration) return;
      ambientAutoStartBlocked = true;
      stopAmbientLocal();
      await hostApi.morpheus.endAmbientVoice().catch(() => undefined);
      set({
        phase: 'error',
        error: error instanceof Error ? error.message : String(error),
        errorKind: classifyMorpheusVoiceError(error),
      });
      throw error;
    } finally {
      if (sessionGeneration === ambientGeneration) ambientStarting = null;
    }
  };

  return {
    phase: 'idle',
    status: null,
    presence: null,
    transcript: null,
    error: null,
    errorKind: null,
    lastAmbientHeardAt: null,
    source: null,
    startedAt: null,
    followUpUntil: null,
    endFollowUp,

    async continueAfterResponse() {
      const state = get();
      const settings = state.status?.settings;
      if (!settings?.handsFreeFollowUp || !state.source || state.source === 'onboarding') return;
      if (state.source === 'ambient') {
        const mainUntil = state.presence?.followUpUntil
          ? Date.parse(state.presence.followUpUntil)
          : Number.NaN;
        if (Number.isFinite(mainUntil) && mainUntil > Date.now()) setFollowUpWindow(mainUntil);
        return;
      }
      if (explicitConversationTurns >= MORPHEUS_VOICE_CONVERSATION_MAX_TURNS) {
        endFollowUp();
        return;
      }
      explicitConversationTurns += 1;
      const source = state.source;
      const until = Date.now() + MORPHEUS_VOICE_FOLLOW_UP_MS;
      dialogue.open(Date.now());
      setFollowUpWindow(until);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 320));
      if ((get().followUpUntil ?? 0) !== until) return;
      await get().startListening(source);
    },

    async loadStatus() {
      const generation = operationGeneration;
      try {
        const previousStatus = get().status;
        const status = await hostApi.morpheus.voiceStatus();
        if (generation !== operationGeneration) return get().status;
        if (status.transcriptionAvailable && previousStatus?.transcriptionAvailable !== true) {
          ambientAutoStartBlocked = false;
        }
        set({ status, presence: status.presence, error: null, errorKind: null });
        return status;
      } catch (error) {
        if (generation !== operationGeneration) return get().status;
        set({
          status: null,
          error: error instanceof Error ? error.message : String(error),
          errorKind: classifyMorpheusVoiceError(error),
        });
        return null;
      }
    },

    subscribePresence() {
      return hostEvents.onMorpheusVoicePresence((presence) => {
        const previousAuthority = get().presence?.authorityRevision ?? 0;
        if ((presence.authorityRevision ?? 0) !== previousAuthority) {
          get().cancel();
          stopAmbientLocal();
          ambientAutoStartBlocked = true;
          set({ status: null, presence });
          void get().loadStatus();
          return;
        }
        const previousWake = get().presence?.wakeSequence ?? 0;
        set((state) => ({
          presence,
          status: state.status ? { ...state.status, presence } : state.status,
        }));
        const status = get().status;
        if (presence.followUpUntil) {
          const until = Date.parse(presence.followUpUntil);
          if (Number.isFinite(until) && until > Date.now() && until !== get().followUpUntil) {
            setFollowUpWindow(until);
          }
        } else if (get().followUpUntil && get().source === 'ambient'
          && presence.state !== 'listening' && presence.state !== 'transcribing') {
          window.clearTimeout(followUpTimer);
          set({ followUpUntil: null });
        }
        if (status?.settings.localWakeEnabled && presence.ambientEnabled
          && presence.state === 'understanding' && presence.wakeCommand
          && (presence.wakeSequence ?? 0) > previousWake) {
          stopMorpheusSpeech();
          endFollowUp();
          const command = presence.wakeCommand;
          set({ phase: 'ready', source: 'ambient', transcript: command, error: null, errorKind: null,
            lastAmbientHeardAt: Date.now() });
          useMorpheusCommandStore.getState().setInput(command);
          useMorpheusConversationStore.getState().setDraft(command);
          if (status.settings.autoSubmitTranscript) void routeVoiceInput(command).catch(fail);
        }
        if (status?.settings.localWakeEnabled && presence.ambientEnabled
          && presence.state === 'armed' && (presence.wakeSequence ?? 0) > previousWake) acknowledgeWake(presence);
        if (presence.ambientEnabled
          && presence.state !== 'error'
          && presence.state !== 'asleep'
          && status?.transcriptionAvailable
          && !ambientAutoStartBlocked
          && !ambientCapture
          && !ambientStarting) {
          void get().ensureAmbient().catch(() => undefined);
        } else if (!presence.ambientEnabled || presence.state === 'asleep' || presence.state === 'error') {
          stopAmbientLocal();
        }
      });
    },

    async updateSettings(patch) {
      try {
        const status = await hostApi.morpheus.updateVoiceSettings(patch);
        stopAmbientLocal(); // closures must not retain an old wake phrase/provider
        ambientAutoStartBlocked = false;
        set({ status, presence: status.presence, error: null, errorKind: null });
        if (status.settings.ambientEnabled) await startAmbientCapture(status);
        else stopAmbientLocal();
      } catch (error) {
        fail(error);
        // Native startup may fail after settings were atomically saved. Reflect
        // the real Main choice without clearing the actionable failure.
        try {
          const status = await hostApi.morpheus.voiceStatus();
          set({ status, presence: status.presence });
        } catch { /* Retain the original failure when Main itself is unavailable. */ }
      }
    },

    async ensureAmbient() {
      const status = get().status ?? await get().loadStatus();
      if (!status?.settings.ambientEnabled || !status.transcriptionAvailable || ambientAutoStartBlocked) return;
      await startAmbientCapture(status);
    },

    async stopAmbient() {
      ambientAutoStartBlocked = true;
      stopAmbientLocal();
      try {
        const presence = await hostApi.morpheus.endAmbientVoice();
        set({ presence });
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : String(error),
          errorKind: classifyMorpheusVoiceError(error),
        });
      }
    },

    async startListening(source = 'command-center') {
      if (!['idle', 'ready', 'error'].includes(get().phase)) return;
      // Explicit push-to-talk interrupts output before opening the microphone.
      stopMorpheusSpeech();
      const continuing = (get().followUpUntil ?? 0) > Date.now();
      stopMorpheusWakeCue();
      window.clearTimeout(followUpTimer);
      set({ followUpUntil: null });
      if (!continuing) {
        dialogue.reset();
        explicitConversationTurns = source === 'ambient' || source === 'onboarding' ? 0 : 1;
      }
      const generation = operationGeneration += 1;
      discardRecording = false;
      releaseRecording();
      ambientCapture?.setSuppressed(true);
      set({ phase: 'requesting', source, transcript: null, error: null, errorKind: null, startedAt: null });
      try {
        const status = await hostApi.morpheus.voiceStatus();
        if (generation !== operationGeneration) return;
        set({ status });
        if (!status.settings.enabled || !status.transcriptionAvailable) {
          throw new Error(status.reason ?? 'Voice transcription is not configured.');
        }
        const mimeType = supportedMimeType();
        if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
          throw new Error('Voice recording is not supported on this system.');
        }
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...(status.settings.inputDeviceId ? { deviceId: { exact: status.settings.inputDeviceId } } : {}),
            channelCount: 1,
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
          },
          video: false,
        });
        if (generation !== operationGeneration) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = mediaStream;
        stopMeter = meterMorpheusMicrophone(mediaStream, {
          autoStop: source !== 'onboarding',
          silenceMs: 900,
          noSpeechMs: 10_000,
          onSpeechEnd: () => {
            if (generation === operationGeneration) get().stopListening();
          },
          onNoSpeech: () => {
            if (generation === operationGeneration) fail(new Error("I couldn't hear anything clearly. Please try again."));
          },
        });
        const startedAt = Date.now();
        const nextRecorder = new MediaRecorder(mediaStream, { mimeType });
        recorder = nextRecorder;
        nextRecorder.ondataavailable = (event) => {
          if (event.data.size === 0 || generation !== operationGeneration) return;
          chunkBytes += event.data.size;
          if (chunkBytes > MORPHEUS_VOICE_MAX_AUDIO_BYTES) {
            fail(new Error('The voice recording exceeded the safe size limit.'));
            return;
          }
          chunks.push(event.data);
        };
        nextRecorder.onerror = () => fail(new Error('Microphone recording failed.'));
        nextRecorder.onstop = () => {
          void finishRecording(generation, mimeType, startedAt);
        };
        nextRecorder.start(250);
        durationTimer = window.setTimeout(() => get().stopListening(), MORPHEUS_VOICE_MAX_DURATION_MS);
        set({ phase: 'listening', startedAt });
      } catch (error) {
        if (generation === operationGeneration) fail(error);
      }
    },

    stopListening() {
      if (get().phase !== 'listening' || recorder?.state !== 'recording') return;
      clearDurationTimer();
      set({ phase: 'transcribing', startedAt: null });
      recorder.stop();
    },

    cancel() {
      endFollowUp();
      operationGeneration += 1;
      discardRecording = true;
      try {
        if (recorder?.state === 'recording') recorder.stop();
      } catch {
        // Cleanup does not depend on MediaRecorder accepting stop twice.
      }
      releaseRecording();
      ambientCapture?.setSuppressed(false);
      stopMorpheusSpeech();
      set({ phase: 'idle', transcript: null, error: null, errorKind: null, source: null, startedAt: null });
    },

    dismiss() {
      if (get().phase === 'listening' || get().phase === 'transcribing') return;
      set({ phase: 'idle', transcript: null, error: null, errorKind: null, source: null, startedAt: null });
    },
  };
});
