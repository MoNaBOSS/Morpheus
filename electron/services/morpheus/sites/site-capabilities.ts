import { MorpheusCapabilityError, type MorpheusCapability, type MorpheusCapabilityContext } from '../capability-registry';
import { resolveWorkspacePath } from '../capabilities/win32/workspace';
import { win32VerifySiteCapability } from '../capabilities/win32/verify-site';
import { createMorpheusSiteRevisionService, parseMorpheusSiteRevisionPatch } from './site-revisions';

/** Fixed Main capabilities. Content is staged/verified, never executed as configuration. */
export function createMorpheusSiteCapabilities(userDataDir: string): [MorpheusCapability<'site.revise'>, MorpheusCapability<'site.rollback'>] {
  const verify = async (context: MorpheusCapabilityContext, path: string) => {
    const result = await (await win32VerifySiteCapability.resolve({ path }, context)).execute();
    if (result.kind !== 'website') throw new MorpheusCapabilityError('execution-failed', 'Website verification did not produce a manifest');
    return result;
  };
  const service = createMorpheusSiteRevisionService({ userDataDir, verify: async (roots, path) => { await verify({ roots, appVersion: 'site-revision', env: {} }, path); } });
  return [{
    actionId: 'site.revise', platform: 'win32',
    async resolve(params, context) {
      let data: unknown;
      try { data = JSON.parse(params.patch); } catch { throw new MorpheusCapabilityError('invalid-params', 'Website patch must be valid JSON'); }
      if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some((key) => key !== 'files')) throw new MorpheusCapabilityError('invalid-params', 'Website patch accepts only files');
      const patch = parseMorpheusSiteRevisionPatch({ path: params.path, expectedRevision: params.expectedRevision, files: (data as Record<string, unknown>).files });
      const project = resolveWorkspacePath(context.roots, params.path, { mustExist: true });
      return { target: { kind: 'folder', path: project.absolute, workspaceRoot: project.workspaceRoot },
        execute: async (signal) => {
          const receipt = await service.apply(context.roots, patch, signal);
          const result = await verify(context, params.path);
          return { ...result, manifest: { ...result.manifest, revisionId: receipt.revisionId } };
        } };
    },
  }, {
    actionId: 'site.rollback', platform: 'win32',
    async resolve(params, context) {
      if (!/^revision-[a-f0-9-]{36}$/.test(params.revisionId) || !/^[a-f0-9]{64}$/.test(params.expectedRevision)) throw new MorpheusCapabilityError('invalid-params', 'Invalid website rollback precondition');
      const project = resolveWorkspacePath(context.roots, params.path, { mustExist: true });
      return { target: { kind: 'folder', path: project.absolute, workspaceRoot: project.workspaceRoot },
        execute: async (signal) => {
          signal?.throwIfAborted();
          await service.rollback(context.roots, params.revisionId, params.expectedRevision, params.path);
          return verify(context, params.path);
        } };
    },
  }];
}
