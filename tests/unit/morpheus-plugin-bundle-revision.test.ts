// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { needsPluginBundleRefresh } from '../../electron/utils/plugin-bundle-revision';
// @ts-expect-error Native ESM packaging helper has no TS declaration.
import { stampPluginBundleRevision } from '../../scripts/plugin-bundle-revision.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('managed plugin dependency revisions', () => {
  it('refreshes an old same-version mirror once, preserves upstream identity and notices lockfile changes', () => {
    const root = mkdtempSync(join(tmpdir(), 'morpheus-plugin-revision-'));
    roots.push(root);
    const source = join(root, 'source');
    const target = join(root, 'target');
    mkdirSync(source); mkdirSync(target);
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.0.3' }));
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'image-size: 2.0.2\npatch: original\n');
    for (const dir of [source, target]) writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'plugin', version: '2026.7.9' }));
    expect(needsPluginBundleRefresh(source, target)).toBe(false);
    const revision = stampPluginBundleRevision(source, root);
    expect(needsPluginBundleRefresh(source, target)).toBe(true);
    const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
    expect(manifest).toMatchObject({ name: 'plugin', version: '2026.7.9', morpheusBundleRevision: revision });
    writeFileSync(join(target, 'package.json'), JSON.stringify(manifest));
    expect(needsPluginBundleRefresh(source, target)).toBe(false);
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'image-size: 2.0.2\r\npatch: original\r\n');
    expect(stampPluginBundleRevision(source, root)).toBe(revision);
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'image-size: 2.0.2\npatch: updated\n');
    expect(stampPluginBundleRevision(source, root)).not.toBe(revision);
    expect(needsPluginBundleRefresh(source, target)).toBe(true);
    writeFileSync(join(source, 'package.json'), '{"morpheusBundleRevision":"untrusted/path"}');
    expect(needsPluginBundleRefresh(source, target)).toBe(false);
  });
});
