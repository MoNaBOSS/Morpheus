import { describe, expect, it } from 'vitest';

import {
  MORPHEUS_ACTIONS,
  MORPHEUS_APPLICATIONS,
  MORPHEUS_MAX_TEXT_BYTES,
  MORPHEUS_TEXT_FILE_NAME_PATTERN,
  getMorpheusActionDescriptor,
  isMorpheusActionId,
  isMorpheusActionSupportedOn,
  isMorpheusApplicationKey,
  listMorpheusActionIds,
  listMorpheusApplicationKeys,
} from '@shared/morpheus/actions/registry';

const ABSOLUTE_PATH_RE = /^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/;

describe('morpheus action registry', () => {
  it('is frozen so a compromised Renderer cannot mutate policy at runtime', () => {
    expect(Object.isFrozen(MORPHEUS_ACTIONS)).toBe(true);
    expect(Object.isFrozen(MORPHEUS_APPLICATIONS)).toBe(true);
    for (const descriptor of Object.values(MORPHEUS_ACTIONS)) {
      expect(Object.isFrozen(descriptor)).toBe(true);
      expect(Object.isFrozen(descriptor.platforms)).toBe(true);
      expect(Object.isFrozen(descriptor.params)).toBe(true);
    }
    for (const entry of Object.values(MORPHEUS_APPLICATIONS)) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.args)).toBe(true);
    }
  });

  it('keys every descriptor by its own id', () => {
    for (const [key, descriptor] of Object.entries(MORPHEUS_ACTIONS)) {
      expect(descriptor.id).toBe(key);
    }
    for (const [key, entry] of Object.entries(MORPHEUS_APPLICATIONS)) {
      expect(entry.key).toBe(key);
    }
  });

  it('declares at least one supported platform per action', () => {
    for (const descriptor of Object.values(MORPHEUS_ACTIONS)) {
      expect(descriptor.platforms.length).toBeGreaterThan(0);
    }
  });

  it('never embeds an absolute path or a shell string in an application entry', () => {
    for (const entry of Object.values(MORPHEUS_APPLICATIONS)) {
      expect(entry.fileName).not.toMatch(ABSOLUTE_PATH_RE);
      expect(entry.fileName).not.toMatch(/[\\/]/);
      expect(entry.relativeDir).not.toMatch(ABSOLUTE_PATH_RE);
      // Arguments are fixed registry data; nothing renderer-influenced belongs here.
      expect(entry.args).toEqual([]);
      // `base` names a trusted environment value; the path is derived in Main.
      expect(entry.base).toBe('systemRoot');
    }
  });

  it('resolves ids by exact match only', () => {
    expect(isMorpheusActionId('system.report')).toBe(true);
    expect(isMorpheusActionId('System.Report')).toBe(false);
    expect(isMorpheusActionId(' system.report')).toBe(false);
    expect(isMorpheusActionId('system.report ')).toBe(false);
    expect(isMorpheusActionId('toString')).toBe(false);
    expect(isMorpheusActionId('constructor')).toBe(false);
    expect(isMorpheusActionId('__proto__')).toBe(false);
    expect(isMorpheusActionId(undefined)).toBe(false);
    expect(isMorpheusActionId(42)).toBe(false);
  });

  it('resolves application keys by exact match only', () => {
    expect(isMorpheusApplicationKey('notepad')).toBe(true);
    expect(isMorpheusApplicationKey('NOTEPAD')).toBe(false);
    expect(isMorpheusApplicationKey('notepad.exe')).toBe(false);
    expect(isMorpheusApplicationKey('constructor')).toBe(false);
  });

  it('reports platform support without throwing for unsupported platforms', () => {
    expect(isMorpheusActionSupportedOn('app.launch', 'win32')).toBe(true);
    expect(isMorpheusActionSupportedOn('app.launch', 'linux')).toBe(false);
    expect(isMorpheusActionSupportedOn('app.launch', 'darwin')).toBe(false);
  });

  it('enumerates ids and keys', () => {
    // Asserts the INVARIANT rather than a frozen list: the enumeration must
    // cover the registry exactly. Pinning the literal set would break on every
    // capability addition without catching anything a mismatch would not.
    expect([...listMorpheusActionIds()].sort()).toEqual(Object.keys(MORPHEUS_ACTIONS).sort());
    expect(listMorpheusActionIds()).toContain('app.launch');
    expect(listMorpheusActionIds()).toContain('file.createText');
    expect(listMorpheusActionIds()).toContain('file.create');
    expect(listMorpheusActionIds()).toContain('site.verify');
    expect(listMorpheusActionIds()).toContain('system.report');
    expect([...listMorpheusApplicationKeys()].sort())
      .toEqual(Object.keys(MORPHEUS_APPLICATIONS).sort());
    expect(listMorpheusApplicationKeys()).toContain('notepad');
  });

  it('declares required parameters for the parameterised actions', () => {
    expect(getMorpheusActionDescriptor('system.report').params).toEqual([]);
    expect(getMorpheusActionDescriptor('app.launch').params.map((p) => p.key)).toEqual(['applicationKey']);
    expect(getMorpheusActionDescriptor('file.createText').params.map((p) => p.key)).toEqual(['fileName', 'content']);
    expect(getMorpheusActionDescriptor('file.createText').rootKey).toBe('morpheusFiles');
    expect(getMorpheusActionDescriptor('file.create').params.map((p) => p.kind))
      .toEqual(['writableRelativePath', 'textContent']);
    expect(getMorpheusActionDescriptor('site.verify')).toMatchObject({
      rootKey: 'morpheusFiles',
      group: 'workspace.read',
      riskTier: 'medium',
    });
  });

  it('constrains text file names to a traversal-proof grammar', () => {
    for (const accepted of ['notes.txt', 'a.txt', 'run-01_final.txt', 'A1.txt']) {
      expect(MORPHEUS_TEXT_FILE_NAME_PATTERN.test(accepted)).toBe(true);
    }
    for (const rejected of [
      '../notes.txt',
      '..\\notes.txt',
      'a/b.txt',
      'a\\b.txt',
      'notes.txt:stream',
      'notes:stream.txt',
      '.hidden.txt',
      '-leading.txt',
      'notes.exe',
      'notes',
      'notes.txt.',
      `${'a'.repeat(80)}.txt`,
    ]) {
      expect(MORPHEUS_TEXT_FILE_NAME_PATTERN.test(rejected)).toBe(false);
    }
  });

  it('bounds text payload size', () => {
    expect(MORPHEUS_MAX_TEXT_BYTES).toBe(65536);
  });
});
