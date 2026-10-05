// Root-controlled offline generated-speech qualification. No app, mic, profile,
// network, executable actions or live tasks. Runs the fixed included engines.
// node scripts/qualify-voice-command-corpus.mjs <bundled-local-voice-root> <new-output-directory> [--voice=cedar|coral] [--cases=id,id]
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cpus, totalmem } from 'node:os';
import { createCorpusAudioConverter } from './lib/voice-command-corpus-audio.mjs';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [rootArg, outputArg, ...flags] = process.argv.slice(2);
if (!rootArg || !outputArg) throw new Error('Supply bundled voice files and a new evidence directory.');
const root = resolve(rootArg), output = resolve(outputArg);
let voiceFilter, caseFilter;
for (const flag of flags) {
  if (/^--voice=(cedar|coral)$/.test(flag) && !voiceFilter) voiceFilter = flag.slice(8);
  else if (/^--cases=[a-z0-9,-]+$/.test(flag) && !caseFilter) caseFilter = flag.slice(8).split(',');
  else throw new Error(`Unknown or repeated flag: ${flag}`);
}
const corpusPath = join(sourceRoot, 'tests/fixtures/morpheus/voice-command-corpus.json');
const corpus = JSON.parse(await readFile(corpusPath, 'utf8'));
if (corpus.version !== 1 || !Array.isArray(corpus.cases) || corpus.cases.length > 50
  || new Set(corpus.cases.map(entry => entry.id)).size !== corpus.cases.length
  || corpus.cases.some(entry => !/^[a-z0-9-]+$/.test(entry.id) || typeof entry.spokenText !== 'string'
    || !entry.spokenText.trim() || entry.spokenText.length > 500)) throw new Error('Invalid bounded corpus.');
if (caseFilter?.some(id => !corpus.cases.some(entry => entry.id === id))) throw new Error('Unknown corpus case ID.');
const matrix = Object.entries(corpus.voices).flatMap(([voice, selection]) => corpus.cases
  .filter(entry => (selection === 'all' || selection.includes(entry.id)) && (!caseFilter || caseFilter.includes(entry.id))
    && (!voiceFilter || voiceFilter === voice)).map(entry => ({ voice, entry })));
if (!matrix.length || matrix.length > 100) throw new Error('Empty or excessive corpus selection.');
const digest = async path => { const hash = createHash('sha256'); for await (const part of createReadStream(path)) hash.update(part); return hash.digest('hex'); };
const hashTree = async directory => {
  const entries = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Engine identity must not follow symlinks.');
    if (entry.isDirectory()) entries.push(...await hashTree(path));
    else if (entry.isFile()) entries.push({ path: relative(root, path).replaceAll('\\', '/'), sha256: await digest(path) });
  }
  return entries;
};
await mkdir(output, { recursive: false });
const evidence = { at: new Date().toISOString(), scope: corpus.scope,
  limits: 'Offline generated corpus only. Does not measure native wake detection, physical speech, renderer playback or end-to-end Core execution. Unsupported means no deterministic partial plan; provider fallback is not executed.',
  selection: { voiceFilter: voiceFilter ?? null, caseFilter: caseFilter ?? null, matrix: matrix.map(({ voice, entry }) => `${voice}/${entry.id}`) },
  machine: { runtime: process.version, platform: process.platform, cpu: cpus()[0]?.model, memoryBytes: totalmem() },
  audioConversion: { processor: 'actual application worklet offline', sourceSampleRate: 24000, recognizerSampleRate: 16000,
    leadingSilenceMs: 600, trailingSilenceMs: '600 plus complete-frame padding (less than 200)' },
  source: {}, engines: {}, canonical: [], samples: [], summary: {}, fatal: null };
const save = () => writeFile(join(output, 'qualification.json'), JSON.stringify(evidence, null, 2));
let voice;
const controller = new AbortController(), abort = () => controller.abort();
process.once('SIGINT', abort); process.once('SIGTERM', abort);
const totalDeadline = setTimeout(abort, 15 * 60_000);
try {
  const run = promisify(execFile);
  const git = async args => (await run('git', args, { cwd: sourceRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 })).stdout;
  const diff = await git(['diff', '--binary', 'HEAD']);
  const sourceFiles = ['scripts/qualify-voice-command-corpus.mjs', 'scripts/lib/voice-command-corpus.ts', 'scripts/lib/voice-command-corpus-adapter.ts',
    'scripts/lib/voice-command-corpus-audio.mjs', 'tests/fixtures/morpheus/voice-command-corpus.json', 'src/lib/morpheus-wake-audio-worklet.js',
    'electron/services/morpheus/voice/local-voice.ts', 'electron/services/morpheus/voice/local-voice-worker.ts', 'electron/services/morpheus/voice/local-speech.ts',
    'electron/services/morpheus/voice/local-recognizer-worker.ts', 'resources/scripts/morpheus-asr-worker.cjs',
    'scripts/prepare-local-voice.mjs', 'scripts/package-local-voice-worker.cjs',
    'electron/services/morpheus/voice/local-input.ts', 'electron/services/morpheus/voice/wake-audio-buffer.ts', 'electron/services/morpheus/core/task-controls.ts',
    'shared/morpheus/operator-types.ts', 'shared/morpheus/interpreter/deterministic.ts', 'shared/morpheus/interpreter/browser-search.ts'];
  evidence.source = { root: sourceRoot, head: (await git(['rev-parse', 'HEAD'])).trim(), status: (await git(['status', '--porcelain'])).trim(),
    trackedDiffSha256: createHash('sha256').update(diff).digest('hex'), files: await Promise.all(sourceFiles.map(async path => ({ path, sha256: await digest(join(sourceRoot, path)) }))) };
  const node = [resolve(root, '../../bin/node.exe'), resolve(root, '../../resources/bin/node.exe')].find(existsSync);
  if (!node) throw new Error('Bundled local voice Node runtime is missing.');
  evidence.engines = { root, manifest: JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')),
    node: { path: node, sha256: await digest(node) }, files: await hashTree(root) };
  await build({ entryPoints: [join(sourceRoot, 'scripts/lib/voice-command-corpus-adapter.ts')], outfile: join(output, 'adapter.cjs'),
    bundle: true, platform: 'node', format: 'cjs', tsconfig: join(sourceRoot, 'tsconfig.node.json') });
  const adapter = createRequire(import.meta.url)(join(output, 'adapter.cjs'));
  voice = adapter.createMorpheusLocalVoice(root, join(output, 'temporary'));
  if (!voice.ready()) throw new Error('Included engines are unavailable; Windows and complete bundled assets are required.');
  const convert = await createCorpusAudioConverter(join(sourceRoot, 'src/lib/morpheus-wake-audio-worklet.js'));
  for (const entry of corpus.cases) evidence.canonical.push(await adapter.evaluateVoiceCommand(entry, entry.spokenText, corpus.wakePhrase));
  for (const { entry, voice: selectedVoice } of matrix) {
    if (controller.signal.aborted) throw new DOMException('Corpus cancelled or deadline exceeded', 'AbortError');
    const started = performance.now();
    const sample = { id: entry.id, voice: selectedVoice, generatedText: entry.spokenText, state: evidence.samples.length ? 'warm-tts-worker' : 'cold-tts-worker', stage: 'synthesis' };
    try {
      const original = await voice.synthesize(entry.spokenText, selectedVoice, controller.signal);
      sample.synthesisMs = performance.now() - started;
      sample.stage = 'conversion'; const wave = convert(original);
      sample.generatedAudioSeconds = (original.length - 44) / 48000; sample.recognizerAudioSeconds = (wave.length - 44) / 32000;
      const name = `${selectedVoice}-${entry.id}`;
      await writeFile(join(output, `${name}-generated-24k.wav`), original);
      await writeFile(join(output, `${name}-recognizer-16k.wav`), wave);
      sample.audio = { generatedSha256: await digest(join(output, `${name}-generated-24k.wav`)), recognizerSha256: await digest(join(output, `${name}-recognizer-16k.wav`)) };
      sample.stage = 'transcription'; const transcribeStarted = performance.now();
      const transcript = await voice.transcribe(wave, controller.signal); sample.transcriptionMs = performance.now() - transcribeStarted;
      sample.stage = 'routing'; const routeStarted = performance.now();
      sample.evaluation = await adapter.evaluateVoiceCommand(entry, transcript, corpus.wakePhrase); sample.routingMs = performance.now() - routeStarted;
      sample.passed = sample.evaluation.passed; sample.stage = 'complete';
    } catch (error) { sample.passed = false; sample.error = { name: error.name, message: error.message }; }
    sample.totalMs = performance.now() - started; evidence.samples.push(sample);
    console.log(`${selectedVoice}/${entry.id}: ${sample.passed ? 'PASS' : 'FAIL'} (${Math.round(sample.totalMs)}ms)`);
    await save();
  }
} catch (error) { evidence.fatal = { name: error.name, message: error.message }; }
finally {
  clearTimeout(totalDeadline); process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); voice?.dispose();
  const temporary = join(output, 'temporary');
  evidence.temporaryFilesRemaining = existsSync(temporary) ? await readdir(temporary) : [];
  const values = evidence.samples.filter(sample => sample.stage === 'complete').map(sample => sample.transcriptionMs).sort((a, b) => a - b);
  evidence.summary = { canonical: { passed: evidence.canonical.filter(entry => entry.passed).length, total: evidence.canonical.length },
    generated: { passed: evidence.samples.filter(sample => sample.passed).length, total: evidence.samples.length, planned: matrix.length,
      declaredNameAliases: evidence.samples.filter(sample => sample.evaluation?.acceptedDeclaredAlias).length },
    transcriptionMs: values.length ? { min: values[0], median: values[Math.floor(values.length / 2)], p95: values[Math.ceil(values.length * 0.95) - 1], max: values.at(-1) } : null,
    byCategory: Object.fromEntries([...new Set(corpus.cases.map(entry => entry.category))].map(category => {
      const entries = evidence.samples.filter(sample => sample.evaluation?.category === category);
      return [category, { passed: entries.filter(sample => sample.passed).length, total: entries.length }];
    })) };
  await save();
}
if (evidence.fatal || evidence.canonical.some(entry => !entry.passed) || evidence.samples.length !== matrix.length
  || evidence.samples.some(sample => !sample.passed) || evidence.temporaryFilesRemaining.length) process.exitCode = 1;
console.log('Qualification saved:', join(output, 'qualification.json'));
