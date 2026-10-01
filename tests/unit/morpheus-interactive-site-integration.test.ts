import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { interactiveSiteCapability } from '../../electron/services/interactive-site/capability';
import { createInteractivePreviewController } from '../../electron/services/interactive-site/preview-controller';
import { createInteractiveProject } from '../../electron/services/interactive-site/project';
import { createMorpheusWorkspaceStore } from '../../electron/services/morpheus/workspaces/workspace-store';
import { createMorpheusRootProvider } from '../../electron/services/morpheus/roots';
import { createMorpheusAuditSink } from '../../electron/services/morpheus/audit';
import { createMorpheusRuntime } from '../../electron/services/morpheus/runtime';
import { createMorpheusCapabilityRegistry } from '../../electron/services/morpheus/capability-registry';
import { createMorpheusGrantStore } from '../../electron/services/morpheus/policy/grant-store';
import { createMorpheusPolicyEngine } from '../../electron/services/morpheus/policy/policy-engine';
import { createPolicyPermissionGate } from '../../electron/services/morpheus/policy/permission-gate';
import { createMorpheusAgentProfileStore } from '../../electron/services/morpheus/agents/profile-store';
import { createMorpheusObjectiveStore } from '../../electron/services/morpheus/core/objective-store';
import { createMorpheusObjectiveOrchestrator } from '../../electron/services/morpheus/core/objective-orchestrator';
import { createMorpheusProviderPlanner } from '../../electron/services/morpheus/planning/provider-planner';
import { createMorpheusMemoryStore } from '../../electron/services/morpheus/memory/memory-store';
import { createMorpheusMissionStore } from '../../electron/services/morpheus/missions/mission-store';
import { createMorpheusProjectStore } from '../../electron/services/morpheus/projects/project-store';

const dirs: string[] = [];
const spec = { template: 'studio-v1', title: 'North Studio', headline: 'A clear starting point.', description: 'Independent design.', services: [{ title: 'Identity', category: 'Design', description: 'Make it yours.' }], faqs: [] };
afterEach(async () => { for (const path of dirs.splice(0)) await rm(path, { recursive: true, force: true }); });
async function setup() {
  const userDataDir = await mkdtemp(join(tmpdir(), 'morpheus-interactive-integration-')); dirs.push(userDataDir);
  const workspaces = createMorpheusWorkspaceStore({ userDataDir });
  const roots = createMorpheusRootProvider({ userDataDir, workspaces });
  const audit = createMorpheusAuditSink({ auditDir: join(userDataDir, 'audit') });
  return { userDataDir, workspaces, roots, audit };
}

describe('interactive project uses existing Core authority', () => {
  it('plans, writes, audits and returns a real interactive artifact through the existing provider/Core path', async () => {
    const { userDataDir, workspaces, roots, audit } = await setup();
    const grants = createMorpheusGrantStore({ userDataDir }); grants.setProfile('autonomous');
    const registry = createMorpheusCapabilityRegistry(); registry.register(interactiveSiteCapability);
    const runtime = createMorpheusRuntime({ registry, roots, workspaces, audit, grants,
      gate: createPolicyPermissionGate(createMorpheusPolicyEngine(grants), grants), appVersion: 'test', platform: 'win32', emit: () => {} });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ steps: [{
      stepId: 'build', capabilityId: 'site.createInteractive', params: { path: 'studio', specification: JSON.stringify(spec) }, dependsOn: [], summary: 'Create the local interactive studio site',
    }] }) } }] }), { status: 200 }));
    const planner = createMorpheusProviderPlanner({ account: { id: 'test-provider', vendorId: 'openai', label: 'Test', authMode: 'api_key',
      baseUrl: 'https://provider.example/v1', apiProtocol: 'openai-completions', model: 'test-model', enabled: true, isDefault: true, createdAt: '', updatedAt: '' }, apiKey: 'fixture-key', fetchImpl: fetchImpl as typeof fetch });
    const objectives = createMorpheusObjectiveOrchestrator({ store: createMorpheusObjectiveStore({ userDataDir }), runtime,
      agents: createMorpheusAgentProfileStore({ userDataDir }), planners: { select: async () => ({ ok: true, planner, providerAccountId: 'test-provider', modelId: 'test-model' }) },
      audit, appVersion: 'test', workspaces, missions: createMorpheusMissionStore({ userDataDir }), projects: createMorpheusProjectStore({ userDataDir }),
      memory: createMorpheusMemoryStore({ userDataDir }), platform: 'win32', emit: () => {} });
    try {
      const submitted = await objectives.submit({ objective: 'Create an interactive studio website with service filters and a local brief form', originType: 'command-bar', projectId: 'personal' });
      const result = await objectives.waitForTerminal(submitted.objectiveRunId);
      expect(result.state).toBe('complete');
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0]).toMatchObject({ kind: 'website', interactiveTemplate: 'studio-v1', fileCount: 6, relativeEntryPath: 'studio/index.html' });
      expect(await readFile(join(roots.resolve('morpheusFiles'), 'studio', 'app.js'), 'utf8')).toContain('Nothing has been sent');
      const auditText = JSON.stringify(await runtime.auditRecent({ limit: 100 }));
      expect(auditText).toContain('site.createInteractive');
      expect(auditText).not.toContain(spec.headline);
      expect(auditText).not.toContain('fixture-key');
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally { objectives.dispose(); runtime.dispose(); }
  });
});

describe('Main preview authority', () => {
  it('rechecks registered workspace, disk revision and audit before opening, replaces only its own preview', async () => {
    const { workspaces, roots, audit } = await setup();
    const receipt = await createInteractiveProject(roots, 'studio', spec);
    const close = vi.fn(async () => {});
    const open = vi.fn(async () => ({ id: 1, revision: receipt.revision, close }));
    const preview = createInteractivePreviewController({ workspaces, audit, appVersion: 'test', open });
    const payload = { workspaceRoot: roots.resolve('morpheusFiles'), relativeEntryPath: 'studio/index.html', revision: receipt.revision };
    await expect(preview(payload)).resolves.toEqual({ ok: true });
    await expect(preview(payload)).resolves.toEqual({ ok: true });
    expect(close).toHaveBeenCalledTimes(1);
    await expect(preview({ ...payload, workspaceRoot: join(tmpdir(), 'outside') })).rejects.toThrow('approved workspace');
    await expect(preview({ ...payload, preload: 'bad' })).rejects.toThrow('Invalid');
    await expect(preview({ ...payload, revision: 'f'.repeat(64) })).rejects.toThrow('revision changed');
    await writeFile(join(payload.workspaceRoot, 'studio', 'app.js'), 'manual edit');
    await expect(preview(payload)).rejects.toThrow('preserved');
    expect(open).toHaveBeenCalledTimes(2);
  });
  it('fails closed on an audit failure and concurrent open, without unbounded preview windows', async () => {
    const { workspaces, roots } = await setup();
    const receipt = await createInteractiveProject(roots, 'studio', spec);
    const payload = { workspaceRoot: roots.resolve('morpheusFiles'), relativeEntryPath: 'studio/index.html', revision: receipt.revision };
    const open = vi.fn();
    const audit = { recordControl: vi.fn(async () => { throw new Error('Audit unavailable'); }) } as unknown as ReturnType<typeof createMorpheusAuditSink>;
    const preview = createInteractivePreviewController({ workspaces, audit, appVersion: 'test', open });
    const pending = preview(payload);
    await expect(preview(payload)).rejects.toThrow('already opening');
    await expect(pending).rejects.toThrow('Audit unavailable');
    expect(open).not.toHaveBeenCalled();
  });
});
