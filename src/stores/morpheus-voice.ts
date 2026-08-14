import { create } from 'zustand';

import { hostApi } from '@/lib/host-api';
import { hostEvents } from '@/lib/host-events';
import {
  extractMorpheusWakeObjective,
  morpheusBlobToBase64,
  MorpheusAmbientVoiceCapture,
} from '@/lib/morpheus-ambient-voice';
import { useMorpheusCommandStore } from './morpheus-command';
import {
  MORPHEUS_VOICE_MAX_AUDIO_BYTES,
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

export type MorpheusVoiceSource = 'command-center' | 'quick-command' | 'global-shortcut' | 'ambient';

export type MorpheusVoiceState = {
  phase: MorpheusVoicePhase;
  status: MorpheusVoiceStatus | null;
  presence: MorpheusVoicePresence | null;
  transcript: string | null;
  error: string | null;
  lastAmbientHeardAt: number | null;
  source: MorpheusVoiceSource | null;
  startedAt: number | null;
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

function clearDurationTimer(): void {
  if (durationTimer !== null) window.clearTimeout(durationTimer);
  durationTimer = null;
}

function stopStream(): void {
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

export const useMorpheusVoiceStore = create<MorpheusVoiceState>((set, get) => {
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
      const result = await hostApi.morpheus.transcribeAudio({
        audioBase64: await blobToBase64(blob),
        mimeType,
        durationMs,
      });
      if (generation !== operationGeneration) return;
      const status = get().status;
      useMorpheusCommandStore.getState().setInput(result.transcript);
      set({
        phase: 'ready',
        transcript: result.transcript,
        error: null,
        startedAt: null,
      });
      if (status?.settings.autoSubmitTranscript) {
        await useMorpheusCommandStore.getState().runObjective(result.transcript, 'voice');
      }
    } catch (error) {
      if (generation === operationGeneration) fail(error);
    } finally {
      ambientCapture?.setSuppressed(false);
    }
  };

  const stopAmbientLocal = (): void => {
    ambientCapture?.stop();
    ambientCapture = null;
    ambientStarting = null;
  };

  const startAmbientCapture = async (status: MorpheusVoiceStatus): Promise<void> => {
    if (ambientCapture || ambientStarting || !status.settings.ambientEnabled) return;
    ambientStarting = (async () => {
      const presence = await hostApi.morpheus.beginAmbientVoice();
      set({ presence, error: null });
      const controller = new MorpheusAmbientVoiceCapture({
        silenceMs: status.settings.ambientSilenceMs,
        maxUtteranceMs: status.settings.ambientMaxUtteranceMs,
        onCaptureStarted() {
          void hostApi.morpheus.setAmbientVoiceListening({ listening: true })
            .then((next) => set({ presence: next }))
            .catch((error) => set({ error: error instanceof Error ? error.message : String(error) }));
        },
        onBargeIn() {
          if (status.settings.bargeIn) window.speechSynthesis?.cancel();
        },
        async onUtterance(blob, mimeType, durationMs) {
          const ended = await hostApi.morpheus.setAmbientVoiceListening({ listening: false });
          set({ presence: ended });
          const result = await hostApi.morpheus.transcribeAmbientAudio({
            audioBase64: await morpheusBlobToBase64(blob), mimeType, durationMs,
          });
          const objective = extractMorpheusWakeObjective(result.transcript, status.settings.wakePhrase);
          set({
            lastAmbientHeardAt: Date.now(),
            transcript: objective,
            source: objective ? 'ambient' : null,
            error: null,
          });
          if (!objective) return;
          useMorpheusCommandStore.getState().setInput(objective);
          if (status.settings.autoSubmitTranscript) {
            await useMorpheusCommandStore.getState().runObjective(objective, 'voice');
          }
        },
        onError(error) {
          set({ error: error.message });
        },
      });
      await controller.start();
      ambientCapture = controller;
    })();
    try {
      await ambientStarting;
    } catch (error) {
      stopAmbientLocal();
      await hostApi.morpheus.endAmbientVoice().catch(() => undefined);
      set({ error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      ambientStarting = null;
    }
  };

  return {
    phase: 'idle',
    status: null,
    presence: null,
    transcript: null,
    error: null,
    lastAmbientHeardAt: null,
    source: null,
    startedAt: null,

    async loadStatus() {
      try {
        const status = await hostApi.morpheus.voiceStatus();
        set({ status, presence: status.presence, error: null });
        return status;
      } catch (error) {
        set({
          status: null,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    },

    subscribePresence() {
      return hostEvents.onMorpheusVoicePresence((presence) => {
        set((state) => ({
          presence,
          status: state.status ? { ...state.status, presence } : state.status,
        }));
        if (presence.ambientEnabled && !ambientCapture && !ambientStarting) {
          void get().ensureAmbient();
        } else if (!presence.ambientEnabled) stopAmbientLocal();
      });
    },

    async updateSettings(patch) {
      try {
        const status = await hostApi.morpheus.updateVoiceSettings(patch);
        set({ status, presence: status.presence, error: null });
        if (status.settings.ambientEnabled) await startAmbientCapture(status);
        else stopAmbientLocal();
      } catch (error) {
        fail(error);
      }
    },

    async ensureAmbient() {
      const status = get().status ?? await get().loadStatus();
      if (!status?.settings.ambientEnabled) return;
      await startAmbientCapture(status);
    },

    async stopAmbient() {
      stopAmbientLocal();
      try {
        const presence = await hostApi.morpheus.endAmbientVoice();
        set({ presence });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) });
      }
    },

    async startListening(source = 'command-center') {
      if (!['idle', 'ready', 'error'].includes(get().phase)) return;
      const generation = operationGeneration += 1;
      discardRecording = false;
      releaseRecording();
      ambientCapture?.setSuppressed(true);
      set({ phase: 'requesting', source, transcript: null, error: null, startedAt: null });
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
            channelCount: 1,
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
      operationGeneration += 1;
      discardRecording = true;
      try {
        if (recorder?.state === 'recording') recorder.stop();
      } catch {
        // Cleanup does not depend on MediaRecorder accepting stop twice.
      }
      releaseRecording();
      ambientCapture?.setSuppressed(false);
      window.speechSynthesis?.cancel();
      set({ phase: 'idle', transcript: null, error: null, source: null, startedAt: null });
    },

    dismiss() {
      if (get().phase === 'listening' || get().phase === 'transcribing') return;
      set({ phase: 'idle', transcript: null, error: null, source: null, startedAt: null });
    },
  };
});
