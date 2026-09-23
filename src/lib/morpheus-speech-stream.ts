import { hostEvents } from './host-events';
import { MORPHEUS_SPEECH_MAX_AUDIO_BYTES } from '@shared/morpheus/voice-types';

/** One ephemeral MP3 stream. No URL from Main, persistent cache or audio log. */
export function createMorpheusSpeechStream(streamId: string, onError: (error: Error) => void) {
  const media = new MediaSource();
  const url = URL.createObjectURL(media);
  const queue: Uint8Array<ArrayBuffer>[] = [];
  let buffer: SourceBuffer | undefined;
  let ended = false;
  let disposed = false;
  let received = 0;
  let sequence = 0;
  const pump = () => {
    if (disposed || !buffer || buffer.updating || media.readyState !== 'open') return;
    try {
      const next = queue.shift();
      if (next) buffer.appendBuffer(next);
      else if (ended) media.endOfStream();
    } catch { onError(new Error('Streaming audio could not be decoded.')); }
  };
  const opened = () => {
    if (disposed) return;
    try {
      buffer = media.addSourceBuffer('audio/mpeg');
      buffer.addEventListener('updateend', pump);
      buffer.addEventListener('error', failed);
      pump();
    } catch { failed(); }
  };
  const failed = () => onError(new Error('Streaming audio playback failed.'));
  media.addEventListener('sourceopen', opened);
  const unsubscribe = hostEvents.onMorpheusSpeechChunk((chunk) => {
    if (disposed || chunk.streamId !== streamId) return;
    if (chunk.sequence !== sequence++ || chunk.audioBase64.length > 65536) { failed(); return; }
    try {
      const text = window.atob(chunk.audioBase64);
      received += text.length;
      if (received > MORPHEUS_SPEECH_MAX_AUDIO_BYTES) { failed(); return; }
      queue.push(Uint8Array.from(text, (char) => char.charCodeAt(0)));
      pump();
    } catch { failed(); }
  });
  return {
    url,
    finish(fallbackBase64: string) {
      // Older/in-process service compositions may not provide chunk events.
      if (!received) {
        const text = window.atob(fallbackBase64);
        if (text.length > MORPHEUS_SPEECH_MAX_AUDIO_BYTES) { failed(); return; }
        queue.push(Uint8Array.from(text, (char) => char.charCodeAt(0)));
      }
      ended = true;
      pump();
    },
    dispose() {
      disposed = true;
      unsubscribe();
      queue.length = 0;
      media.removeEventListener('sourceopen', opened);
      buffer?.removeEventListener('updateend', pump);
      buffer?.removeEventListener('error', failed);
      URL.revokeObjectURL(url);
    },
  };
}
