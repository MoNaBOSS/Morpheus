// @vitest-environment node
import * as fs from 'node:fs';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

type AfterPackTestHooks = {
  cleanupUnnecessaryFiles: (dir: string) => number;
  cleanupNativePlatformPackages: (nodeModulesDir: string, platform: string, arch: string) => number;
  cleanupNodeModulesRuntimeJunk: (nodeModulesDir: string, platform: string, arch: string) => number;
};

const afterPack = require('../../scripts/after-pack.cjs') as { __test?: AfterPackTestHooks };
const noticeGuards = require('../../scripts/package-notice-guards.cjs');

// Execute the production cleanup functions without running the full bundler,
// which copies the installed runtime and dependencies before reaching cleanup.
function cleanupBundleFixture(dir: string): number {
  const source = readFileSync(join(process.cwd(), 'scripts/bundle-openclaw.mjs'), 'utf8');
  const start = source.indexOf('function rmSafe(target)');
  const end = source.indexOf('\necho``;', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return runInNewContext(`${source.slice(start, end)}\ncleanupBundle(fixtureDir);`, {
    fs, path, fixtureDir: dir, ...noticeGuards,
  }) as number;
}

describe('after-pack cleanup helpers', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function makeTempNodeModules(): string {
    const root = mkdtempSync(join(tmpdir(), 'clawx-after-pack-'));
    tempRoots.push(root);
    const nodeModules = join(root, 'node_modules');
    mkdirSync(nodeModules, { recursive: true });
    return nodeModules;
  }

  function makePackage(dir: string): void {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), '{"version":"1.0.0"}\n', 'utf8');
  }

  it('retains notice assets through bundling and after-pack while pruning ordinary docs', () => {
    const nodeModules = makeTempNodeModules();
    const root = path.dirname(nodeModules);
    const retained = [
      'LICENSE.md', 'LiCeNsE.MaRkDoWn', 'NOTICE.markdown', 'COPYING.LESSER',
      'COPYRIGHT.MD', 'THIRD_PARTY_NOTICES.markdown', 'LICENSE-MIT',
      'docs/legal/NOTICE.MaRkDoWn', 'tests/LICENSE.md',
    ];
    const locations = [
      join(nodeModules, 'notice-fixture'),
      join(root, 'dist/extensions/fixture'),
      join(root, 'dist/extensions/fixture/node_modules/nested-fixture'),
    ];
    for (const location of locations) {
      for (const name of [...retained, 'README.md', 'guide.markdown', 'index.js.map', 'tests/test.js', 'docs/guide.md']) {
        mkdirSync(path.dirname(join(location, name)), { recursive: true });
        writeFileSync(join(location, name), `fixture:${name}\n`, 'utf8');
      }
    }
    cleanupBundleFixture(root);
    afterPack.__test!.cleanupUnnecessaryFiles(root);
    for (const location of locations) {
      for (const name of retained) {
        expect(readFileSync(join(location, name), 'utf8')).toBe(`fixture:${name}\n`);
      }
      expect(existsSync(join(location, 'README.md'))).toBe(false);
      expect(existsSync(join(location, 'index.js.map'))).toBe(false);
      expect(existsSync(join(location, 'guide.markdown'))).toBe(false);
      expect(existsSync(join(location, 'tests/test.js'))).toBe(false);
    }
    expect(existsSync(join(locations[0], 'docs/guide.md'))).toBe(false);
  });

  it('keeps both mac Codex native packages for universal builds', () => {
    const nodeModules = makeTempNodeModules();
    makePackage(join(nodeModules, '@openai', 'codex-darwin-arm64'));
    makePackage(join(nodeModules, '@openai', 'codex-darwin-x64'));
    makePackage(join(nodeModules, '@openai', 'codex-linux-x64'));

    afterPack.__test!.cleanupNativePlatformPackages(nodeModules, 'darwin', 'universal');

    expect(existsSync(join(nodeModules, '@openai', 'codex-darwin-arm64'))).toBe(true);
    expect(existsSync(join(nodeModules, '@openai', 'codex-darwin-x64'))).toBe(true);
    expect(existsSync(join(nodeModules, '@openai', 'codex-linux-x64'))).toBe(false);
  });

  it('keeps both mac tree-sitter-bash prebuilds for universal builds', () => {
    const nodeModules = makeTempNodeModules();
    const prebuilds = join(nodeModules, 'tree-sitter-bash', 'prebuilds');
    mkdirSync(join(prebuilds, 'darwin-arm64'), { recursive: true });
    mkdirSync(join(prebuilds, 'darwin-x64'), { recursive: true });
    mkdirSync(join(prebuilds, 'linux-x64'), { recursive: true });

    afterPack.__test!.cleanupNodeModulesRuntimeJunk(nodeModules, 'darwin', 'universal');

    expect(existsSync(join(prebuilds, 'darwin-arm64'))).toBe(true);
    expect(existsSync(join(prebuilds, 'darwin-x64'))).toBe(true);
    expect(existsSync(join(prebuilds, 'linux-x64'))).toBe(false);
  });
});
