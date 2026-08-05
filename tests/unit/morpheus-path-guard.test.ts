import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  MorpheusPathError,
  assertRegularFileInside,
  assertSafeTextFileName,
  canonicalizeExistingDir,
  isPathInside,
  normalizeComparablePath,
  resolveWithinRoot,
} from '@electron/utils/morpheus-path-guard';

const scratch = mkdtempSync(join(tmpdir(), 'morpheus-path-guard-'));

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('assertSafeTextFileName', () => {
  it('accepts ordinary text file names', () => {
    for (const name of ['notes.txt', 'a.txt', 'run-01_final.txt', 'A1.txt']) {
      expect(assertSafeTextFileName(name)).toBe(name);
    }
  });

  it('rejects traversal, separators and stream separators', () => {
    for (const name of [
      '../notes.txt',
      '..\\notes.txt',
      '../../notes.txt',
      'a/b.txt',
      'a\\b.txt',
      'C:\\Windows\\notes.txt',
      '/etc/notes.txt',
      'notes.txt:stream',
      'notes:stream.txt',
    ]) {
      expect(() => assertSafeTextFileName(name)).toThrow(MorpheusPathError);
    }
  });

  it('rejects Windows reserved device names with or without an extension', () => {
    for (const name of ['NUL.txt', 'nul.txt', 'CON.txt', 'com1.txt', 'LPT9.txt', 'aux.txt']) {
      expect(() => assertSafeTextFileName(name)).toThrow(/reserved-device-name/);
    }
  });

  it('rejects trailing dots and spaces that Windows would silently strip', () => {
    // The grammar already rejects these, so they surface as a grammar failure;
    // what matters is that they never reach the filesystem.
    for (const name of ['notes.txt.', 'notes.txt ']) {
      expect(() => assertSafeTextFileName(name)).toThrow(MorpheusPathError);
    }
  });

  it('rejects wrong extensions, over-long names and non-strings', () => {
    expect(() => assertSafeTextFileName('notes.exe')).toThrow(/grammar/);
    expect(() => assertSafeTextFileName('notes')).toThrow(/grammar/);
    expect(() => assertSafeTextFileName(`${'a'.repeat(80)}.txt`)).toThrow(/grammar/);
    expect(() => assertSafeTextFileName('')).toThrow(/grammar/);
    expect(() => assertSafeTextFileName(undefined)).toThrow(/not-a-string/);
    expect(() => assertSafeTextFileName(123)).toThrow(/not-a-string/);
    expect(() => assertSafeTextFileName({ toString: () => 'notes.txt' })).toThrow(/not-a-string/);
  });
});

describe('isPathInside', () => {
  it('treats a directory as inside itself', () => {
    expect(isPathInside('/a/b', '/a/b')).toBe(true);
  });

  it('requires a separator boundary so a sibling prefix does not match', () => {
    expect(isPathInside('/a/b', '/a/bc')).toBe(false);
    expect(isPathInside('/a/b', '/a/b/c.txt')).toBe(true);
  });

  it('normalizes separators and case only on Windows', () => {
    const normalized = normalizeComparablePath('C:\\Users\\Test');
    if (process.platform === 'win32') {
      expect(normalized).toBe('c:/users/test');
      expect(isPathInside('C:\\a', 'c:\\A\\b.txt')).toBe(true);
    } else {
      expect(normalized).toBe('C:\\Users\\Test');
    }
  });
});

describe('resolveWithinRoot', () => {
  it('resolves a validated leaf inside the root', () => {
    const root = canonicalizeExistingDir(scratch);
    const resolved = resolveWithinRoot(root, 'notes.txt');
    expect(isPathInside(root, resolved)).toBe(true);
    expect(resolved.endsWith('notes.txt')).toBe(true);
  });

  it('rejects a relative root', () => {
    expect(() => resolveWithinRoot('relative/root', 'notes.txt')).toThrow(/root-not-absolute/);
  });

  it('rejects a leaf that escapes the root', () => {
    const root = canonicalizeExistingDir(scratch);
    expect(() => resolveWithinRoot(root, '../escaped.txt')).toThrow(/escapes-root/);
  });
});

describe('assertRegularFileInside', () => {
  const expectedDir = join(scratch, 'expected');
  const outsideDir = join(scratch, 'outside');

  mkdirSync(expectedDir, { recursive: true });
  mkdirSync(outsideDir, { recursive: true });
  writeFileSync(join(expectedDir, 'real.exe'), 'binary', 'utf8');
  writeFileSync(join(outsideDir, 'evil.exe'), 'binary', 'utf8');

  it('accepts a regular file inside the expected directory', () => {
    const resolved = assertRegularFileInside(expectedDir, join(expectedDir, 'real.exe'));
    expect(resolved.endsWith('real.exe')).toBe(true);
  });

  it('rejects a missing file', () => {
    expect(() => assertRegularFileInside(expectedDir, join(expectedDir, 'absent.exe'))).toThrow(/not-found/);
  });

  it('rejects a directory', () => {
    expect(() => assertRegularFileInside(scratch, expectedDir)).toThrow(/not-a-regular-file/);
  });

  it('rejects a relative candidate', () => {
    expect(() => assertRegularFileInside(expectedDir, 'real.exe')).toThrow(/candidate-not-absolute/);
  });

  it('rejects a symbolic link even when it points inside the expected directory', () => {
    const linkPath = join(expectedDir, 'link.exe');
    try {
      symlinkSync(join(expectedDir, 'real.exe'), linkPath, 'file');
    } catch {
      // Creating symlinks on Windows needs privilege or developer mode. The
      // lstat guard is exercised by the escaping-link case below on platforms
      // where links can be created at all.
      return;
    }
    expect(() => assertRegularFileInside(expectedDir, linkPath)).toThrow(/symlink/);
  });

  it('rejects a link whose real target escapes the expected directory', () => {
    const linkPath = join(expectedDir, 'escape.exe');
    try {
      symlinkSync(join(outsideDir, 'evil.exe'), linkPath, 'file');
    } catch {
      return;
    }
    // Caught as a symlink first; the realpath containment check is the second
    // line of defence for reparse mechanisms lstat does not flag.
    expect(() => assertRegularFileInside(expectedDir, linkPath)).toThrow(MorpheusPathError);
  });
});
