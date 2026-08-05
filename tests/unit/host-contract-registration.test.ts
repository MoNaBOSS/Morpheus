import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Structural guard for a gap that produces no compile error.
 *
 * `HostServiceRegistry` (electron/main/ipc/host-contract.ts) is a *Partial*
 * mapped type, while `CompleteHostServiceRegistry` is total. Adding a module to
 * `HostApiContract` and forgetting to pass it to `registerCoreServices`
 * therefore type-checks cleanly and fails only at runtime, as an `UNSUPPORTED`
 * host response.
 *
 * Comparing the declared contract modules against the registration call site is
 * the cheapest durable check, and it protects every future module rather than
 * just the one that prompted it.
 */

const REPO_ROOT = join(__dirname, '..', '..');

function readSource(relativePath: string): string {
  return readFileSync(join(REPO_ROOT, relativePath), 'utf8');
}

/** Top-level keys of the `HostApiContract` object type. */
function declaredContractModules(): string[] {
  const source = readSource('shared/host-api/contract.ts');
  const start = source.indexOf('export type HostApiContract = {');
  expect(start, 'HostApiContract declaration not found').toBeGreaterThan(-1);

  const body = source.slice(start);
  const modules: string[] = [];
  let depth = 0;

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trimEnd();
    if (depth === 1) {
      const match = /^ {2}(?:\/\*\*.*)?([A-Za-z][A-Za-z0-9_]*)\s*:\s*\{\s*$/.exec(line);
      if (match) modules.push(match[1]);
    }
    depth += (line.match(/\{/g) ?? []).length;
    depth -= (line.match(/\}/g) ?? []).length;
    if (depth <= 0 && modules.length > 0) break;
  }
  return modules;
}

/** Keys passed to `hostApiRegistry.registerCoreServices({ ... })`. */
function registeredModules(): string[] {
  const source = readSource('electron/main/ipc-handlers.ts');
  const start = source.indexOf('hostApiRegistry.registerCoreServices({');
  expect(start, 'registerCoreServices call not found').toBeGreaterThan(-1);

  const body = source.slice(start, source.indexOf('});', start));
  return [...body.matchAll(/^ {4}([A-Za-z][A-Za-z0-9_]*)\s*:/gm)].map((match) => match[1]);
}

describe('host API contract registration', () => {
  it('parses a plausible module list from both sides', () => {
    // A regex that silently matches nothing would make the comparison vacuous.
    expect(declaredContractModules().length).toBeGreaterThan(15);
    expect(registeredModules().length).toBeGreaterThan(15);
  });

  it('registers every module declared in HostApiContract', () => {
    const declared = declaredContractModules();
    const registered = new Set(registeredModules());
    const missing = declared.filter((module) => !registered.has(module));

    // `diagnostics` is contributed by a built-in extension rather than by
    // registerCoreServices, so it is expected to be absent here.
    expect(missing).toEqual(['diagnostics']);
  });

  it('registers the morpheus module', () => {
    expect(registeredModules()).toContain('morpheus');
    expect(declaredContractModules()).toContain('morpheus');
  });

  it('wires morpheus events through the shared channel registry, not a literal', () => {
    const source = readSource('electron/main/ipc-handlers.ts');
    expect(source).toContain('HOST_EVENT_CHANNELS.morpheus.actionEvent');
    // A hardcoded channel string would drift from the preload allowlist, which
    // is derived from HOST_EVENT_CHANNELS.
    expect(source).not.toContain("'morpheus:action-event'");
  });

  it('adds nothing to the legacy preload channel allowlist', () => {
    const preload = readSource('electron/preload/index.ts');
    expect(preload).not.toContain('morpheus');
  });
});
