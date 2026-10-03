// Offline generated-speech benchmark. Never records a microphone or accesses a profile.
// node scripts/benchmark-local-voice.mjs <bundled-voice-root> <new-evidence-directory>
import { build } from 'esbuild';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { cpus, totalmem } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const root = resolve(process.argv[2] || 'build/local-voice');
if (!process.argv[3]) throw new Error('Supply a new evidence directory.');
const output = resolve(process.argv[3]);
await mkdir(output, { recursive: false });
await build({ entryPoints: ['electron/services/morpheus/voice/local-voice.ts'], outfile: join(output, 'adapter.cjs'),
  bundle: true, platform: 'node', format: 'cjs', tsconfig: 'tsconfig.node.json' });
const { createMorpheusLocalVoice } = createRequire(import.meta.url)(join(output, 'adapter.cjs'));
const voice = createMorpheusLocalVoice(root, join(output, 'temporary'));
const phrase = 'I am Morpheus. Tell me what you need, and I will get moving. A little humor, a little Matrix, and useful results.';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const workers = async () => {
  const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `$ids = @(Get-CimInstance Win32_Process -Filter 'ParentProcessId = ${process.pid}' | Where-Object Name -eq 'node.exe' | Select-Object -ExpandProperty ProcessId); @($ids | ForEach-Object { $p = Get-Process -Id $_ -ErrorAction SilentlyContinue; if ($p) { @{ pid=$p.Id; cpuSeconds=$p.CPU; workingSetBytes=$p.WorkingSet64 } } }) | ConvertTo-Json -Compress`], { windowsHide: true });
  const value = stdout.trim() ? JSON.parse(stdout) : []; return Array.isArray(value) ? value : [value];
};
function wav(pcm) {
  const b = Buffer.alloc(44); b.write('RIFF'); b.writeUInt32LE(pcm.length + 36, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22); b.writeUInt32LE(24000,24);
  b.writeUInt32LE(48000,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(pcm.length,40);
  return Buffer.concat([b, pcm]);
}
const result = { at: new Date().toISOString(), scope: 'Real isolated Main adapter/native worker; generated input only, no speaker/microphone/renderer timing acceptance',
  runtime: process.version, cpu: cpus()[0].model, memory: totalmem(), manifest: JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')), samples: [] };
try {
  for (let index = 0; index < 4; index++) {
    const started = performance.now(), chunks = [], events = [];
    await voice.synthesizeStream(phrase, 'cedar', new AbortController().signal, pcm => {
      events.push({ atMs: performance.now() - started, bytes: pcm.length }); chunks.push(Buffer.from(pcm));
    });
    const generationMs = performance.now() - started;
    let cursor = 0, maxGenerationGapMs = 0; const realtime = [];
    for (let i = 0; i < events.length; i++) {
      const event = events[i], gap = Math.max(0, event.atMs - cursor);
      if (i) maxGenerationGapMs = Math.max(maxGenerationGapMs, gap);
      if (gap) realtime.push(Buffer.alloc(Math.floor(gap * 24) * 2));
      realtime.push(chunks[i]); cursor = Math.max(cursor, event.atMs) + event.bytes / 48;
    }
    await writeFile(join(output, `michael-${index}-audio-only.wav`), wav(Buffer.concat(chunks)));
    await writeFile(join(output, `michael-${index}-delivery-timeline.wav`), wav(Buffer.concat(realtime)));
    const sample = { state: index === 0 ? 'cold-worker' : 'warm-worker', firstPcmMs: events[0].atMs,
      generationMs, idealPlaybackCompleteMs: cursor, maxGenerationGapMs, events };
    result.samples.push(sample); console.log(JSON.stringify(sample));
  }
  await writeFile(join(output, 'heart-audition.wav'), await voice.synthesize('Hello. I am Morpheus. What would you like to do today?', 'coral', new AbortController().signal));
  const before = await workers(); await sleep(10_000); const after = await workers();
  result.idleObservation = { milliseconds: 10000, before, after };
  console.log('Idle observation', JSON.stringify(result.idleObservation));
  const controller = new AbortController(); let abortedAt;
  const timer = setTimeout(() => { abortedAt = performance.now(); controller.abort(); }, 100);
  try { await voice.synthesize('This intentionally long response must stop when the user cancels the active voice generation.', 'cedar', controller.signal); }
  catch (error) { if (error.name !== 'AbortError') throw error; result.cancellation = { rejectionAfterAbortMs: performance.now() - abortedAt }; }
  finally { clearTimeout(timer); }
  result.cancellation.remainingWorkers = await workers();
  if (result.cancellation.remainingWorkers.length) throw new Error('Cancelled worker remained alive.');
  const started = performance.now(); await voice.warm(); result.rewarmMs = performance.now() - started;
  console.log('Cancellation', JSON.stringify(result.cancellation), 'rewarmMs', result.rewarmMs);
  console.log('Waiting for the real 60-second idle unload.');
  await sleep(61_000);
  result.afterIdleUnload = await workers();
  if (result.afterIdleUnload.length) throw new Error('Idle worker remained alive.');
  await voice.warm(); voice.dispose(); await sleep(100);
  result.afterDispose = await workers();
  if (result.afterDispose.length) throw new Error('Disposed worker remained alive.');
} finally {
  voice.dispose(); await writeFile(join(output, 'benchmark.json'), JSON.stringify(result, null, 2));
}
console.log('Voice benchmark saved to', output);
