/* Included offline speech worker. Fixed model, no files containing user text/audio.
 * The native engine stays outside Electron and is released when IPC closes.
 */
'use strict';
const { join } = require('node:path');
const { OfflineTts } = require('./node_modules/sherpa-onnx-node');
const MAX_BYTES = 8 * 1024 * 1024;
const root = join(__dirname, '..', 'kokoro');
const threads = Number(process.argv[2]);
if (!process.send || !Number.isInteger(threads) || threads < 1 || threads > 4) process.exit(1);
const send = (message) => {
  if (!process.connected) return;
  process.send(message, (error) => { if (error) process.exit(1); });
};
process.on('disconnect', () => process.exit(0));
let busy = false;
const engine = OfflineTts.createAsync({
  model: {
    kokoro: {
      model: join(root, 'model.int8.onnx'), voices: join(root, 'voices.bin'),
      tokens: join(root, 'tokens.txt'), dataDir: join(root, 'espeak-ng-data'),
      lexicon: join(root, 'lexicon-us-en.txt'),
    },
    numThreads: threads, debug: false, provider: 'cpu',
  },
  maxNumSentences: 1,
});
engine.then((tts) => {
  if (tts.sampleRate !== 24000) throw new Error('Unsupported sample rate');
  send({ type: 'ready', protocol: 1, sampleRate: tts.sampleRate });
}).catch(() => { send({ type: 'failed' }); process.exitCode = 1; process.disconnect(); });
process.on('message', async (request) => {
  if (!request || request.type !== 'synthesize' || typeof request.id !== 'string'
    || request.id.length > 64 || typeof request.text !== 'string' || !request.text.trim()
    || request.text.length > 4000 || !['cedar', 'coral'].includes(request.voice)
    || Object.keys(request).some(key => !['type', 'id', 'text', 'voice'].includes(key)) || busy) {
    send({ type: 'failed' }); process.exitCode = 1; process.disconnect(); return;
  }
  busy = true;
  let bytes = 0, chunks = 0;
  try {
    const tts = await engine;
    await tts.generateAsync({
      text: request.text, sid: request.voice === 'coral' ? 3 : 16, speed: 1,
      onProgress: ({ samples }) => {
        if (!process.connected || !(samples instanceof Float32Array)) return false;
        bytes += samples.length * 2;
        if (!samples.length || bytes > MAX_BYTES) return false;
        const pcm = Buffer.allocUnsafe(samples.length * 2);
        for (let i = 0; i < samples.length; i++) {
          if (!Number.isFinite(samples[i])) throw new Error('Invalid audio');
          pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), i * 2);
        }
        for (let offset = 0; offset < pcm.length; offset += 48 * 1024) {
          send({ type: 'pcm', id: request.id, sequence: chunks++, audio: pcm.subarray(offset, offset + 48 * 1024).toString('base64') });
        }
        return true;
      },
    });
    if (!bytes || bytes > MAX_BYTES) throw new Error('Audio limit');
    send({ type: 'done', id: request.id, bytes, chunks });
  } catch {
    // No user text, native diagnostics, paths or credentials cross this boundary.
    send({ type: 'failed', id: request.id });
  } finally { busy = false; }
});
