// Generate real voice auditions directly with an identified packaged Node/worker/model.
// Does not start Morpheus, use its profile, record a mic, or capture physical speakers.
// node scripts/export-packaged-local-voice.mjs <win-unpacked> <new-output-directory>
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
if (!process.argv[2] || !process.argv[3]) throw new Error('Supply packaged application and new output directories.');
const appRoot = resolve(process.argv[2]), output = resolve(process.argv[3]);
const voiceRoot = join(appRoot, 'resources', 'resources', 'local-voice');
const node = join(appRoot, 'resources', 'bin', 'node.exe');
const script = join(voiceRoot, 'worker', 'morpheus-tts-worker.cjs');
const digest = async path => { const hash = createHash('sha256'); for await (const part of createReadStream(path)) hash.update(part); return hash.digest('hex'); };
const identity = {};
for (const [name, path] of Object.entries({ executable: join(appRoot, 'Morpheus.exe'), appAsar: join(appRoot, 'resources', 'app.asar'), node, worker: script,
  model: join(voiceRoot, 'kokoro', 'model.int8.onnx'), voices: join(voiceRoot, 'kokoro', 'voices.bin'),
  binding: join(voiceRoot, 'worker', 'node_modules', 'sherpa-onnx-win-x64', 'sherpa-onnx.node'),
  runtime: join(voiceRoot, 'worker', 'node_modules', 'sherpa-onnx-win-x64', 'onnxruntime.dll') })) identity[name] = { path, sha256: await digest(path) };
await mkdir(output, { recursive: false });
const manifest = JSON.parse(await readFile(join(voiceRoot, 'manifest.json'), 'utf8'));
const started = performance.now();
const worker = spawn(node, [script, '4'], { windowsHide: true, shell: false, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP } });
let active;
let resolveReady, rejectReady;
const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
void ready.catch(() => undefined);
const exited = new Promise(resolve => worker.once('close', (code, signal) => resolve({ code, signal })));
const fail = error => { rejectReady(error); active?.reject(error); };
worker.on('error', fail);
worker.on('exit', () => fail(new Error('Packaged voice worker exited before its reply completed.')));
worker.on('message', message => {
  if (message?.type === 'ready' && message.protocol === 1 && message.sampleRate === 24000) { resolveReady(); return; }
  if (!active || message?.id !== active.id) { fail(new Error('Unexpected packaged voice protocol message')); return; }
  if (message.type === 'pcm' && message.sequence === active.parts.length && typeof message.audio === 'string' && message.audio.length <= 65536) {
    const pcm = Buffer.from(message.audio, 'base64');
    if (!pcm.length || pcm.length % 2 || active.bytes + pcm.length > 8 * 1024 * 1024) { fail(new Error('Invalid packaged audio')); return; }
    active.parts.push(pcm); active.bytes += pcm.length; active.events.push({ atMs: performance.now() - active.started, bytes: pcm.length });
  } else if (message.type === 'done' && message.chunks === active.parts.length && message.bytes === active.bytes && active.bytes) {
    const finished = active; active = undefined; finished.resolve(finished);
  } else fail(new Error('Packaged speech generation failed'));
});
const timeout = setTimeout(() => { fail(new Error('Packaged speech export timed out')); worker.kill(); }, 90_000);
const wav = pcm => {
  const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(pcm.length + 36, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(24000, 24); header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40); return Buffer.concat([header, pcm]);
};
const evidence = { at: new Date().toISOString(), scope: 'Actual identified packaged voice engines. WAV auditions contain generated PCM without delivery waits; no microphone, physical speaker, app UI or 450ms renderer buffer measurement is claimed.', identity, manifest, samples: [] };
try {
  await ready; evidence.workerReadyMs = performance.now() - started;
  const text = "Hey. I'm Morpheus. What are we getting done today? A little focus, a little mischief. Your move.";
  for (const [name, voice] of [['Michael', 'cedar'], ['Heart', 'coral']]) {
    const result = await new Promise((resolve, reject) => {
      active = { id: randomUUID(), parts: [], events: [], bytes: 0, started: performance.now(), resolve, reject };
      worker.send({ type: 'synthesize', id: active.id, voice, text }, error => { if (error) fail(error); });
    });
    const path = join(output, `${name}-packaged-neural-audition.wav`);
    await writeFile(path, wav(Buffer.concat(result.parts)));
    evidence.samples.push({ name, voice, text, path, sha256: await digest(path), firstPcmMs: result.events[0].atMs,
      generationMs: performance.now() - result.started, pcmBytes: result.bytes, audioSeconds: result.bytes / 48000, chunks: result.events });
    console.log(name, 'real PCM audition generated');
  }
} finally {
  clearTimeout(timeout); worker.kill(); evidence.workerExit = await exited;
  await writeFile(join(output, 'packaged-voice-auditions.json'), JSON.stringify(evidence, null, 2));
}
console.log('Packaged voice auditions saved:', output);
