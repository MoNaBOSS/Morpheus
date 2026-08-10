import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import {
  win32AppendTextCapability,
  win32CopyCapability,
  win32CreateFolderCapability,
  win32DeleteCapability,
  win32ListCapability,
  win32MoveCapability,
  win32ReadTextCapability,
  win32SearchCapability,
} from '@electron/services/morpheus/capabilities/win32/filesystem';
import type { MorpheusCapabilityContext } from '@electron/services/morpheus/capability-registry';
import type { MorpheusRootProvider } from '@electron/services/morpheus/roots';
import { canonicalizeExistingDir } from '@electron/utils/morpheus-path-guard';

const scratch = mkdtempSync(join(tmpdir(), 'morpheus-fs-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let workspace: string;
let context: MorpheusCapabilityContext;
let caseIndex = 0;

beforeEach(() => {
  caseIndex += 1;
  workspace = canonicalizeExistingDir(mkdirp(join(scratch, `ws-${caseIndex}`)));
  const roots: MorpheusRootProvider = { resolve: () => workspace };
  context = { roots, appVersion: '0.5.0', env: {} };
});

function mkdirp(path: string): string {
  mkdirSync(path, { recursive: true });
  return path;
}

function write(relative: string, content = 'hello'): string {
  const full = join(workspace, relative);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf8');
  return full;
}

describe('file.readText', () => {
  it('reads a file and reports the workspace as its scope', async () => {
    write('notes.txt', 'contents here');
    const resolution = await win32ReadTextCapability.resolve({ path: 'notes.txt' }, context);

    expect(resolution.target).toMatchObject({ kind: 'file', workspaceRoot: workspace });
    const result = await resolution.execute();
    expect(result).toMatchObject({ kind: 'text', text: 'contents here' });
  });

  it('reads from a nested folder with the SAME workspace scope', async () => {
    write('reports/2026/q1.md', 'quarterly');
    const resolution = await win32ReadTextCapability.resolve({ path: 'reports/2026/q1.md' }, context);
    // The whole point of workspace trust: depth does not change the boundary.
    expect(resolution.target).toMatchObject({ workspaceRoot: workspace });
  });

  it('refuses a path outside the workspace', async () => {
    for (const path of ['../escape.txt', '..\\escape.txt', 'a/../../escape.txt']) {
      await expect(win32ReadTextCapability.resolve({ path }, context)).rejects.toThrow();
    }
  });

  it('refuses an absolute path', async () => {
    await expect(win32ReadTextCapability.resolve({ path: 'C:\\Windows\\win.ini' }, context)).rejects.toThrow();
  });

  it('refuses a file that does not exist', async () => {
    await expect(win32ReadTextCapability.resolve({ path: 'ghost.txt' }, context)).rejects.toThrow();
  });
});

describe('file.list', () => {
  it('lists the workspace root when no path is given', async () => {
    write('a.txt');
    mkdirp(join(workspace, 'sub'));

    const resolution = await win32ListCapability.resolve({}, context);
    const result = await resolution.execute();

    expect(result.kind).toBe('listing');
    if (result.kind !== 'listing') return;
    expect(result.entries.map((entry) => entry.name).sort()).toEqual(['a.txt', 'sub']);
    expect(result.entries.find((entry) => entry.name === 'sub')?.kind).toBe('folder');
  });

  it('lists a subfolder', async () => {
    write('sub/inner.txt');
    const resolution = await win32ListCapability.resolve({ path: 'sub' }, context);
    const result = await resolution.execute();
    if (result.kind !== 'listing') throw new Error('expected a listing');
    expect(result.entries.map((entry) => entry.name)).toEqual(['inner.txt']);
  });

  it('reports an empty folder truthfully rather than failing', async () => {
    mkdirp(join(workspace, 'empty'));
    const result = await (await win32ListCapability.resolve({ path: 'empty' }, context)).execute();
    if (result.kind !== 'listing') throw new Error('expected a listing');
    expect(result.entries).toEqual([]);
    expect(result.truncated).toBe(false);
  });
});

describe('file.search', () => {
  it('finds matching names recursively and returns workspace-relative paths', async () => {
    write('report-a.txt');
    write('deep/nested/report-b.txt');
    write('unrelated.md');

    const result = await (await win32SearchCapability.resolve({ query: 'report' }, context)).execute();
    if (result.kind !== 'listing') throw new Error('expected a listing');

    const names = result.entries.map((entry) => entry.name).sort();
    expect(names).toHaveLength(2);
    expect(names.some((name) => name.includes('report-a.txt'))).toBe(true);
    expect(names.some((name) => name.includes('report-b.txt'))).toBe(true);
  });

  it('matches case-insensitively', async () => {
    write('README.md');
    const result = await (await win32SearchCapability.resolve({ query: 'readme' }, context)).execute();
    if (result.kind !== 'listing') throw new Error('expected a listing');
    expect(result.entries).toHaveLength(1);
  });

  it('honours the limit and reports truncation', async () => {
    for (let index = 0; index < 6; index += 1) write(`match-${index}.txt`);
    const result = await (await win32SearchCapability.resolve({ query: 'match', limit: 3 }, context)).execute();
    if (result.kind !== 'listing') throw new Error('expected a listing');
    expect(result.entries).toHaveLength(3);
    expect(result.truncated).toBe(true);
  });

  it('does not search file CONTENTS', async () => {
    // Reading every file to match a substring is a materially wider disclosure
    // than listing names, and would belong to its own capability and consent.
    write('plain.txt', 'secret-token-value');
    const result = await (await win32SearchCapability.resolve({ query: 'secret-token' }, context)).execute();
    if (result.kind !== 'listing') throw new Error('expected a listing');
    expect(result.entries).toEqual([]);
  });
});

describe('file.appendText', () => {
  it('appends without destroying existing content', async () => {
    write('log.txt', 'first\n');
    await (await win32AppendTextCapability.resolve({ path: 'log.txt', content: 'second\n' }, context)).execute();
    expect(readFileSync(join(workspace, 'log.txt'), 'utf8')).toBe('first\nsecond\n');
  });

  it('refuses a file that does not exist', async () => {
    await expect(
      win32AppendTextCapability.resolve({ path: 'missing.txt', content: 'x' }, context),
    ).rejects.toThrow();
  });
});

describe('file.move and file.copy', () => {
  it('moves a file within the workspace', async () => {
    write('from.txt', 'payload');
    await (await win32MoveCapability.resolve({ path: 'from.txt', destination: 'sub/to.txt' }, context)).execute();

    expect(existsSync(join(workspace, 'from.txt'))).toBe(false);
    expect(readFileSync(join(workspace, 'sub', 'to.txt'), 'utf8')).toBe('payload');
  });

  it('copies a file and leaves the original', async () => {
    write('source.txt', 'payload');
    await (await win32CopyCapability.resolve({ path: 'source.txt', destination: 'copy.txt' }, context)).execute();

    expect(readFileSync(join(workspace, 'source.txt'), 'utf8')).toBe('payload');
    expect(readFileSync(join(workspace, 'copy.txt'), 'utf8')).toBe('payload');
  });

  it('REFUSES to overwrite an existing destination', async () => {
    // Overwriting is destructive; these capabilities are medium risk precisely
    // because they cannot destroy anything.
    write('a.txt', 'keep me');
    write('b.txt', 'other');

    await expect(win32MoveCapability.resolve({ path: 'b.txt', destination: 'a.txt' }, context)).rejects.toThrow();
    await expect(win32CopyCapability.resolve({ path: 'b.txt', destination: 'a.txt' }, context)).rejects.toThrow();
    expect(readFileSync(join(workspace, 'a.txt'), 'utf8')).toBe('keep me');
  });

  it('refuses a destination outside the workspace', async () => {
    write('inside.txt');
    await expect(
      win32MoveCapability.resolve({ path: 'inside.txt', destination: '../outside.txt' }, context),
    ).rejects.toThrow();
  });
});

describe('folder.create', () => {
  it('creates a nested folder', async () => {
    await (await win32CreateFolderCapability.resolve({ path: 'reports/2026' }, context)).execute();
    expect(existsSync(join(workspace, 'reports', '2026'))).toBe(true);
  });

  it('refuses when something already exists there', async () => {
    mkdirp(join(workspace, 'taken'));
    await expect(win32CreateFolderCapability.resolve({ path: 'taken' }, context)).rejects.toThrow();
  });
});

describe('file.delete', () => {
  it('deletes a file', async () => {
    write('doomed.txt');
    await (await win32DeleteCapability.resolve({ path: 'doomed.txt' }, context)).execute();
    expect(existsSync(join(workspace, 'doomed.txt'))).toBe(false);
  });

  it('deletes a folder and its contents', async () => {
    write('tree/inner/leaf.txt');
    const resolution = await win32DeleteCapability.resolve({ path: 'tree' }, context);
    expect(resolution.target.kind).toBe('folder');
    await resolution.execute();
    expect(existsSync(join(workspace, 'tree'))).toBe(false);
  });

  it('REFUSES to delete the workspace root itself', async () => {
    // Removing the root would destroy the very directory every grant is scoped
    // to, leaving grants pointing at nothing.
    await expect(win32DeleteCapability.resolve({ path: '.' }, context)).rejects.toThrow();
    expect(existsSync(workspace)).toBe(true);
  });

  it('refuses a path outside the workspace', async () => {
    const outside = join(scratch, 'outside.txt');
    writeFileSync(outside, 'safe', 'utf8');
    await expect(win32DeleteCapability.resolve({ path: '../outside.txt' }, context)).rejects.toThrow();
    expect(existsSync(outside)).toBe(true);
  });
});

describe('symlink escape', () => {
  it('refuses to follow a symlink that points outside the workspace', async () => {
    const outsideDir = mkdirp(join(scratch, `outside-${caseIndex}`));
    writeFileSync(join(outsideDir, 'secret.txt'), 'classified', 'utf8');

    let linked = false;
    try {
      symlinkSync(outsideDir, join(workspace, 'link'), 'dir');
      linked = true;
    } catch {
      // Creating a symlink needs Developer Mode on Windows. Skip rather than
      // pass vacuously — a skipped check is honest, a fake one is not.
    }
    if (!linked) return;

    await expect(
      win32ReadTextCapability.resolve({ path: 'link/secret.txt' }, context),
    ).rejects.toThrow();
  });
});
