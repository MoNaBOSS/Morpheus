import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createMorpheusRuntime, buildAuditParams } from '@electron/services/morpheus/runtime';
import { createMorpheusWorkerPort, type MorpheusWorkerAdapter } from '@electron/services/morpheus/workers/worker-port';
import { createMorpheusWorkerCheckpoints } from '@electron/services/morpheus/workers/worker-checkpoints';
import { createMorpheusCapabilityRegistry } from '@electron/services/morpheus/capability-registry';
import { createMorpheusGrantStore } from '@electron/services/morpheus/policy/grant-store';
import type { MorpheusAuditSink } from '@electron/services/morpheus/audit';
import type { MorpheusRootProvider } from '@electron/services/morpheus/roots';
import type { ExecutionPlan, ExecutionStep } from '@shared/morpheus/execution-types';
import type { MorpheusActionEvent } from '@shared/morpheus/action-types';

const scratch = mkdtempSync(join(tmpdir(), 'morpheus-worker-runtime-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
let id = 0;
function fixture(adapter: MorpheusWorkerAdapter) {
  const directory = join(scratch, `case-${++id}`);
  const registry = createMorpheusCapabilityRegistry();
  const native = vi.fn(async () => ({ kind: 'launch' as const, applicationKey: 'notepad' as const, executablePath: 'C:\\Windows\\notepad.exe', pid: 1 }));
  registry.register({ actionId: 'app.launch', platform: 'win32', resolve: async () => ({ target: { kind: 'executable', path: 'C:\\Windows\\notepad.exe', applicationKey: 'notepad' }, execute: native }) });
  const audit = { record: vi.fn(async () => {}), recordControl: vi.fn(async () => {}), isHealthy: () => true } as unknown as MorpheusAuditSink;
  const workerPort = createMorpheusWorkerPort({ adapter, checkpoints: createMorpheusWorkerCheckpoints(directory), audit, appVersion: 'test' });
  const roots: MorpheusRootProvider = { resolve: () => directory, forWorkspace: () => roots };
  const events: MorpheusActionEvent[] = [];
  const runtime = createMorpheusRuntime({ registry, workerPort, roots, audit, grants: createMorpheusGrantStore({ userDataDir: directory }),
    gate: { evaluate: () => ({ outcome: 'allow', reason: 'profile-auto' }), recordGrantUse: () => {} },
    appVersion: 'test', platform: 'win32', emit: (event) => events.push(event) });
  return { runtime, native, events, audit };
}
function readPlan(planId: string, nativeFirst = false): ExecutionPlan {
  const read: ExecutionStep = { stepId: 'read', capabilityId: 'web.readPage', params: { url: 'https://example.com/source?secret=private' }, summaryKey: 'test', dependsOn: nativeFirst ? ['launch'] : [],
    permission: { capabilityId: 'web.readPage', platform: 'win32', riskTier: 'low', resourceScope: 'https://example.com', mandatoryConfirmation: false } };
  const native: ExecutionStep = { stepId: 'launch', capabilityId: 'app.launch', params: { applicationKey: 'notepad' }, summaryKey: 'test', dependsOn: [],
    permission: { capabilityId: 'app.launch', platform: 'win32', riskTier: 'medium', resourceScope: 'notepad', mandatoryConfirmation: false } };
  return { v: 1, planId, createdAt: new Date().toISOString(), origin: { type: 'command-bar', commandText: 'read public source' }, objective: 'Read public source', status: 'draft', plannedBy: 'deterministic', steps: nativeFirst ? [native, read] : [read] };
}

describe('Core injected worker execution', () => {
  it('routes browser observations through the same permission audit and artifact owner', async () => {
    const adapter: MorpheusWorkerAdapter = { supportedActions: () => ['browser.inspect'], releaseOwner: vi.fn(), run: async (request) => ({
      workerRunId: request.workerRunId, effect: 'none', usage: { status: 'known', inputTokens: 0, outputTokens: 0, costUsd: 0 },
      browser: { sessionId: 'a'.repeat(36), revision: 'b'.repeat(36), url: request.operation.url, title: 'Observed browser', text: 'Private task text', controls: [{ ref: 'e1', kind: 'button', name: 'Next' }], truncated: false, blockedRequests: 0 },
    }) };
    const { runtime, audit } = fixture(adapter);
    const plan = readPlan('browser-plan');
    plan.steps = [{ ...plan.steps[0], capabilityId: 'browser.inspect', permission: { ...plan.steps[0].permission, capabilityId: 'browser.inspect' } }];
    runtime.registerPlan(plan);
    const result = await runtime.executePlan({ planId: plan.planId }, { workerOwner: { objectiveRunId: 'browser-owner', attemptId: 'attempt', cancellationGeneration: 1 } });
    expect(result.status).toBe('completed');
    expect(result.steps[0].artifact).toMatchObject({ kind: 'report', data: { title: 'Observed browser', browserSnapshot: expect.stringContaining('e1') } });
    expect(JSON.stringify(vi.mocked(audit.record).mock.calls)).not.toMatch(/Private task text|secret=private|browserSnapshot/);
    runtime.releaseWorkerOwner!('browser-owner');
    expect(adapter.releaseOwner).toHaveBeenCalledWith('browser-owner');
    expect(buildAuditParams('browser.interact', { url: 'https://example.com/?q=private', sessionId: 'session', command: '{"text":"private input"}' })).toEqual({ urlOrigin: 'https://example.com', sessionId: 'session', commandBytes: 24, commandSha256: expect.any(String) });
    runtime.dispose();
  });
  it('does not block app launch behind five queued worker plans or hold desktop through a mixed plan read', async () => {
    const adapter: MorpheusWorkerAdapter = { run: vi.fn(async (_request, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    })) };
    const { runtime, native } = fixture(adapter);
    const plans = Array.from({ length: 5 }, (_, index) => readPlan(`plan-${index}`, index === 0));
    for (const plan of plans) runtime.registerPlan(plan);
    const results = plans.map((plan) => runtime.executePlan({ planId: plan.planId }));
    await vi.waitFor(() => expect(adapter.run).toHaveBeenCalledTimes(1));
    expect(native).toHaveBeenCalledTimes(1);
    await runtime.requestAction({ actionId: 'app.launch', params: { applicationKey: 'notepad' } });
    expect(native).toHaveBeenCalledTimes(2);
    for (const plan of plans) await runtime.cancelPlan({ planId: plan.planId });
    const settled = await Promise.all(results);
    expect(adapter.run).toHaveBeenCalledTimes(1);
    expect(settled.every((result) => result.status === 'cancelled')).toBe(true);
    runtime.dispose();
  });
  it('persists verified source metadata as artifacts and only origin/digest as audit', async () => {
    const adapter: MorpheusWorkerAdapter = { run: async (request) => ({ workerRunId: request.workerRunId, effect: 'none', usage: { status: 'known', inputTokens: 0, outputTokens: 0, costUsd: 0 },
      source: { originalUrl: request.operation.url, finalUrl: request.operation.url, retrievedAt: new Date().toISOString(), title: 'Real page', excerpt: 'Actual retrieved text', bytes: 40, contentSha256: 'a'.repeat(64), truncated: false, location: 'body-text' } }) };
    const { runtime, audit, events } = fixture(adapter);
    runtime.registerPlan(readPlan('source-plan'));
    const result = await runtime.executePlan({ planId: 'source-plan' }, { workerOwner: { objectiveRunId: 'objective', attemptId: 'attempt', cancellationGeneration: 7 } });
    expect(result.status).toBe('completed');
    expect(result.steps[0].artifact).toMatchObject({ kind: 'report', data: { sourceType: 'public-https', excerpt: 'Actual retrieved text', title: 'Real page' } });
    expect(JSON.stringify(vi.mocked(audit.record).mock.calls)).not.toMatch(/Actual retrieved text|secret=private/);
    expect(events.at(-1)?.phase).toBe('succeeded');
    expect(buildAuditParams('web.readPage', { url: 'https://example.com/source?secret=private' })).toEqual({ urlOrigin: 'https://example.com' });
    runtime.dispose();
  });
});
