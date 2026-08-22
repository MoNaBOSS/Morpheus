/** Main-owned verification for a self-contained website in an approved workspace. */
import { lstat, readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import type { MorpheusActionResult } from '@shared/morpheus/action-types';
import type { MorpheusParamsFor } from '@shared/morpheus/actions/registry';
import { validateParam } from '@shared/morpheus/capabilities/params';
import { MORPHEUS_WEBSITE_PROJECT_VERSION } from '@shared/morpheus/site-types';

import {
  MorpheusCapabilityError,
  type MorpheusCapability,
  type MorpheusCapabilityContext,
  type MorpheusResolution,
} from '../../capability-registry';
import type { MorpheusRootProvider } from '../../roots';
import { resolveWorkspacePath } from './workspace';

const MAX_SITE_FILES = 128;
const MAX_SITE_DEPTH = 8;
const MAX_SITE_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 256 * 1024;

type SiteInventory = {
  absolute: string;
  relative: string;
  bytes: number;
};

function workspaceRelative(root: string, absolute: string): string {
  return relative(root, absolute).split(sep).join('/');
}

async function inventorySite(
  projectPath: string,
  workspaceRoot: string,
  roots: MorpheusRootProvider,
): Promise<SiteInventory[]> {
  const files: SiteInventory[] = [];
  let totalBytes = 0;

  const visit = async (directory: string, depth: number): Promise<void> => {
    if (depth > MAX_SITE_DEPTH) {
      throw new MorpheusCapabilityError('invalid-params', 'Website project is nested too deeply');
    }
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      if (entry.isSymbolicLink() || (await lstat(absolute)).isSymbolicLink()) {
        throw new MorpheusCapabilityError('invalid-params', 'Website project contains a symbolic link');
      }
      if (entry.isDirectory()) {
        await visit(absolute, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const info = await stat(absolute);
      totalBytes += info.size;
      files.push({ absolute, relative: workspaceRelative(projectPath, absolute), bytes: info.size });
      if (files.length > MAX_SITE_FILES || totalBytes > MAX_SITE_BYTES) {
        throw new MorpheusCapabilityError('invalid-params', 'Website project exceeds verification limits');
      }
      // Re-resolve every discovered file against the canonical workspace. A
      // directory component changed to a link during traversal is rejected.
      resolveWorkspacePath(roots, workspaceRelative(workspaceRoot, absolute), { mustExist: true });
    }
  };

  await visit(projectPath, 0);
  return files;
}

function rejectUnsafeDocument(html: string, css: string): void {
  const unsafeHtml = [
    /<script\b/i,
    /<\s*(?:iframe|object|embed|base|form)\b/i,
    /http-equiv\s*=\s*["']?refresh/i,
    /\son[a-z]+\s*=/i,
    /\b(?:src|href)\s*=\s*["']\s*(?:https?:|\/\/|javascript:)/i,
  ];
  const unsafeCss = [/@import\b/i, /url\(\s*["']?\s*(?:https?:|\/\/)/i, /expression\s*\(/i, /-moz-binding\s*:/i];
  if (unsafeHtml.some((pattern) => pattern.test(html)) || unsafeCss.some((pattern) => pattern.test(css))) {
    throw new MorpheusCapabilityError(
      'invalid-params',
      'Website must be self-contained and cannot include scripts, remote resources, embeds, forms, or active navigation',
    );
  }
}

function attributeValue(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, 'i'));
  return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}

function verifyLinkedStylesheet(html: string, files: readonly SiteInventory[]): void {
  const existingCss = new Set(
    files.filter((file) => /\.css$/i.test(file.relative)).map((file) => file.relative.toLowerCase()),
  );
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const link of links) {
    const rel = attributeValue(link, 'rel');
    if (!rel?.toLowerCase().split(/\s+/).includes('stylesheet')) continue;
    const href = attributeValue(link, 'href');
    if (!href || href.includes('?') || href.includes('#')) continue;
    const validated = validateParam('relativePath', href);
    if (!validated.ok || !/\.css$/i.test(href)) continue;
    const normalized = href.replace(/\\/g, '/').toLowerCase();
    if (existingCss.has(normalized)) return;
  }
  throw new MorpheusCapabilityError(
    'invalid-params',
    'Website entry document must link one existing local stylesheet',
  );
}

function verifyAnalytics(raw: string): void {
  let value: unknown;
  try { value = JSON.parse(raw); } catch {
    throw new MorpheusCapabilityError('invalid-params', 'analytics.json is not valid JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new MorpheusCapabilityError('invalid-params', 'analytics.json must be an object');
  }
  const record = value as Record<string, unknown>;
  if (record.schema !== 'morpheus.analytics.v1'
    || !Array.isArray(record.events)
    || record.events.length === 0
    || record.events.length > 50
    || record.events.some((event) => typeof event !== 'string' || !/^[a-z][a-z0-9._-]{0,63}$/.test(event))) {
    throw new MorpheusCapabilityError(
      'invalid-params',
      'analytics.json must declare schema morpheus.analytics.v1 and a bounded events list',
    );
  }
}

export const win32VerifySiteCapability: MorpheusCapability<'site.verify'> = {
  actionId: 'site.verify',
  platform: 'win32',

  async resolve(
    params: MorpheusParamsFor<'site.verify'>,
    context: MorpheusCapabilityContext,
  ): Promise<MorpheusResolution> {
    // Preparation happens for the complete plan before any step executes. A
    // verifier commonly depends on earlier create-file steps, so its target may
    // be a safe future path at this point. Resolve containment now for trust;
    // require and inspect the actual files only when this dependent step runs.
    const project = resolveWorkspacePath(context.roots, params.path);
    const entry = resolveWorkspacePath(context.roots, `${params.path.replace(/[\\/]+$/, '')}/index.html`);

    return {
      target: { kind: 'folder', path: project.absolute, workspaceRoot: project.workspaceRoot },
      execute: async (): Promise<MorpheusActionResult> => {
        // The plan may have waited for consent. Resolve the project and entry
        // again at execution time so a path swapped to a symlink or a different
        // target while waiting never inherits the earlier safe resolution.
        const currentProject = resolveWorkspacePath(context.roots, params.path, { mustExist: true });
        if (currentProject.absolute !== project.absolute
          || currentProject.workspaceRoot !== project.workspaceRoot
          || !(await stat(currentProject.absolute)).isDirectory()) {
          throw new MorpheusCapabilityError('execution-failed', 'Website project changed before verification');
        }
        const currentEntry = resolveWorkspacePath(
          context.roots,
          `${params.path.replace(/[\\/]+$/, '')}/index.html`,
          { mustExist: true },
        );
        const currentEntryInfo = await stat(currentEntry.absolute);
        if (currentEntry.absolute !== entry.absolute || !currentEntryInfo.isFile()
          || currentEntryInfo.size > MAX_SOURCE_BYTES) {
          throw new MorpheusCapabilityError('execution-failed', 'Website entry changed before verification');
        }

        const files = await inventorySite(project.absolute, project.workspaceRoot, context.roots);
        const cssFiles = files.filter((file) => /\.css$/i.test(file.relative));
        if (cssFiles.length === 0) {
          throw new MorpheusCapabilityError('invalid-params', 'Website must include a local stylesheet');
        }
        const html = await readFile(currentEntry.absolute, 'utf8');
        const cssSources = await Promise.all(cssFiles.map(async (file) => {
          if (file.bytes > MAX_SOURCE_BYTES) {
            throw new MorpheusCapabilityError('invalid-params', `Stylesheet is too large: ${file.relative}`);
          }
          return readFile(file.absolute, 'utf8');
        }));
        const css = cssSources.join('\n');

        if (!/<meta\b[^>]*name\s*=\s*["']viewport["'][^>]*>/i.test(html)) {
          throw new MorpheusCapabilityError('invalid-params', 'Website is missing responsive viewport metadata');
        }
        if (!/@media\b/i.test(css)) {
          throw new MorpheusCapabilityError('invalid-params', 'Website stylesheet has no responsive media rule');
        }
        verifyLinkedStylesheet(html, files);
        rejectUnsafeDocument(html, css);

        const analytics = files.find((file) => file.relative.toLowerCase() === 'analytics.json');
        if (!analytics || analytics.bytes > MAX_SOURCE_BYTES) {
          throw new MorpheusCapabilityError('invalid-params', 'Website is missing a bounded analytics.json configuration');
        }
        verifyAnalytics(await readFile(analytics.absolute, 'utf8'));

        return {
          kind: 'website',
          manifest: {
            v: MORPHEUS_WEBSITE_PROJECT_VERSION,
            projectPath: project.absolute,
            workspaceRoot: project.workspaceRoot,
            entryPath: entry.absolute,
            relativeEntryPath: workspaceRelative(project.workspaceRoot, entry.absolute),
            fileCount: files.length,
            totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
            checks: {
              entryDocument: true,
              viewportMetadata: true,
              responsiveStyles: true,
              localStylesheet: true,
              analyticsConfiguration: true,
              selfContained: true,
            },
            verifiedAt: new Date().toISOString(),
          },
        };
      },
    };
  },
};
