/** Main-owned rejection of empty recordings and known decoder annotations. */
export class MorpheusNoSpeechError extends Error {
  constructor() {
    // The renderer maps "no speech" to its localized, retryable input recovery.
    super('No speech was detected. Check your microphone and try speaking again.');
    this.name = 'MorpheusNoSpeechError';
  }
}

/**
 * Check the canonical WAV produced by the existing capture converter. Renderer
 * endpointing already uses sustained RMS with an adaptive noise floor; this is
 * a deliberately much lower Main-side floor for manually stopped recordings.
 * It rejects near-silence/DC/isolated clicks, not arbitrary background noise.
 * Three 20 ms frames preserve short and quiet answers without asserting that
 * energy alone proves speech. Decoder annotations are checked independently.
 */
export function validateMorpheusLocalRecording(audio: Buffer): void {
  if (audio.length < 44 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE'
    || audio.readUInt32LE(4) !== audio.length - 8 || audio.toString('ascii', 12, 16) !== 'fmt '
    || audio.readUInt32LE(16) !== 16 || audio.readUInt16LE(20) !== 1 || audio.readUInt16LE(22) !== 1
    || audio.readUInt32LE(24) !== 16000 || audio.readUInt32LE(28) !== 32000
    || audio.readUInt16LE(32) !== 2 || audio.readUInt16LE(34) !== 16
    || audio.toString('ascii', 36, 40) !== 'data' || audio.readUInt32LE(40) !== audio.length - 44
    || (audio.length - 44) % 2 !== 0) {
    throw new Error('Local voice needs a valid mono 16 kHz recording. Retry the microphone test.');
  }
  const frameSamples = 320;
  let activeFrames = 0;
  for (let offset = 44; offset + frameSamples * 2 <= audio.length; offset += frameSamples * 2) {
    let sum = 0;
    let squareSum = 0;
    for (let i = 0; i < frameSamples; i++) {
      const sample = audio.readInt16LE(offset + i * 2) / 32768;
      sum += sample;
      squareSum += sample * sample;
    }
    // Remove DC bias: a disconnected/stuck input can have nonzero amplitude.
    const variance = Math.max(0, squareSum / frameSamples - (sum / frameSamples) ** 2);
    activeFrames = variance > 0.001 ** 2 ? activeFrames + 1 : 0;
    if (activeFrames >= 3) return;
  }
  throw new MorpheusNoSpeechError();
}

const ANNOTATION = /^(?:blank[ _-]audio|no[ _-]speech|silence|silent|inaudible|unintelligible|music(?: playing)?|background (?:music|noise)|noise|static|wind(?: blowing| howling)?|applause|laughter|laughing|breathing|coughing|sighing)$/i;

/**
 * Reject only an entire annotation-only result. Never remove bracketed portions
 * from ordinary prose or rewrite a command. The missing closing delimiter in
 * "[BLANK_AUDIO" is a real decoder output seen in the rejected application.
 */
export function validateMorpheusLocalTranscript(value: string): string {
  const transcript = value.trim();
  let remaining = transcript;
  let annotations = 0;
  while (remaining) {
    const marker = remaining.match(/^(?:\[([^\]()[\n]*)(?:\]|$)|\(([^\]()[\n]*)(?:\)|$)|<\|(?:nospeech|endoftext)\|>)/i);
    if (!marker || ((marker[1] !== undefined || marker[2] !== undefined)
      && !ANNOTATION.test((marker[1] ?? marker[2]).trim()))) break;
    annotations++;
    remaining = remaining.slice(marker[0].length).replace(/^[\s.,!?:;\-–—♪♫]+/, '');
  }
  if (!transcript || (annotations > 0 && !remaining) || /^[♪♫\s]+$/.test(transcript)) {
    throw new MorpheusNoSpeechError();
  }
  return transcript;
}
