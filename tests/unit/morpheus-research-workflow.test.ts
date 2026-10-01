import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it, vi } from 'vitest';
import { createMorpheusRuntime } from '@electron/services/morpheus/runtime';
import { createMorpheusCapabilityRegistry } from '@electron/services/morpheus/capability-registry';
import { win32FilesystemCapabilities } from '@electron/services/morpheus/capabilities/win32/filesystem';
import { createMorpheusAuditSink } from '@electron/services/morpheus/audit';
import { createMorpheusGrantStore } from '@electron/services/morpheus/policy/grant-store';
import { createMorpheusPolicyEngine } from '@electron/services/morpheus/policy/policy-engine';
import { createPolicyPermissionGate } from '@electron/services/morpheus/policy/permission-gate';
import { createMorpheusWorkerPort } from '@electron/services/morpheus/workers/worker-port';
import { createMorpheusWorkerCheckpoints } from '@electron/services/morpheus/workers/worker-checkpoints';
import { createPublicSourceWorkerAdapter } from '@electron/services/public-source-worker-adapter';
import { createMorpheusObjectiveOrchestrator } from '@electron/services/morpheus/core/objective-orchestrator';
import { createMorpheusObjectiveStore } from '@electron/services/morpheus/core/objective-store';
import { createMorpheusAgentProfileStore } from '@electron/services/morpheus/agents/profile-store';
import { createMorpheusProviderPlanner } from '@electron/services/morpheus/planning/provider-planner';
import type { MorpheusRootProvider } from '@electron/services/morpheus/roots';

it('retrieves, synthesizes with observed citations, saves a real report and leaves app commands independent', async () => {
  const root = mkdtempSync(join(tmpdir(), 'morpheus-research-flow-'));
  const files = join(root, 'files');
  mkdirSync(files);
  let releaseSource!: () => void;
  const heldSource = new Promise<void>((resolve) => { releaseSource = resolve; });
  const retrieved: string[] = [];
  const adapter = createPublicSourceWorkerAdapter({ resolveAddresses: async () => [{ address: '93.184.216.34', family: 4 }], transport: async (url) => {
    retrieved.push(url.href);
    await heldSource;
    return { status: url.pathname === '/blocked' ? 403 : 200, headers: { 'content-type': 'text/html' }, body: Buffer.from('<title>Verified guide</title><p>The library has twelve shelves.</p>') };
  } });
  const audit = createMorpheusAuditSink({ auditDir: join(root, 'audit') });
  const port = createMorpheusWorkerPort({ adapter, audit, checkpoints: createMorpheusWorkerCheckpoints(root), appVersion: 'test' });
  const registry = createMorpheusCapabilityRegistry();
  for (const capability of win32FilesystemCapabilities) registry.register(capability);
  const launched = vi.fn(async () => ({ kind: 'launch' as const, applicationKey: 'notepad' as const, executablePath: 'C:\\Windows\\notepad.exe', pid: 10 }));
  registry.register({ actionId: 'app.launch', platform: 'win32', resolve: async () => ({ target: { kind: 'executable', path: 'C:\\Windows\\notepad.exe', applicationKey: 'notepad' }, execute: launched }) });
  const roots: MorpheusRootProvider = { resolve: () => files, forWorkspace: () => roots };
  const grants = createMorpheusGrantStore({ userDataDir: root });
  grants.setProfile('autonomous');
  const runtime = createMorpheusRuntime({ registry, workerPort: port, audit, roots, grants, gate: createPolicyPermissionGate(createMorpheusPolicyEngine(grants), grants), appVersion: 'test', platform: 'win32', emit: () => {} });
  const response = (value: unknown) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }));
  const providerFetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const user = body.messages[1].content as string;
    if (user.includes('RETRIEVED SOURCE DATA')) {
      expect(user).toContain('twelve shelves');
      expect(user).toContain('s1');
      expect(user).toContain('https://library.example/blocked');
      return response({ outcome: 'report', report: { title: 'Library findings', paragraphs: [{ text: 'The library has twelve shelves.', sourceIds: ['s1'] }] } });
    }
    return response({ steps: ['guide', 'blocked'].map((page) => ({ stepId: page, capabilityId: 'web.readPage', params: { url: `https://library.example/${page}` }, dependsOn: [], summary: `Read ${page}` })) });
  });
  const planner = createMorpheusProviderPlanner({ account: { id: 'fixture', vendorId: 'openai', label: 'Fixture', enabled: true, isDefault: true, authMode: 'api_key', model: 'fixture', baseUrl: 'https://provider.example/v1', apiProtocol: 'openai-completions', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, apiKey: 'fixture-only', fetchImpl: providerFetch });
  const orchestrator = createMorpheusObjectiveOrchestrator({ store: createMorpheusObjectiveStore({ userDataDir: root }), runtime, agents: createMorpheusAgentProfileStore({ userDataDir: root }),
    planners: { select: async () => ({ ok: true, planner }) }, audit, appVersion: 'test', platform: 'win32', emit: () => {},
    workspaces: { get: () => ({ v: 1, workspaceId: 'morpheus-files', name: 'Files', rootPath: files, kind: 'managed', access: 'read-write', enabled: true, available: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }), resolveRoot: () => files },
  });
  try {
    const submitted = await orchestrator.submit({ objective: 'Research the library and save a cited report', originType: 'command-bar' });
    await vi.waitFor(() => expect(retrieved).toHaveLength(1));
    const app = await orchestrator.submit({ objective: 'Open Notepad', originType: 'command-bar' });
    await vi.waitFor(() => expect(orchestrator.snapshot().runsById[app.objectiveRunId].state).toBe('complete'));
    expect(launched).toHaveBeenCalledOnce();
    expect(providerFetch).toHaveBeenCalledTimes(1);
    releaseSource();
    await vi.waitFor(() => expect(orchestrator.snapshot().runsById[submitted.objectiveRunId].state).toBe('complete'));
    const run = orchestrator.snapshot().runsById[submitted.objectiveRunId];
    const file = run.artifacts.find((artifact) => artifact.kind === 'file');
    expect(file?.kind).toBe('file');
    if (file?.kind !== 'file') throw new Error('Missing file');
    const content = readFileSync(file.path, 'utf8');
    expect(content).toContain('[s1](<https://library.example/guide>)');
    expect(content).toContain('Unavailable sources (not used as evidence)');
    expect(content).toContain('blocked');
    expect(providerFetch).toHaveBeenCalledTimes(2);
    const history = JSON.stringify(await runtime.auditRecent({ limit: 100 }));
    expect(history).toContain('file.create');
    expect(history).not.toContain('twelve shelves');
  } finally { releaseSource(); orchestrator.dispose(); runtime.dispose(); rmSync(root, { recursive: true, force: true }); }
});
