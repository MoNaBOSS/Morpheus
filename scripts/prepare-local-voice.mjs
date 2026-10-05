import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';

const cache = resolve(process.env.MORPHEUS_VOICE_ASSET_CACHE || 'build/voice-assets');
const destination = resolve('build/local-voice');
const workerAssets = [
  ['sherpa-onnx-node', 'https://registry.npmjs.org/sherpa-onnx-node/-/sherpa-onnx-node-1.13.8.tgz', 'db2a7b8b18d950b6e9ca5c1c919afec33fd3dd2bfef1aade0bea5a9fe7a1f0f1'],
  ['sherpa-onnx-win-x64', 'https://registry.npmjs.org/sherpa-onnx-win-x64/-/sherpa-onnx-win-x64-1.13.8.tgz', 'fe522f02a5c113c2567a43982107ef41ae517f9a431931e90731e7e4d4341073'],
];
const assets = [
  ['engine-static.tar.bz2', 'https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.13.8/sherpa-onnx-v1.13.8-win-x64-static-MT-Release.tar.bz2', '849ea51f860cefbe0ae0074ed01190cd24b91ae3da80c2637261a9e7dabe39c9'],
  ['kokoro.tar.bz2', 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-int8-multi-lang-v1_0.tar.bz2', '4c3052abaa60943a341f193888cf6abd68787dae6ab8ae5c925a706caa247e4e'],
  ['whisper.tar.bz2', 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-tiny.en.tar.bz2', '2bd6cf965c8bb3e068ef9fa2191387ee63a9dfa2a4e37582a8109641c20005dd'],
];
await mkdir(cache, { recursive: true }); await mkdir(destination, { recursive: true });
const digest = async (path) => { const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk); return hash.digest('hex'); };
const download = async (url, path) => { const response = await fetch(url); if (!response.ok || !response.body) throw new Error(`Voice asset download failed: ${response.status}`); await pipeline(Readable.fromWeb(response.body), createWriteStream(path)); };
const extract = (path) => new Promise((done, fail) => { const child = spawn('tar', ['-xf', path, '-C', cache], { windowsHide: true, shell: false, stdio: 'inherit' }); child.on('error', fail); child.on('exit', (code) => code === 0 ? done() : fail(new Error('Voice extraction failed'))); });
for (const [name, url, expected] of assets) {
  const path = join(cache, name); if (!existsSync(path)) await download(url, path);
  if (await digest(path) !== expected) throw new Error(`Voice checksum mismatch: ${name}`);
  await extract(path);
}
const bin = join(destination, 'bin'); await mkdir(bin, { recursive: true });
for (const name of ['sherpa-onnx-offline.exe', 'sherpa-onnx-offline-tts.exe']) await cp(join(cache, 'sherpa-onnx-v1.13.8-win-x64-static-MT-Release', 'bin', name), join(bin, name));
const whisper = join(destination, 'whisper'); await mkdir(whisper, { recursive: true });
for (const name of ['tiny.en-encoder.int8.onnx', 'tiny.en-decoder.int8.onnx', 'tiny.en-tokens.txt']) await cp(join(cache, 'sherpa-onnx-whisper-tiny.en', name), join(whisper, name));
await cp(join(cache, 'kokoro-int8-multi-lang-v1_0'), join(destination, 'kokoro'), { recursive: true });
// Pin the two small upstream packages independently; never install optional floating dependencies.
const worker = join(destination, 'worker'); await mkdir(worker, { recursive: true });
for (const [name, url, expected] of workerAssets) {
  const path = join(cache, `${name}-1.13.8.tgz`);
  if (!existsSync(path)) await download(url, path);
  if (await digest(path) !== expected) throw new Error(`Voice worker checksum mismatch: ${name}`);
  const output = join(worker, 'node_modules', name); await mkdir(output, { recursive: true });
  await new Promise((done, fail) => {
    const child = spawn('tar', ['-xf', path, '--strip-components=1', '-C', output], { windowsHide: true, shell: false, stdio: 'inherit' });
    child.on('error', fail); child.on('exit', code => code === 0 ? done() : fail(new Error('Voice worker extraction failed')));
  });
}
await cp(resolve('resources/scripts/morpheus-tts-worker.cjs'), join(worker, 'morpheus-tts-worker.cjs'));
await cp(resolve('resources/scripts/morpheus-asr-worker.cjs'), join(worker, 'morpheus-asr-worker.cjs'));
const notices = join(destination, 'notices'); await mkdir(notices, { recursive: true });
const licenseSources = [
  ['sherpa-onnx-APACHE-2.0.txt', 'https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/v1.13.8/LICENSE'],
  ['whisper-MIT.txt', 'https://raw.githubusercontent.com/openai/whisper/v20250625/LICENSE'],
  ['onnxruntime-MIT.txt', 'https://raw.githubusercontent.com/microsoft/onnxruntime/v1.24.4/LICENSE'],
  ['onnxruntime-worker-MIT.txt', 'https://raw.githubusercontent.com/microsoft/onnxruntime/v1.28.2/LICENSE'],
  ['espeak-ng-GPL-3.0.txt', 'https://raw.githubusercontent.com/csukuangfj/espeak-ng/ed530aa113046142eb5115cf2fc9157854d0ffe1/COPYING'],
];
for (const [name, url] of licenseSources) {
  const cached = join(cache, name); if (!existsSync(cached)) await download(url, cached);
  await cp(cached, join(notices, name));
}
await cp(join(destination, 'kokoro', 'LICENSE'), join(notices, 'kokoro-APACHE-2.0.txt'));
// Corresponding upstream source/build files travel with the isolated GPL phonemizer executable.
const sources = [
  ['sherpa-onnx-v1.13.8-source.tar.gz', 'https://github.com/k2-fsa/sherpa-onnx/archive/refs/tags/v1.13.8.tar.gz'],
  ['espeak-ng-ed530aa-source.zip', 'https://github.com/csukuangfj/espeak-ng/archive/ed530aa113046142eb5115cf2fc9157854d0ffe1.zip', 'e4e262cbe34f7fe21f91f1ba3397f2728e1f30eafbae7853f2b753a9ed13f0dd'],
];
for (const [name, url, expected] of sources) { const path = join(cache, name); if (!existsSync(path)) await download(url, path); if (expected && await digest(path) !== expected) throw new Error(`Voice source checksum mismatch: ${name}`); await cp(path, join(notices, name)); }
await writeFile(join(notices, 'NOTICE.txt'), 'Included offline voice: sherpa-onnx CLI and Node binding 1.13.8 (Apache-2.0), Whisper tiny.en (MIT), Kokoro v1.0 int8 (Apache-2.0), ONNX Runtime 1.24.4 CLI / 1.28.2 workers (MIT), eSpeak NG phonemizer/data (GPL-3.0).\nVoice engines run in independent processes; the native binding is loaded only by the bundled Node workers, never Electron. Original engine source/build files and license texts are included here. No engine/model source modifications. Morpheus IPC worker sources are included at ../worker/morpheus-tts-worker.cjs and ../worker/morpheus-asr-worker.cjs (Morpheus MIT).\nUpstream: https://github.com/k2-fsa/sherpa-onnx/tree/v1.13.8\nPhonemizer: https://github.com/csukuangfj/espeak-ng/tree/ed530aa113046142eb5115cf2fc9157854d0ffe1\n');
await writeFile(join(destination, 'manifest.json'), JSON.stringify({ engine: 'sherpa-onnx-1.13.8', language: 'en', worker: { protocol: 1, version: '1.13.8', onnxruntime: '1.28.2', idleUnloadMs: 60000 }, recognizerWorker: { protocol: 1, model: 'whisper-tiny.en-int8', language: 'en', task: 'transcribe', tailPaddings: 1000, threads: 4, idleUnloadMs: 60000, maxRecordingMs: 120000 }, assets: [...assets, ...workerAssets].map(([name,url,sha256]) => ({name,url,sha256})), notices: await Promise.all(licenseSources.map(async ([name,url]) => ({name,url,sha256:await digest(join(notices,name))}))), source: await Promise.all(sources.map(async ([name,url]) => ({name,url,sha256:await digest(join(notices,name))}))) }, null, 2) + '\n');
console.log('Included voice staged at ' + destination);
