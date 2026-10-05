/* Included offline recognition. Fixed model/config, one admitted canonical WAV
 * in volatile memory; no files, network, transcript logs or inherited secrets. */
'use strict';
const { join } = require('node:path');
const threads = Number(process.argv[2]);
const session = process.argv[3];
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const MAX_BYTES = 44 + 120000 * 32;
if (!process.send || process.argv.length !== 4 || !Number.isInteger(threads) || threads !== 4 || !ID.test(session)) process.exit(1);
const { OfflineRecognizer } = require('./node_modules/sherpa-onnx-node/non-streaming-asr.js');
const addon = require('./node_modules/sherpa-onnx-node/addon.js');
const send = message => { if (process.connected) process.send({ ...message, protocol: 1, session }, error => { if (error) process.exit(1); }); };
const fail = id => { send({ type: 'failed', ...(id ? { id } : {}) }); process.exitCode = 1; process.disconnect(); };
process.on('disconnect', () => process.exit(process.exitCode || 0));
let busy = false;
const root = join(__dirname, '..', 'whisper');
const engine = addon.version === '1.13.8' ? OfflineRecognizer.createAsync({
  featConfig: { sampleRate: 16000, featureDim: 80 },
  modelConfig: { whisper: { encoder: join(root, 'tiny.en-encoder.int8.onnx'), decoder: join(root, 'tiny.en-decoder.int8.onnx'),
    language: 'en', task: 'transcribe', tailPaddings: 1000 }, tokens: join(root, 'tiny.en-tokens.txt'), numThreads: 4, provider: 'cpu', debug: false },
  decodingMethod: 'greedy_search',
}) : Promise.reject(new Error('Pinned engine mismatch'));
engine.then(() => send({ type: 'ready', engine: 'sherpa-onnx-1.13.8', sampleRate: 16000 })).catch(() => fail());
process.on('message', async request => {
  if (!request || typeof request !== 'object' || Array.isArray(request) || request.type !== 'transcribe' || request.protocol !== 1
    || request.session !== session || typeof request.id !== 'string' || !ID.test(request.id) || busy
    || Object.keys(request).length !== 5 || Object.keys(request).some(key => !['type', 'protocol', 'session', 'id', 'audio'].includes(key))
    || typeof request.audio !== 'string' || !request.audio.length || request.audio.length > Math.ceil(MAX_BYTES / 3) * 4
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(request.audio)) { fail(); return; }
  busy = true;
  let audio;
  let samples;
  try {
    audio = Buffer.from(request.audio, 'base64');
    if (audio.toString('base64') !== request.audio) throw new Error('Invalid encoding');
    request.audio = '';
    if (audio.length < 44 || audio.length > MAX_BYTES || audio.toString('ascii', 0, 4) !== 'RIFF'
      || audio.readUInt32LE(4) !== audio.length - 8 || audio.toString('ascii', 8, 16) !== 'WAVEfmt '
      || audio.readUInt32LE(16) !== 16 || audio.readUInt16LE(20) !== 1 || audio.readUInt16LE(22) !== 1
      || audio.readUInt32LE(24) !== 16000 || audio.readUInt32LE(28) !== 32000 || audio.readUInt16LE(32) !== 2
      || audio.readUInt16LE(34) !== 16 || audio.toString('ascii', 36, 40) !== 'data'
      || audio.readUInt32LE(40) !== audio.length - 44 || (audio.length - 44) % 2 !== 0) throw new Error('Invalid recording');
    samples = new Float32Array((audio.length - 44) / 2);
    for (let i = 0; i < samples.length; i++) samples[i] = audio.readInt16LE(44 + i * 2) / 32768;
    audio.fill(0);
    const recognizer = await engine;
    const stream = recognizer.createStream();
    stream.acceptWaveform({ sampleRate: 16000, samples });
    const result = await recognizer.decodeAsync(stream);
    if (typeof result.text !== 'string' || result.text.length > 12000) throw new Error('Invalid result');
    send({ type: 'result', id: request.id, text: result.text });
  } catch { fail(request.id); }
  finally { audio?.fill(0); samples?.fill(0); busy = false; }
});
