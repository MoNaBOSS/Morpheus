import { normalizeComparablePath } from '../../utils/morpheus-path-guard';
import type { MorpheusWorkspaceStore } from '../morpheus/workspaces/workspace-store';
import type { MorpheusAuditSink } from '../morpheus/audit';
import type { MorpheusRootProvider } from '../morpheus/roots';
import { verifyInteractiveProject } from './project';
import type { openInteractivePreview } from './preview';

export function createInteractivePreviewController(options: {
  workspaces: MorpheusWorkspaceStore;
  audit: MorpheusAuditSink;
  appVersion: string;
  open?: typeof openInteractivePreview;
}) {
  let busy = false;
  let active: Awaited<ReturnType<typeof openInteractivePreview>> | undefined;
  return async (payload: unknown): Promise<{ ok: true }> => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid interactive preview request.');
    const input = payload as Record<string, unknown>;
    if (Object.keys(input).some((key) => !['workspaceRoot', 'relativeEntryPath', 'revision'].includes(key))
      || typeof input.workspaceRoot !== 'string' || input.workspaceRoot.length > 1000
      || typeof input.relativeEntryPath !== 'string' || !input.relativeEntryPath.endsWith('/index.html')
      || typeof input.revision !== 'string' || !/^[a-f0-9]{64}$/.test(input.revision)) throw new Error('Invalid interactive preview request.');
    if (busy) throw new Error('An interactive preview is already opening.');
    busy = true;
    try {
      const workspace = options.workspaces.list().workspaces.find((item) => item.enabled && item.available
        && normalizeComparablePath(item.rootPath) === normalizeComparablePath(input.workspaceRoot as string));
      if (!workspace) throw new Error('This preview needs an available approved workspace.');
      const roots: MorpheusRootProvider = { resolve: () => options.workspaces.resolveRoot(workspace.workspaceId), forWorkspace: () => roots };
      const build = await verifyInteractiveProject(roots, input.relativeEntryPath.slice(0, -'/index.html'.length), input.revision);
      roots.resolve('morpheusFiles'); // Recheck enabled/available immediately before opening.
      await options.audit.recordControl({ category: 'workspace', event: 'interactive-preview-requested', subjectId: workspace.workspaceId,
        details: { revision: build.revision, template: build.spec.template }, appVersion: options.appVersion });
      if (active) { await active.close(); active = undefined; }
      const open = options.open ?? (await import('./preview')).openInteractivePreview;
      active = await open(build);
      return { ok: true };
    } finally { busy = false; }
  };
}
