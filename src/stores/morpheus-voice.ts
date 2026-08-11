import { create } from 'zustand';

import { hostApi } from '@/lib/host-api';
import { useMorpheusCommandStore } from './morpheus-command';
import {
  MORPHEUS_VOICE_MAX_AUDIO_BYTES,
  MORPHEUS_VOICE_MAX_DURATION_MS,
  MORPHEUS_VOICE_MIME_TYPES,
  type MorpheusVoiceMimeType,
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

export type MorpheusVoiceSource = 'command-center' | 'quick-command' | 'global-shortcut';

export type MorpheusVoiceState = {
  phase: MorpheusVoicePhase;
  status: MorpheusVoiceStatus | null;
  transcript: string | null;
  error: string | null;
  source: MorpheusVoiceSource | null;
  startedAt: number | null;
  loadStatus: () => Promise<MorpheusVoiceStatus | null>;
  updateSettings: (patch: MorpheusVoiceSettingsPatch) => Promise<void>;
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
    }
  };

  return {
    phase: 'idle',
    status: null,
    transcript: null,
    error: null,
    source: null,
    startedAt: null,

    async loadStatus() {
      try {
        const status = await hostApi.morpheus.voiceStatus();
        set({ status, error: null });
        return status;
      } catch (error) {
        set({
          status: null,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      }
    },

    async updateSettings(patch) {
      try {
        const status = await hostApi.morpheus.updateVoiceSettings(patch);
        set({ status, error: null });
      } catch (error) {
        fail(error);
      }
    },

    async startListening(source = 'command-center') {
      if (!['idle', 'ready', 'error'].includes(get().phase)) return;
      const generation = operationGeneration += 1;
      discardRecording = false;
      releaseRecording();
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
      window.speechSynthesis?.cancel();
      set({ phase: 'idle', transcript: null, error: null, source: null, startedAt: null });
    },

    dismiss() {
      if (get().phase === 'listening' || get().phase === 'transcribing') return;
      set({ phase: 'idle', transcript: null, error: null, source: null, startedAt: null });
    },
  };
});
