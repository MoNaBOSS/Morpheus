import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Guards the provider-replaceability invariant from
 * `harness/specs/rules/morpheus-native-action-safety.md`.
 *
 * The Morpheus action runtime is a product capability in its own right, not an
 * agent tool surface. If it grows a dependency on the Gateway or the ACP
 * services, swapping the agent runtime stops being possible without touching
 * native actions. A static import check is the cheapest durable enforcement.
 */

const REPO_ROOT = join(__dirname, '..', '..');

const GUARDED_ROOTS = [
  join(REPO_ROOT, 'electron', 'services', 'morpheus'),
  join(REPO_ROOT, 'shared', 'morpheus'),
];

const GUARDED_FILES = [
  join(REPO_ROOT, 'electron', 'utils', 'morpheus-path-guard.ts'),
  join(REPO_ROOT, 'electron', 'services', 'morpheus-api.ts'),
];

const FORBIDDEN_IMPORT_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'gateway modules', pattern: /from\s+['"][^'"]*\/gateway\/[^'"]*['"]/ },
  { label: 'ACP services', pattern: /from\s+['"][^'"]*acp-[^'"]*['"]/ },
  { label: 'OpenClaw utilities', pattern: /from\s+['"][^'"]*openclaw[^'"]*['"]/ },
];

function collectSources(target: string): string[] {
  let stats;
  try {
    stats = statSync(target);
  } catch {
    return [];
  }
  if (stats.isFile()) return target.endsWith('.ts') ? [target] : [];

  const out: string[] = [];
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    const child = join(target, entry.name);
    if (entry.isDirectory()) out.push(...collectSources(child));
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(child);
  }
  return out;
}

const sources = [...GUARDED_ROOTS, ...GUARDED_FILES].flatMap(collectSources);

describe('morpheus runtime isolation', () => {
  it('finds the modules it is meant to guard', () => {
    // A silent zero-file glob would make every assertion below vacuous.
    expect(sources.length).toBeGreaterThanOrEqual(8);
  });

  it('does not import Gateway, ACP or OpenClaw modules', () => {
    const violations: string[] = [];
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      for (const { label, pattern } of FORBIDDEN_IMPORT_PATTERNS) {
        if (pattern.test(text)) {
          violations.push(`${relative(REPO_ROOT, file).replace(/\\/g, '/')} imports ${label}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps the shared registry free of Electron and Node built-ins', () => {
    // `shared/**` is imported by the Renderer; an `electron` or `node:` import
    // there breaks the web build rather than failing a test at runtime.
    for (const file of collectSources(join(REPO_ROOT, 'shared', 'morpheus'))) {
      const text = readFileSync(file, 'utf8');
      expect(text, `${file} must not import electron`).not.toMatch(/from\s+['"]electron['"]/);
      expect(text, `${file} must not import a node built-in`).not.toMatch(/from\s+['"]node:/);
    }
  });

  it('never spawns through a shell', () => {
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      expect(text, `${file} must not enable shell execution`).not.toMatch(/shell:\s*true/);
      expect(text, `${file} must not use exec/execSync`).not.toMatch(/\b(execSync|execFileSync)\s*\(/);
    }
  });
});
