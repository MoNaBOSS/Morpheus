// Replays immutable generated WAVs through an explicitly supplied, identified
// included ASR executable and candidate Whisper assets. No app/profile/actions.
// node scripts/compare-voice-command-recognizers.mjs <baseline-qualification.json> <sherpa-onnx-offline.exe> <candidate-whisper-directory> <NEW-output-directory> [--model=base.en] [--tail-paddings=1000]
import { build } from 'esbuild';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [baselineArg, executableArg, modelsArg, outputArg, ...flags] = process.argv.slice(2);
if (!baselineArg || !executableArg || !modelsArg || !outputArg) throw new Error('Supply baseline, fixed ASR executable, candidate models and new output directory.');
const baselinePath = resolve(baselineArg), executable = resolve(executableArg), models = resolve(modelsArg), output = resolve(outputArg);
let model = 'base.en', tailPaddings = 1000;
const seen = new Set();
for (const flag of flags) {
  const modelMatch = /^--model=(tiny\.en|base\.en|small\.en|distil-small\.en)$/.exec(flag);
  const paddingMatch = /^--tail-paddings=(50|1000)$/.exec(flag);
  const key = modelMatch ? 'model' : paddingMatch ? 'padding' : null;
  if (!key || seen.has(key)) throw new Error(`Unknown or repeated flag: ${flag}`);
  seen.add(key); if (modelMatch) model = modelMatch[1]; else tailPaddings = Number(paddingMatch[1]);
}
const digest = async path => { const hash = createHash('sha256'); for await (const part of createReadStream(path)) hash.update(part); return hash.digest('hex'); };
const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
const corpusPath = join(source, 'tests/fixtures/morpheus/voice-command-corpus.json');
const corpus = JSON.parse(await readFile(corpusPath, 'utf8'));
const originalCorpusHash = baseline.source?.files?.find(file => file.path === 'tests/fixtures/morpheus/voice-command-corpus.json')?.sha256;
if (!originalCorpusHash || await digest(corpusPath) !== originalCorpusHash) throw new Error('Corpus changed since baseline; do not weaken comparison expectations.');
if (!Array.isArray(baseline.samples) || !baseline.samples.length || baseline.samples.length > 100
  || baseline.samples.length !== baseline.selection?.matrix?.length || baseline.fatal
  || baseline.samples.some(sample => !sample.evaluation || !/^[a-z0-9-]+$/.test(sample.id)
    || !/^(cedar|coral)$/.test(sample.voice))) throw new Error('Expected complete bounded original generated baseline.');
const expectedExecutable = baseline.engines?.files?.find(file => file.path === 'bin/sherpa-onnx-offline.exe')?.sha256;
if (!expectedExecutable || await digest(executable) !== expectedExecutable) throw new Error('ASR executable differs from original baseline; isolate model comparison.');
await mkdir(output, { recursive: false });
const records = [];
const report = { at: new Date().toISOString(), scope: 'Same immutable generated WAV hashes, exact corpus and included ASR executable; model/padding comparison only. No native wake, human microphone, app, Core execution or public precision claim.',
  baseline: { path: baselinePath, sha256: await digest(baselinePath), summary: baseline.summary },
  source: { originalHead: baseline.source.head, evaluatorSha256: await digest(join(source, 'scripts/lib/voice-command-corpus.ts')),
    interpreterSha256: await digest(join(source, 'shared/morpheus/interpreter/deterministic.ts')),
    browserSearchSha256: await digest(join(source, 'shared/morpheus/interpreter/browser-search.ts')),
    taskControlSha256: await digest(join(source, 'electron/services/morpheus/core/task-controls.ts')),
    runnerSha256: await digest(fileURLToPath(import.meta.url)), corpusSha256: originalCorpusHash },
  candidate: { model, tailPaddings, language: 'en', task: 'transcribe', threads: 4,
    executable: { path: executable, sha256: expectedExecutable }, assets: [] }, samples: records, summary: null, fatal: null };
const save = () => writeFile(join(output, 'comparison.json'), JSON.stringify(report, null, 2));
const controller = new AbortController(), abort = () => controller.abort();
process.once('SIGINT', abort); process.once('SIGTERM', abort);
const timer = setTimeout(abort, 15 * 60_000);
try {
  for (const name of [`${model}-encoder.int8.onnx`, `${model}-decoder.int8.onnx`, `${model}-tokens.txt`]) {
    const path = join(models, name); report.candidate.assets.push({ name, path, sha256: await digest(path) });
  }
  const verification = join(models, 'verified-assets.json');
  if (existsSync(verification)) report.candidate.upstreamVerification = JSON.parse((await readFile(verification, 'utf8')).replace(/^\uFEFF/, ''));
  await build({ entryPoints: [join(source, 'scripts/lib/voice-command-corpus.ts')], outfile: join(output, 'evaluator.cjs'), bundle: true,
    platform: 'node', format: 'cjs', tsconfig: join(source, 'tsconfig.node.json') });
  const { evaluateVoiceCommand } = createRequire(import.meta.url)(join(output, 'evaluator.cjs'));
  const run = promisify(execFile);
  for (const sample of baseline.samples) {
    if (controller.signal.aborted) throw new DOMException('Comparison cancelled or deadline exceeded', 'AbortError');
    const entry = corpus.cases.find(item => item.id === sample.id);
    if (!entry) throw new Error('Unknown original case');
    const wave = join(dirname(baselinePath), `${sample.voice}-${sample.id}-recognizer-16k.wav`);
    const waveSha256 = await digest(wave);
    if (waveSha256 !== sample.audio?.recognizerSha256) throw new Error(`Original WAV changed: ${sample.id}`);
    const result = { id: sample.id, voice: sample.voice, wave: { path: wave, sha256: waveSha256 },
      original: { transcriptionMs: sample.transcriptionMs, evaluation: sample.evaluation },
      originalWithCurrentRouting: await evaluateVoiceCommand(entry, sample.evaluation.transcript, corpus.wakePhrase) };
    const started = performance.now();
    try {
      const { stdout } = await run(executable, ['--debug=0', `--whisper-encoder=${join(models, `${model}-encoder.int8.onnx`)}`,
        `--whisper-decoder=${join(models, `${model}-decoder.int8.onnx`)}`, `--tokens=${join(models, `${model}-tokens.txt`)}`,
        '--whisper-language=en', '--whisper-task=transcribe', `--whisper-tail-paddings=${tailPaddings}`, '--num-threads=4', wave],
      { timeout: 90_000, maxBuffer: 2_000_000, windowsHide: true, shell: false, signal: controller.signal,
        env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: process.env.TEMP, TMP: process.env.TMP } });
      result.transcriptionMs = performance.now() - started;
      let transcript;
      for (const line of stdout.split(/\r?\n/).reverse()) {
        if (!line.trim().startsWith('{')) continue;
        try { const parsed = JSON.parse(line); if (typeof parsed.text === 'string') { transcript = parsed.text.trim().slice(0, 12000); break; } } catch { /* Diagnostics are not transcripts. */ }
      }
      if (typeof transcript !== 'string') throw new Error('Candidate returned no transcript');
      result.evaluation = await evaluateVoiceCommand(entry, transcript, corpus.wakePhrase);
      result.passed = result.evaluation.passed;
    } catch (error) { result.passed = false; result.error = { name: error.name, message: error.message }; }
    result.totalMs = performance.now() - started; records.push(result); await save();
    console.log(`${sample.voice}/${sample.id}: ${result.passed ? 'PASS' : 'FAIL'} (${Math.round(result.totalMs)}ms)`);
  }
} catch (error) { report.fatal = { name: error.name, message: error.message }; }
finally {
  clearTimeout(timer); process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort);
  const values = records.filter(record => typeof record.transcriptionMs === 'number').map(record => record.transcriptionMs).sort((a, b) => a - b);
  report.summary = { planned: baseline.samples.length, completed: records.length, candidatePassed: records.filter(record => record.passed).length,
    originalWithCurrentRoutingPassed: records.filter(record => record.originalWithCurrentRouting.passed).length,
    gains: records.filter(record => record.passed && !record.originalWithCurrentRouting.passed).map(record => `${record.voice}/${record.id}`),
    regressions: records.filter(record => !record.passed && record.originalWithCurrentRouting.passed).map(record => `${record.voice}/${record.id}`),
    unsafePartialPlans: records.filter(record => record.evaluation?.failures.includes('unsafe-partial-plan')).map(record => `${record.voice}/${record.id}`),
    unexpectedAddressedNegatives: records.filter(record => record.original.evaluation.expected.kind === 'ignored'
      && record.evaluation?.observed.kind !== 'ignored').map(record => `${record.voice}/${record.id}`),
    transcriptionMs: values.length ? { firstCase: records[0].transcriptionMs, min: values[0], median: values[Math.floor(values.length / 2)],
      p95: values[Math.ceil(values.length * 0.95) - 1], max: values.at(-1) } : null };
  await save();
}
if (report.fatal || records.length !== baseline.samples.length || records.some(record => !record.passed)) process.exitCode = 1;
console.log('Comparison saved:', join(output, 'comparison.json'));
