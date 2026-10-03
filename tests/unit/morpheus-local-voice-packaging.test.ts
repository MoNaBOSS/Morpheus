import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
const { copyLocalVoiceWorker, REQUIRED_LOCAL_VOICE_WORKER_FILES: required } = createRequire(import.meta.url)('../../scripts/package-local-voice-worker.cjs') as {
  copyLocalVoiceWorker(source: string, destination: string): void; REQUIRED_LOCAL_VOICE_WORKER_FILES: string[];
};
const temporary: string[] = [];
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });
describe('packaged included speech runtime', () => {
  it('copies every pinned worker dependency even when the normal packager omits node_modules', () => {
    const root = mkdtempSync(join(tmpdir(), 'voice-package-')); temporary.push(root);
    const source = join(root, 'source'), destination = join(root, 'resources', 'local-voice', 'worker');
    for (const file of required) { mkdirSync(dirname(join(source, file)), { recursive: true }); writeFileSync(join(source, file), `qualified fixture ${file}`); }
    copyLocalVoiceWorker(source, destination);
    for (const file of required) expect(readFileSync(join(destination, file))).toEqual(readFileSync(join(source, file)));
  });
  it('fails packaging before writing a partial worker when its native binding is absent', () => {
    const root = mkdtempSync(join(tmpdir(), 'voice-package-')); temporary.push(root);
    const source = join(root, 'source'), destination = join(root, 'destination');
    mkdirSync(source); writeFileSync(join(source, 'morpheus-tts-worker.cjs'), 'fixture');
    expect(() => copyLocalVoiceWorker(source, destination)).toThrow('voice:prepare'); expect(existsSync(destination)).toBe(false);
  });
});
