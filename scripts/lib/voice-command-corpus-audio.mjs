import { readFile } from 'node:fs/promises';
import { Script, createContext } from 'node:vm';

/** Offline conversion through the actual fixed worklet; never opens a microphone. */
export async function createCorpusAudioConverter(workletPath) {
  const source = await readFile(workletPath, 'utf8');
  return wave => {
    if (!Buffer.isBuffer(wave) || wave.length < 44 || wave.length > 8 * 1024 * 1024
      || wave.toString('ascii', 0, 4) !== 'RIFF' || wave.toString('ascii', 8, 16) !== 'WAVEfmt '
      || wave.readUInt32LE(16) !== 16 || wave.readUInt16LE(20) !== 1 || wave.readUInt16LE(22) !== 1
      || wave.readUInt32LE(24) !== 24000 || wave.readUInt16LE(34) !== 16
      || wave.toString('ascii', 36, 40) !== 'data' || wave.readUInt32LE(40) !== wave.length - 44
      || (wave.length - 44) % 2) throw new Error('Expected bounded included-engine mono 24kHz PCM16 WAV.');
    const chunks = [];
    let Processor;
    const context = createContext({ sampleRate: 24000,
      AudioWorkletProcessor: class { constructor() { this.port = { postMessage: data => chunks.push(Buffer.from(data)) }; } },
      registerProcessor: (name, value) => { if (name !== 'morpheus-wake-audio') throw new Error('Unexpected processor'); Processor = value; } });
    new Script(source, { filename: workletPath }).runInContext(context, { timeout: 1000 });
    if (!Processor) throw new Error('Fixed worklet did not register.');
    const processor = new Processor();
    const sampleCount = (wave.length - 44) / 2, padding = 14400; // 600ms each side, declared in evidence.
    const length = Math.ceil((sampleCount + padding * 2) / 4800) * 4800;
    for (let start = 0; start < length; start += 128) {
      const block = new Float32Array(Math.min(128, length - start));
      for (let index = 0; index < block.length; index++) {
        const sample = start + index - padding;
        if (sample >= 0 && sample < sampleCount) block[index] = wave.readInt16LE(44 + sample * 2) / 32768;
      }
      processor.process([[block]]);
    }
    const pcm = Buffer.concat(chunks), header = Buffer.alloc(44);
    if (pcm.length !== length / 24000 * 16000 * 2) throw new Error('Worklet did not deliver all complete PCM frames.');
    header.write('RIFF'); header.writeUInt32LE(pcm.length + 36, 4); header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(16000, 24);
    header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
    return Buffer.concat([header, pcm]);
  };
}
