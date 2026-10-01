import { MORPHEUS_VOICE_MAX_AUDIO_BYTES, MORPHEUS_VOICE_MAX_DURATION_MS, type MorpheusTranscribeAudioPayload } from '@shared/morpheus/voice-types';

/** Convert this capture owner's completed recording locally. No new mic, request,
 * persistent audio or guessed duration. Chromium resamples to the context rate. */
export async function morpheusManagedRecording(blob: Blob): Promise<MorpheusTranscribeAudioPayload> {
  if (!blob.size || blob.size > MORPHEUS_VOICE_MAX_AUDIO_BYTES) throw new Error('Voice recording exceeds its limit.');
  const context = new OfflineAudioContext(1, 1, 16_000);
  const audio = await context.decodeAudioData(await blob.arrayBuffer());
  if (!Number.isFinite(audio.duration) || audio.duration < 0.1 || audio.duration * 1000 > MORPHEUS_VOICE_MAX_DURATION_MS
    || audio.sampleRate !== 16_000 || audio.numberOfChannels < 1 || audio.numberOfChannels > 2
    || audio.length > 16_000 * 120) throw new Error('Voice recording has an invalid duration or format.');
  const buffer = new ArrayBuffer(44 + audio.length * 2);
  const bytes = new Uint8Array(buffer); const view = new DataView(buffer);
  for (const [offset, value] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']] as const) bytes.set(new TextEncoder().encode(value), offset);
  view.setUint32(4, buffer.byteLength - 8, true); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16_000, true);
  view.setUint32(28, 32_000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); view.setUint32(40, audio.length * 2, true);
  const channels = Array.from({ length: audio.numberOfChannels }, (_, channel) => audio.getChannelData(channel));
  for (let index = 0; index < audio.length; index++) {
    const sample = channels.reduce((sum, channel) => sum + channel[index], 0) / channels.length;
    if (!Number.isFinite(sample)) throw new Error('Invalid audio samples.');
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, Math.round(clamped * (clamped < 0 ? 32768 : 32767)), true);
  }
  // Chunked encoding avoids call-stack overflow for a two-minute recording.
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 16_384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16_384));
  return { audioBase64: btoa(binary), mimeType: 'audio/wav', durationMs: Math.round(audio.length / 16) };
}
