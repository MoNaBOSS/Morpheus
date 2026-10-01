import { join } from 'node:path';
import { parseInteractiveSiteSpec } from '@shared/morpheus/interactive-site-types';
import { MorpheusCapabilityError, type MorpheusCapability } from '../morpheus/capability-registry';
import { resolveWorkspacePath } from '../morpheus/capabilities/win32/workspace';
import { createInteractiveProject } from './project';

export const interactiveSiteCapability: MorpheusCapability<'site.createInteractive'> = {
  actionId: 'site.createInteractive', platform: 'win32',
  async resolve(params, context) {
    let specification;
    try { specification = parseInteractiveSiteSpec(JSON.parse(params.specification)); }
    catch { throw new MorpheusCapabilityError('invalid-params', 'Interactive site requires valid bounded studio-v1 content, not generated code.'); }
    const project = resolveWorkspacePath(context.roots, params.path);
    return { target: { kind: 'folder', path: project.absolute, workspaceRoot: project.workspaceRoot },
      execute: async (signal) => {
        const result = await createInteractiveProject(context.roots, params.path, specification, signal);
        return { kind: 'website', manifest: {
          v: 1, projectPath: result.path, workspaceRoot: project.workspaceRoot,
          entryPath: join(result.path, 'index.html'), relativeEntryPath: `${params.path.replace(/\\/g, '/')}/index.html`,
          fileCount: result.fileCount, totalBytes: result.totalBytes, revision: result.revision,
          interactiveTemplate: 'studio-v1', verifiedAt: new Date().toISOString(),
          checks: { pinnedTemplate: true, boundedContent: true, isolatedClientPreview: true, formDelivery: false },
        } };
      } };
  },
};
