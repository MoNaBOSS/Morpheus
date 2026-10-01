import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { createMorpheusWorkerPort, type MorpheusWorkerAdapter } from '@electron/services/morpheus/workers/worker-port';
import { createMorpheusWorkerCheckpoints } from '@electron/services/morpheus/workers/worker-checkpoints';
import type { MorpheusAuditSink } from '@electron/services/morpheus/audit';
import type { MorpheusWorkerOutcome, MorpheusWorkerRequest } from '@shared/morpheus/worker-types';

const scratch = mkdtempSync(join(tmpdir(), 'morpheus-worker-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
let id = 0;
const owner = { objectiveRunId: 'objective-1', attemptId: 'attempt-1', planId: 'plan-1', stepId: 'read', cancellationGeneration: 2 };
const outcome = (request: MorpheusWorkerRequest): MorpheusWorkerOutcome => ({ workerRunId: request.workerRunId,
  source: { originalUrl: request.operation.url, finalUrl: request.operation.url, title: 'Actual source', excerpt: 'Observed excerpt', retrievedAt: new Date().toISOString(), location: 'body-text', bytes: 40, contentSha256: 'a'.repeat(64), truncated: false },
  effect: 'none', usage: { status: 'known', inputTokens: 0, outputTokens: 0, costUsd: 0 } });
function setup(adapter: MorpheusWorkerAdapter, deadlineMs?: number) {
  const directory = join(scratch, `case-${++id}`);
  const checkpoints = createMorpheusWorkerCheckpoints(directory);
  const records: unknown[] = [];
  const audit = { recordControl: vi.fn(async (entry) => { records.push(entry); }) } as unknown as MorpheusAuditSink;
  const port = createMorpheusWorkerPort({ adapter, checkpoints, audit, appVersion: 'test', deadlineMs });
  return { port, checkpoints, records, audit, directory };
}

describe('Main worker ownership and recovery', () => {
  it('authors exact authority and limits, audits before results, and excludes query/excerpt from checkpoint/audit', async () => {
    let seen!: MorpheusWorkerRequest;
    const { port, checkpoints, records, directory } = setup({ run: async (request, _signal, progress) => {
      seen = request;
      await progress({ workerRunId: request.workerRunId, cancellationGeneration: 2, sequence: 1, phase: 'retrieving' });
      return outcome(request);
    } });
    const prepared = await port.resolve({ kind: 'web.readPage', url: 'https://example.com/read?private=sensitive' }, owner);
    expect(checkpoints.list()).toEqual([]);
    const result = await prepared.execute();
    expect(result.kind).toBe('source');
    expect(seen).toMatchObject({ ...owner, authority: { service: 'public-https', origins: ['https://example.com'], tools: ['https.get'], providerRouteRef: 'local-public-http' }, limits: { maxSteps: 4, maxInputTokens: 0, maxOutputTokens: 0, maxCostUsd: 0 } });
    expect(checkpoints.list()[0].state).toBe('completed');
    const persisted = readFileSync(join(directory, 'morpheus', 'worker-checkpoints.json'), 'utf8');
    expect(persisted + JSON.stringify(records)).not.toMatch(/Observed excerpt|private=sensitive/);
    await expect(prepared.execute()).rejects.toThrow('consumed');
    port.dispose();
  });
  it('admits only one heavy worker and cancels queued work without starting it', async () => {
    let finish: () => void = () => {};
    const adapter = { run: vi.fn(async (request: MorpheusWorkerRequest) => {
      await new Promise<void>((resolve) => { finish = resolve; });
      return outcome(request);
    }) };
    const { port } = setup(adapter);
    const first = await port.resolve({ kind: 'web.readPage', url: 'https://example.com/first' }, owner);
    const second = await port.resolve({ kind: 'web.readPage', url: 'https://example.com/second' }, { ...owner, objectiveRunId: 'objective-2' });
    const running = first.execute();
    await vi.waitFor(() => expect(adapter.run).toHaveBeenCalledTimes(1));
    const controller = new AbortController();
    const queued = second.execute(controller.signal);
    controller.abort();
    await expect(queued).rejects.toThrow();
    expect(adapter.run).toHaveBeenCalledTimes(1);
    finish(); await running; port.dispose();
  });
  it('ignores mismatched/stale/oversized progress and late output after cancellation', async () => {
    const controller = new AbortController();
    const { port, records, checkpoints } = setup({ run: async (request, signal, progress) => {
      await progress({ workerRunId: 'other', cancellationGeneration: 2, sequence: 1, phase: 'retrieving' });
      await progress({ workerRunId: request.workerRunId, cancellationGeneration: 1, sequence: 1, phase: 'retrieving' });
      await progress({ workerRunId: request.workerRunId, cancellationGeneration: 2, sequence: 99, phase: 'retrieving' });
      controller.abort();
      expect(signal.aborted).toBe(true);
      await progress({ workerRunId: request.workerRunId, cancellationGeneration: 2, sequence: 2, phase: 'verified' });
      return outcome(request);
    } });
    await expect((await port.resolve({ kind: 'web.readPage', url: 'https://example.com' }, owner)).execute(controller.signal)).rejects.toThrow();
    expect(JSON.stringify(records)).not.toContain('worker-completed');
    expect(JSON.stringify(records)).not.toContain('worker-progress');
    expect(checkpoints.list()[0].state).toBe('cancelled'); port.dispose();
  });
  it('aborts owned work when its deadline expires', async () => {
    const { port, checkpoints } = setup({ run: async (_request, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }) }, 50);
    await expect((await port.resolve({ kind: 'web.readPage', url: 'https://example.com' }, owner)).execute()).rejects.toThrow('deadline');
    expect(checkpoints.list()[0].state).toBe('cancelled'); port.dispose();
  });
  it('blocks fabricated output and retains unknown usage/effects for review on this run and restart', async () => {
    const { port, checkpoints, audit, directory } = setup({ run: async (request) => ({ ...outcome(request), effect: 'unknown', usage: { status: 'unknown' } }) });
    await expect((await port.resolve({ kind: 'web.readPage', url: 'https://example.com' }, owner)).execute()).rejects.toThrow('unverified');
    expect(checkpoints.list()[0]).toMatchObject({ state: 'needs-review', effect: 'unknown', usage: { status: 'unknown' } });
    await expect(port.resolve({ kind: 'web.readPage', url: 'https://example.com' }, owner)).rejects.toThrow('review');
    port.dispose();
    const restarted = createMorpheusWorkerPort({ adapter: { run: async (request) => outcome(request) }, checkpoints: createMorpheusWorkerCheckpoints(directory), audit, appVersion: 'test' });
    await expect(restarted.resolve({ kind: 'web.readPage', url: 'https://example.com' }, owner)).rejects.toThrow('review');
    restarted.dispose();
  });
  it('does not run the adapter when the admission audit fails', async () => {
    const adapter = { run: vi.fn(async (request) => outcome(request)) };
    const { port, audit } = setup(adapter);
    vi.mocked(audit.recordControl).mockRejectedValue(new Error('disk full'));
    await expect((await port.resolve({ kind: 'web.readPage', url: 'https://example.com' }, owner)).execute()).rejects.toThrow('disk full');
    expect(adapter.run).not.toHaveBeenCalled(); port.dispose();
  });
});
