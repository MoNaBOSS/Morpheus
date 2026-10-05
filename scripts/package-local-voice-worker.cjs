const { cpSync, existsSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const REQUIRED_LOCAL_VOICE_WORKER_FILES = [
  'morpheus-tts-worker.cjs',
  'morpheus-asr-worker.cjs',
  'node_modules/sherpa-onnx-node/sherpa-onnx.js',
  'node_modules/sherpa-onnx-node/non-streaming-tts.js',
  'node_modules/sherpa-onnx-node/non-streaming-asr.js',
  'node_modules/sherpa-onnx-node/addon.js',
  'node_modules/sherpa-onnx-node/addon-static-import.js',
  'node_modules/sherpa-onnx-win-x64/sherpa-onnx.node',
  'node_modules/sherpa-onnx-win-x64/sherpa-onnx-c-api.dll',
  'node_modules/sherpa-onnx-win-x64/onnxruntime.dll',
  'node_modules/sherpa-onnx-win-x64/onnxruntime_providers_shared.dll',
];

// extraResources can omit ignored node_modules directories. Copy this small,
// already pinned native runtime explicitly, outside the Electron ASAR/rebuilder.
function copyLocalVoiceWorker(source, destination) {
  for (const name of REQUIRED_LOCAL_VOICE_WORKER_FILES) {
    if (!existsSync(join(source, name))) throw new Error(`Included voice worker is missing: ${name}. Run voice:prepare before packaging.`);
  }
  mkdirSync(destination, { recursive: true });
  cpSync(source, destination, { recursive: true });
  for (const name of REQUIRED_LOCAL_VOICE_WORKER_FILES) {
    if (!existsSync(join(destination, name))) throw new Error(`Packaged voice worker is incomplete: ${name}`);
  }
}

module.exports = { copyLocalVoiceWorker, REQUIRED_LOCAL_VOICE_WORKER_FILES };
