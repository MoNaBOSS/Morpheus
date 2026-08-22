import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { win32VerifySiteCapability } from '@electron/services/morpheus/capabilities/win32/verify-site';
import type { MorpheusCapabilityContext } from '@electron/services/morpheus/capability-registry';
import type { MorpheusRootProvider } from '@electron/services/morpheus/roots';
import { canonicalizeExistingDir } from '@electron/utils/morpheus-path-guard';

const scratch = mkdtempSync(join(tmpdir(), 'morpheus-site-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let workspace: string;
let context: MorpheusCapabilityContext;
let caseIndex = 0;

function write(relative: string, content: string): void {
  const target = join(workspace, relative);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, content, 'utf8');
}

function validProject(path = 'projects/acme'): void {
  write(`${path}/index.html`, `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="styles.css"></head><body><main><h1>Acme</h1></main></body></html>`);
  write(`${path}/styles.css`, 'body { margin: 0; }\n@media (max-width: 700px) { main { padding: 1rem; } }');
  write(`${path}/analytics.json`, JSON.stringify({
    schema: 'morpheus.analytics.v1',
    events: ['page_view', 'primary_action'],
  }));
  write(`${path}/business-plan.md`, '# Acme\nA concise, truthful plan.');
  write(`${path}/30-day-plan.md`, '# First 30 days\nWeek 1: validate assumptions.');
}

beforeEach(() => {
  caseIndex += 1;
  const root = join(scratch, `workspace-${caseIndex}`);
  mkdirSync(root, { recursive: true });
  workspace = canonicalizeExistingDir(root);
  const roots: MorpheusRootProvider = { resolve: () => workspace };
  context = { roots, appVersion: '1.0.0', env: {} };
});

describe('site.verify', () => {
  it('can prepare a future project path and verifies it only after dependencies create it', async () => {
    const resolution = await win32VerifySiteCapability.resolve({ path: 'projects/acme' }, context);
    expect(resolution.target).toMatchObject({
      kind: 'folder', path: join(workspace, 'projects', 'acme'), workspaceRoot: workspace,
    });
    validProject();
    await expect(resolution.execute()).resolves.toMatchObject({ kind: 'website' });
  });

  it('creates a Main-authored manifest only after inspecting real project files', async () => {
    validProject();
    const resolution = await win32VerifySiteCapability.resolve({ path: 'projects/acme' }, context);
    expect(resolution.target).toMatchObject({ kind: 'folder', workspaceRoot: workspace });

    const result = await resolution.execute();
    expect(result.kind).toBe('website');
    if (result.kind !== 'website') return;
    expect(result.manifest).toMatchObject({
      v: 1,
      projectPath: join(workspace, 'projects', 'acme'),
      workspaceRoot: workspace,
      entryPath: join(workspace, 'projects', 'acme', 'index.html'),
      relativeEntryPath: 'projects/acme/index.html',
      fileCount: 5,
      checks: {
        entryDocument: true,
        viewportMetadata: true,
        responsiveStyles: true,
        localStylesheet: true,
        analyticsConfiguration: true,
        selfContained: true,
      },
    });
    expect(result.manifest.totalBytes).toBeGreaterThan(0);
  });

  it('rejects a claimed project that has no analytics-ready manifest', async () => {
    validProject('projects/incomplete');
    rmSync(join(workspace, 'projects', 'incomplete', 'analytics.json'));
    const resolution = await win32VerifySiteCapability.resolve({ path: 'projects/incomplete' }, context);
    await expect(resolution.execute()).rejects.toThrow(/analytics\.json/i);
  });

  it.each([
    ['split link attributes', '<link rel="stylesheet"><link href="styles.css">'],
    ['missing stylesheet target', '<link rel="stylesheet" href="missing.css">'],
  ])('requires one real local stylesheet link: %s', async (_label, link) => {
    validProject('projects/unlinked');
    write('projects/unlinked/index.html', `<!doctype html><html><head><meta name="viewport" content="width=device-width">${link}</head><body></body></html>`);
    const resolution = await win32VerifySiteCapability.resolve({ path: 'projects/unlinked' }, context);
    await expect(resolution.execute()).rejects.toThrow(/existing local stylesheet/i);
  });

  it.each([
    ['active script', '<script>alert(1)</script>'],
    ['remote resource', '<img src="https://tracker.example/pixel.png">'],
    ['embedded page', '<iframe src="about:blank"></iframe>'],
  ])('rejects %s instead of presenting it as a safe local preview', async (_label, unsafe) => {
    validProject('projects/unsafe');
    write('projects/unsafe/index.html', `<!doctype html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="styles.css"></head><body>${unsafe}</body></html>`);
    const resolution = await win32VerifySiteCapability.resolve({ path: 'projects/unsafe' }, context);
    await expect(resolution.execute()).rejects.toThrow(/self-contained/i);
  });
});
