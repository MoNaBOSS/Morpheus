// @vitest-environment node
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error Native ESM packaging helper has no TS declaration.
import { patchBundledPluginDependencies } from '../../scripts/patch-bundled-plugin-dependencies.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function json(file: string, value: unknown) { writeFileSync(file, JSON.stringify(value)); }
function pkg(dir: string, name: string, version: string, dependencies = {}) {
  mkdirSync(dir, { recursive: true });
  json(join(dir, 'package.json'), { name, version, dependencies, main: 'index.js' });
  writeFileSync(join(dir, 'index.js'), `module.exports = '${version}'`);
  writeFileSync(join(dir, 'LICENSE'), 'Retained upstream license');
}
function fixture(name = 'undici', from = '8.5.0', to = '8.10.2') {
  const root = mkdtempSync(join(tmpdir(), 'morpheus-plugin-backport-')); roots.push(root);
  const plugin = join(root, 'build', 'plugin');
  const target = join(plugin, 'node_modules', name);
  const source = join(root, 'node_modules', name);
  pkg(plugin, 'fixture-plugin', '2026.7.1');
  json(join(plugin, 'openclaw.plugin.json'), { id: 'fixture' });
  json(join(root, 'package.json'), { pnpm: { overrides: { [`${name}@^${to.split('.')[0]}.0.0`]: to } } });
  pkg(target, name, from); pkg(source, name, to);
  return { root, plugin, target, source };
}
describe('embedded plugin dependency backports', () => {
  it('replaces embedded old bytes with locked bytes and notices, preserving plugin identity and source', () => {
    const f = fixture();
    writeFileSync(join(f.target, 'obsolete.js'), 'old code');
    expect(patchBundledPluginDependencies(f.plugin, f.root)).toMatchObject([{ name: 'undici', from: '8.5.0', to: '8.10.2' }]);
    expect(readFileSync(join(f.target, 'index.js'), 'utf8')).toContain('8.10.2');
    expect(readFileSync(join(f.target, 'LICENSE'), 'utf8')).toBe('Retained upstream license');
    expect(existsSync(join(f.target, 'obsolete.js'))).toBe(false);
    expect(JSON.parse(readFileSync(join(f.plugin, 'package.json'), 'utf8'))).toMatchObject({ version: '2026.7.1', morpheusBundledOverrides: { undici: '8.10.2' } });
    expect(patchBundledPluginDependencies(f.plugin, f.root)).toEqual([]);
    expect(JSON.parse(readFileSync(join(f.source, 'package.json'), 'utf8')).version).toBe('8.10.2');
  });
  it.each([['ws', '8.21.0', '8.21.3'], ['protobufjs', '7.6.3', '7.6.5']])('backports the reviewed %s major', (name, from, to) => {
    const f = fixture(name, from, to);
    expect(patchBundledPluginDependencies(f.plugin, f.root)).toHaveLength(1);
    expect(JSON.parse(readFileSync(join(f.target, 'package.json'), 'utf8')).version).toBe(to);
  });
  it('refuses a missing or mismatched locked source before replacing bytes', () => {
    const f = fixture(); pkg(f.source, 'undici', '8.8.0');
    expect(() => patchBundledPluginDependencies(f.plugin, f.root)).toThrow('Locked replacement mismatch');
    expect(readFileSync(join(f.target, 'index.js'), 'utf8')).toContain('8.5.0');
  });
  it('refuses a changed runtime graph instead of producing an incomplete bundle', () => {
    const f = fixture('protobufjs', '7.6.3', '7.6.5');
    pkg(f.source, 'protobufjs', '7.6.5', { unexpected: '^1.0.0' });
    expect(() => patchBundledPluginDependencies(f.plugin, f.root)).toThrow('Changed dependency requires review');
    expect(readFileSync(join(f.target, 'index.js'), 'utf8')).toContain('7.6.3');
  });
  it('allows unchanged resolvable runtime dependencies and removal of obsolete declarations', () => {
    const f = fixture('protobufjs', '7.6.3', '7.6.5');
    pkg(f.target, 'protobufjs', '7.6.3', { dep: '^1.0.0', removed: '^1.0.0' });
    pkg(f.source, 'protobufjs', '7.6.5', { dep: '^1.0.0' });
    pkg(join(f.plugin, 'node_modules', 'dep'), 'dep', '1.0.0');
    expect(patchBundledPluginDependencies(f.plugin, f.root)).toHaveLength(1);
  });
  it('refuses nested closures rather than losing them during replacement', () => {
    const f = fixture(); mkdirSync(join(f.target, 'node_modules'));
    expect(() => patchBundledPluginDependencies(f.plugin, f.root)).toThrow('Nested dependency closure needs review');
  });
  it('never patches installed source trees or crosses an unreviewed major', () => {
    const f = fixture('undici', '7.29.1', '8.10.2');
    expect(patchBundledPluginDependencies(f.plugin, f.root)).toEqual([]);
    expect(() => patchBundledPluginDependencies(join(f.root, 'node_modules'), f.root)).toThrow('Refusing to patch installed');
  });
  it('runs the same fail-closed backport in both bundle paths before revision stamping', () => {
    for (const name of ['bundle-openclaw-plugins.mjs', 'after-pack.cjs']) {
      const text = readFileSync(join(process.cwd(), 'scripts', name), 'utf8');
      const call = text.indexOf('= patchBundledPluginDependencies(');
      expect(call).toBeGreaterThan(-1);
      expect(text.indexOf('stampPluginBundleRevision(', call)).toBeGreaterThan(call);
    }
  });
});
