import { describe, expect, it } from 'vitest';

import {
  PARAM_LIMITS,
  WRITABLE_EXTENSIONS,
  type MorpheusParamDescriptor,
  validateParam,
  validateParams,
} from '@shared/morpheus/capabilities/params';
import { MORPHEUS_ACTIONS } from '@shared/morpheus/actions/registry';

function ok(kind: Parameters<typeof validateParam>[0], value: unknown) {
  return validateParam(kind, value).ok;
}

describe('parameter kinds reject what they must', () => {
  it('file names cannot traverse, escape, or name a device', () => {
    for (const bad of [
      '../evil.txt', '..\\evil.txt', 'a/b.txt', 'a\\b.txt',
      'C:\\Windows\\System32\\evil.txt', '/etc/passwd',
      'notes.txt:stream.txt', 'CON.txt', 'NUL', 'PRN.txt', 'COM1.txt', 'LPT9.txt',
      'trailing.txt.', 'trailing ', '.hidden.txt', '', 'a'.repeat(300) + '.txt',
    ]) {
      expect(ok('textFileName', bad), `textFileName should reject ${JSON.stringify(bad)}`).toBe(false);
    }
    expect(ok('textFileName', 'notes.txt')).toBe(true);
    expect(ok('textFileName', 'report-2026_01.txt')).toBe(true);
  });

  it('textFileName accepts only .txt', () => {
    expect(ok('textFileName', 'a.md')).toBe(false);
    expect(ok('textFileName', 'a.exe')).toBe(false);
  });

  it('fileName refuses executable and script extensions', () => {
    // Writing a .ps1/.bat and then launching it would reconstruct arbitrary
    // shell execution out of two individually-innocent capabilities.
    for (const bad of ['run.ps1', 'run.bat', 'run.cmd', 'run.exe', 'run.com', 'run.vbs', 'run.js', 'run.sh', 'noext']) {
      expect(ok('fileName', bad), `fileName should reject ${bad}`).toBe(false);
    }
    for (const extension of WRITABLE_EXTENSIONS) {
      expect(ok('fileName', `notes${extension}`), `fileName should accept ${extension}`).toBe(true);
    }
  });

  it('relative paths stay relative and never traverse', () => {
    for (const bad of [
      '..', '../x', 'a/../../b', 'a\\..\\..\\b', '/abs/x', '\\abs\\x',
      'C:\\abs\\x', 'c:/abs/x', '', 'a/b/CON', 'a/b:stream',
    ]) {
      expect(ok('relativePath', bad), `relativePath should reject ${JSON.stringify(bad)}`).toBe(false);
    }
    expect(ok('relativePath', 'reports/2026/q1.md')).toBe(true);
    expect(ok('relativePath', 'reports\\2026\\q1.md')).toBe(true);
  });

  it('urls are http(s) only', () => {
    // `file:` and `javascript:` are how an "open a link" capability turns into
    // local file access or code execution.
    for (const bad of [
      'file:///C:/Windows/System32/config/SAM',
      'javascript:alert(1)',
      'data:text/html,<script>x</script>',
      'vbscript:msgbox',
      'ms-settings:privacy',
      'not a url',
      '',
    ]) {
      expect(ok('httpUrl', bad), `httpUrl should reject ${bad}`).toBe(false);
    }
    expect(ok('httpUrl', 'https://example.com/a?b=c')).toBe(true);
    expect(ok('httpUrl', 'http://localhost:3000')).toBe(true);
  });

  it('keys cannot carry path or shell syntax', () => {
    for (const bad of ['../notepad', 'C:\\notepad.exe', 'notepad;calc', 'Notepad', 'notepad exe', '']) {
      expect(ok('applicationKey', bad), `applicationKey should reject ${bad}`).toBe(false);
    }
    expect(ok('applicationKey', 'notepad')).toBe(true);
  });

  it('bounded kinds enforce their bounds', () => {
    expect(ok('textContent', 'x'.repeat(PARAM_LIMITS.textContentBytes))).toBe(true);
    expect(ok('textContent', 'x'.repeat(PARAM_LIMITS.textContentBytes + 1))).toBe(false);
    // Multi-byte content is measured in bytes, not code units.
    expect(ok('textContent', '😀'.repeat(PARAM_LIMITS.textContentBytes / 4))).toBe(true);
    expect(ok('textContent', '\uD800')).toBe(false);

    expect(ok('shortText', 'line one\nline two')).toBe(false);
    expect(ok('query', '   ')).toBe(false);

    expect(ok('count', 0)).toBe(false);
    expect(ok('count', 1.5)).toBe(false);
    expect(ok('count', PARAM_LIMITS.maxResults + 1)).toBe(false);
    expect(ok('count', 10)).toBe(true);

    expect(ok('flag', 'true')).toBe(false);
    expect(ok('flag', true)).toBe(true);
  });

  it('type confusion is rejected rather than coerced', () => {
    for (const value of [1, true, null, {}, ['a'], undefined]) {
      expect(ok('textFileName', value)).toBe(false);
      expect(ok('applicationKey', value)).toBe(false);
    }
  });
});

describe('validateParams', () => {
  const descriptors: readonly MorpheusParamDescriptor[] = [
    { key: 'fileName', kind: 'textFileName', required: true },
    { key: 'content', kind: 'textContent', required: true },
    { key: 'overwrite', kind: 'flag', required: false },
  ];

  it('accepts a valid object and returns only declared keys', () => {
    const result = validateParams(descriptors, { fileName: 'a.txt', content: 'hi' });
    expect(result).toEqual({ ok: true, params: { fileName: 'a.txt', content: 'hi' } });
  });

  it('REJECTS unknown keys rather than ignoring them', () => {
    const result = validateParams(descriptors, { fileName: 'a.txt', content: 'hi', shell: 'cmd.exe' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContainEqual({ key: 'shell', reason: 'is not a parameter of this capability' });
    }
  });

  it('reports every problem at once rather than only the first', () => {
    const result = validateParams(descriptors, { fileName: '../x.txt', extra: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.key).sort()).toEqual(['content', 'extra', 'fileName']);
    }
  });

  it('treats a missing optional as absent and a missing required as an error', () => {
    expect(validateParams(descriptors, { fileName: 'a.txt', content: 'hi' }).ok).toBe(true);
    const result = validateParams(descriptors, { fileName: 'a.txt' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual([{ key: 'content', reason: 'is required' }]);
  });

  it('rejects a non-object payload', () => {
    for (const payload of ['x', 42, [], null]) {
      expect(validateParams(descriptors, payload).ok).toBe(false);
    }
    // No descriptors + no params is the parameterless capability case.
    expect(validateParams([], undefined)).toEqual({ ok: true, params: {} });
  });

  it('does not let prototype keys through', () => {
    const result = validateParams(descriptors, JSON.parse('{"__proto__":{"polluted":true},"fileName":"a.txt","content":"hi"}'));
    expect(result.ok).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('registry descriptors are self-consistent', () => {
  it('every declared parameter uses a kind the validator implements', () => {
    for (const action of Object.values(MORPHEUS_ACTIONS)) {
      for (const descriptor of action.params) {
        // An unimplemented kind falls through to the exhaustive default.
        const result = validateParam(descriptor.kind, Symbol('never') as never);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.reason, `${action.id}.${descriptor.key}`).not.toMatch(/unhandled parameter kind/);
        }
      }
    }
  });

  it('no capability declares duplicate parameter keys', () => {
    for (const action of Object.values(MORPHEUS_ACTIONS)) {
      const keys = action.params.map((descriptor) => descriptor.key);
      expect(new Set(keys).size, action.id).toBe(keys.length);
    }
  });
});
