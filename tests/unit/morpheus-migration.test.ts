import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  migrateClawXProfile,
  readMigrationRecord,
  resolveLegacyClawXUserData,
  validateImportedFile,
} from '@electron/services/morpheus/migration';

const scratch = mkdtempSync(join(tmpdir(), 'morpheus-migration-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let counter = 0;
/** Builds a synthetic ClawX profile plus an empty Morpheus destination. */
function makeProfiles(seed: Record<string, string> = {}): { source: string; destination: string } {
  counter += 1;
  const base = join(scratch, `case-${counter}`);
  const source = join(base, 'ClawX');
  const destination = join(base, 'Morpheus');
  mkdirSync(source, { recursive: true });

  const files: Record<string, string> = {
    'config.json': JSON.stringify({ theme: 'dark', language: 'en' }),
    'settings.json': JSON.stringify({ sidebarWidth: 260 }),
    ...seed,
  };
  for (const [name, content] of Object.entries(files)) {
    const target = join(source, name);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, content, 'utf8');
  }
  return { source, destination };
}

describe('profile detection', () => {
  it('finds a sibling ClawX directory', () => {
    const base = join(scratch, 'detect');
    mkdirSync(join(base, 'ClawX'), { recursive: true });
    expect(resolveLegacyClawXUserData(join(base, 'Morpheus'))).toBe(join(base, 'ClawX'));
  });

  it('returns null when no legacy profile exists', () => {
    const base = join(scratch, 'detect-empty');
    mkdirSync(base, { recursive: true });
    expect(resolveLegacyClawXUserData(join(base, 'Morpheus'))).toBeNull();
  });
});

describe('one-time import', () => {
  it('imports compatible data when the Morpheus profile is absent', () => {
    const { source, destination } = makeProfiles();
    const outcome = migrateClawXProfile({ sourceDir: source, destinationDir: destination });

    expect(outcome.status).toBe('migrated');
    if (outcome.status !== 'migrated') return;
    expect(outcome.imported).toContain('config.json');
    expect(JSON.parse(readFileSync(join(destination, 'config.json'), 'utf8'))).toEqual({
      theme: 'dark', language: 'en',
    });
  });

  it('NEVER deletes or modifies the original ClawX profile', () => {
    const { source, destination } = makeProfiles();
    const before = readFileSync(join(source, 'config.json'), 'utf8');

    migrateClawXProfile({ sourceDir: source, destinationDir: destination });

    // Rule 1: rollback to ClawX must find the data exactly where it was.
    expect(existsSync(join(source, 'config.json'))).toBe(true);
    expect(readFileSync(join(source, 'config.json'), 'utf8')).toBe(before);
  });

  it('never overwrites an existing destination file', () => {
    const { source, destination } = makeProfiles();
    mkdirSync(destination, { recursive: true });
    writeFileSync(join(destination, 'config.json'), JSON.stringify({ theme: 'light' }), 'utf8');

    const outcome = migrateClawXProfile({ sourceDir: source, destinationDir: destination });
    expect(outcome.status).toBe('migrated');
    if (outcome.status !== 'migrated') return;

    expect(JSON.parse(readFileSync(join(destination, 'config.json'), 'utf8')).theme).toBe('light');
    expect(outcome.skipped.some((s) => s.entry === 'config.json')).toBe(true);
  });

  it('records completion and does not run twice', () => {
    const { source, destination } = makeProfiles();
    migrateClawXProfile({ sourceDir: source, destinationDir: destination });

    const record = readMigrationRecord(destination);
    expect(record?.completedAt).toBeTruthy();
    expect(record?.sourceDir).toBe(source);

    // A second run must be a no-op: deletions made in Morpheus must not be
    // silently undone on the next launch.
    writeFileSync(join(source, 'config.json'), JSON.stringify({ theme: 'changed' }), 'utf8');
    rmSync(join(destination, 'config.json'));
    const second = migrateClawXProfile({ sourceDir: source, destinationDir: destination });

    expect(second.status).toBe('already-migrated');
    expect(existsSync(join(destination, 'config.json'))).toBe(false);
  });

  it('reports no-source when there is nothing to import', () => {
    const base = join(scratch, 'no-source');
    expect(migrateClawXProfile({
      sourceDir: join(base, 'missing'),
      destinationDir: join(base, 'Morpheus'),
    }).status).toBe('no-source');
  });

  it('refuses to import a directory onto itself', () => {
    const { source } = makeProfiles();
    expect(migrateClawXProfile({ sourceDir: source, destinationDir: source }).status).toBe('no-source');
  });
});

describe('validation and partial failure', () => {
  it('skips invalid JSON rather than importing it blindly', () => {
    const { source, destination } = makeProfiles({ 'config.json': '{ this is not json' });
    const outcome = migrateClawXProfile({ sourceDir: source, destinationDir: destination });

    expect(outcome.status).toBe('migrated');
    if (outcome.status !== 'migrated') return;
    expect(existsSync(join(destination, 'config.json'))).toBe(false);
    expect(outcome.skipped.find((s) => s.entry === 'config.json')?.reason).toMatch(/invalid JSON/);
  });

  it('continues importing other entries after one fails', () => {
    const { source, destination } = makeProfiles({ 'config.json': '{ broken' });
    const outcome = migrateClawXProfile({ sourceDir: source, destinationDir: destination });

    expect(outcome.status).toBe('migrated');
    if (outcome.status !== 'migrated') return;
    // settings.json is unaffected by config.json failing.
    expect(existsSync(join(destination, 'settings.json'))).toBe(true);
    expect(outcome.imported).toContain('settings.json');
  });

  it('still records completion after a partial import', () => {
    const { source, destination } = makeProfiles({ 'config.json': 'nope' });
    migrateClawXProfile({ sourceDir: source, destinationDir: destination });
    expect(readMigrationRecord(destination)?.skipped.length).toBeGreaterThan(0);
  });

  it('accepts non-JSON files without parsing them', () => {
    expect(validateImportedFile('anything.bin')).toEqual({ ok: true });
  });
});

describe('exclusions', () => {
  it('does not import caches or logs', () => {
    const { source, destination } = makeProfiles();
    for (const dir of ['Cache', 'GPUCache', 'logs']) {
      mkdirSync(join(source, dir), { recursive: true });
      writeFileSync(join(source, dir, 'blob.bin'), 'junk', 'utf8');
    }

    migrateClawXProfile({ sourceDir: source, destinationDir: destination });

    for (const dir of ['Cache', 'GPUCache', 'logs']) {
      expect(existsSync(join(destination, dir))).toBe(false);
    }
  });

  it('imports Morpheus-owned data directories recursively', () => {
    const { source, destination } = makeProfiles();
    mkdirSync(join(source, 'morpheus', 'files'), { recursive: true });
    writeFileSync(join(source, 'morpheus', 'files', 'kept.txt'), 'hello', 'utf8');

    migrateClawXProfile({ sourceDir: source, destinationDir: destination });
    expect(readFileSync(join(destination, 'morpheus', 'files', 'kept.txt'), 'utf8')).toBe('hello');
  });

  it('excludes cache subdirectories nested inside an imported directory', () => {
    const { source, destination } = makeProfiles();
    mkdirSync(join(source, 'morpheus', 'Cache'), { recursive: true });
    writeFileSync(join(source, 'morpheus', 'Cache', 'x.bin'), 'junk', 'utf8');

    migrateClawXProfile({ sourceDir: source, destinationDir: destination });
    expect(existsSync(join(destination, 'morpheus', 'Cache'))).toBe(false);
  });
});
