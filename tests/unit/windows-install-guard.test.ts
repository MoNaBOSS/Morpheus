// @vitest-environment node
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const helper = resolve('scripts/windows/install-guard.ps1');
const powershell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
const fixtures: string[] = [];
function root() { const path = mkdtempSync(join(tmpdir(), 'morpheus-install-guard-')); fixtures.push(path); return path; }
function product(path: string) {
  mkdirSync(join(path, 'resources'), { recursive: true });
  writeFileSync(join(path, 'Morpheus.exe'), 'synthetic-marker-not-executable');
  writeFileSync(join(path, 'resources/app.asar'), 'previous bytes');
  writeFileSync(join(path, 'personal-note.txt'), 'preserve every file');
}
function run(action: string, install: string, backup = `${install}._rollback_0`) {
  return spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper,
    '-Action', action, '-InstallDir', install, '-BackupDir', backup], { encoding: 'utf8', windowsHide: true, timeout: 10_000 });
}
afterEach(() => { for (const path of fixtures.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe.skipIf(process.platform !== 'win32')('actual PowerShell installation guard on isolated fixtures', () => {
  it('retains all previous files and restores without deleting partial extraction', () => {
    const parent = root(), target = join(parent, "Morpheus's app 空間"), backup = `${target}._rollback_0`;
    product(target);
    const prepared = run('Prepare', target);
    expect(prepared.status, prepared.stderr).toBe(0);
    expect(existsSync(target)).toBe(false);
    expect(readFileSync(join(backup, 'personal-note.txt'), 'utf8')).toBe('preserve every file');
    mkdirSync(target); writeFileSync(join(target, 'partial'), 'partial bytes');
    const restored = run('Restore', target);
    expect(restored.status, restored.stderr).toBe(0);
    expect(readFileSync(join(target, 'resources/app.asar'), 'utf8')).toBe('previous bytes');
    const partial = readdirSync(parent).find((name) => name.includes('._failed_'))!;
    expect(readFileSync(join(parent, partial, 'partial'), 'utf8')).toBe('partial bytes');
  }, 20_000);

  it('rejects broad relative non-product and wrong backup targets without modifying files', () => {
    const parent = root(), target = join(parent, 'unrelated'); mkdirSync(target);
    writeFileSync(join(target, 'keep.txt'), 'unchanged');
    for (const path of ['C:\\', process.env.USERPROFILE!, 'relative-folder', target]) {
      expect(run('Prepare', path).status).toBe(2);
    }
    expect(readFileSync(join(target, 'keep.txt'), 'utf8')).toBe('unchanged');
    const app = join(parent, 'app'); product(app);
    expect(run('Prepare', app, join(parent, 'another')).status).toBe(2);
    mkdirSync(`${app}._rollback_0`);
    expect(run('Prepare', app).status).toBe(2);
    expect(readFileSync(join(app, 'resources/app.asar'), 'utf8')).toBe('previous bytes');
  }, 30_000);

  it('rejects a redirected installation and source checkout', () => {
    const parent = root(), actual = join(parent, 'actual'), linked = join(parent, 'linked'); product(actual);
    symlinkSync(actual, linked, 'junction');
    expect(run('Prepare', linked).status).toBe(2);
    expect(readFileSync(join(actual, 'personal-note.txt'), 'utf8')).toBe('preserve every file');
    mkdirSync(join(actual, '.git'));
    expect(run('Prepare', actual).status).toBe(2);
  }, 20_000);

  it('authorizes uninstall only for a recognized closed product and never modifies fixtures', () => {
    const parent = root(), app = join(parent, 'app'), unrelated = join(parent, 'personal');
    product(app); mkdirSync(unrelated); writeFileSync(join(unrelated, 'keep.txt'), 'keep');
    expect(run('CheckUninstall', app).status).toBe(0);
    expect(readFileSync(join(app, 'resources/app.asar'), 'utf8')).toBe('previous bytes');
    expect(run('CheckUninstall', unrelated).status).toBe(2);
    expect(readFileSync(join(unrelated, 'keep.txt'), 'utf8')).toBe('keep');
    expect(run('CheckUninstall', join(parent, 'absent')).status).toBe(2);
    mkdirSync(join(app, '.git'));
    expect(run('CheckUninstall', app).status).toBe(2);
  }, 20_000);

  it('uses a directory separator boundary and never stops a running fixture', async () => {
    const parent = root(), target = join(parent, 'app'), neighbor = `${target}-neighbor`;
    mkdirSync(target); mkdirSync(neighbor);
    const binary = join(neighbor, 'Morpheus.exe');
    copyFileSync(join(process.env.SystemRoot!, 'System32/ping.exe'), binary);
    const child = spawn(binary, ['-t', '127.0.0.1'], { windowsHide: true, stdio: 'ignore' });
    await new Promise<void>((done, fail) => { child.once('spawn', done); child.once('error', fail); });
    try {
      expect(run('Check', target).status).toBe(0);
      expect(run('Check', neighbor).status).toBe(2);
      expect(child.exitCode).toBeNull();
    } finally {
      const exited = new Promise((done) => child.once('exit', done));
      child.kill(); // Exact owned fixture only, never process-name termination.
      await exited;
    }
  }, 20_000);
});
