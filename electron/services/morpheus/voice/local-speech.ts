/** Short first phrase, then bounded natural sentence groups. No words are omitted. */
export function localSpeechSegments(text: string): string[] {
  let remaining = text.trim().replace(/\s+/g, ' ');
  const segments: string[] = [];
  while (remaining) {
    const limit = segments.length ? 160 : 64;
    if (remaining.length <= limit) { segments.push(remaining); break; }
    const prefix = remaining.slice(0, limit + 1);
    const boundaries = [...prefix.matchAll(/[.!?](?=\s)/g)];
    const sentence = segments.length ? boundaries.at(-1) : boundaries[0];
    const space = remaining.lastIndexOf(' ', limit);
    const end = sentence ? sentence.index! + 1 : space > 0 ? space : limit;
    segments.push(remaining.slice(0, end));
    remaining = remaining.slice(end).trimStart();
  }
  return segments;
}

/** The fixed Kokoro engine emits mono PCM16 at 24 kHz. Never relabel arbitrary WAV. */
export function localSpeechPcm(wav: Buffer): Buffer {
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF'
    || wav.readUInt32LE(4) !== wav.length - 8 || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Included voice returned invalid audio.');
  }
  let validFormat = false;
  let pcm: Buffer | undefined;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const size = wav.readUInt32LE(offset + 4), start = offset + 8, end = start + size;
    if (end > wav.length) throw new Error('Included voice returned incomplete audio.');
    const tag = wav.toString('ascii', offset, offset + 4);
    if (tag === 'fmt ') {
      validFormat = size >= 16 && wav.readUInt16LE(start) === 1 && wav.readUInt16LE(start + 2) === 1
        && wav.readUInt32LE(start + 4) === 24_000 && wav.readUInt32LE(start + 8) === 48_000
        && wav.readUInt16LE(start + 12) === 2 && wav.readUInt16LE(start + 14) === 16;
    }
    if (tag === 'data') pcm = wav.subarray(start, end);
    offset = end + size % 2;
  }
  if (!validFormat || !pcm?.length || pcm.length % 2) throw new Error('Included voice returned an unsupported audio format.');
  return pcm;
}

/** Canonical WAV for callers that request a whole local sample instead of PCM events. */
export function localSpeechWav(pcm: Buffer): Buffer {
  if (!pcm.length || pcm.length % 2) throw new Error('Included voice returned invalid audio.');
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(pcm.length + 36, 4);
  header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24_000, 24); header.writeUInt32LE(48_000, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
