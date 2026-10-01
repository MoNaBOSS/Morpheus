import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createBrowserWorkerAdapter } from '@electron/services/task-browser/worker-adapter';
import type { createTaskBrowser } from '@electron/services/task-browser/session';
import type { MorpheusWorkerRequest } from '@shared/morpheus/worker-types';
import type { MorpheusBrowserSnapshot } from '@shared/morpheus/browser-types';

vi.mock('electron', () => ({ BrowserWindow: vi.fn(), session: {} }));
const observation = (): MorpheusBrowserSnapshot => ({ sessionId: randomUUID(), revision: randomUUID(), url: 'https://example.com/', title: 'Observed', text: 'Books', controls: [{ ref: 'e1', kind: 'button', name: 'Search' }], truncated: false, blockedRequests: 0 });
function request(owner = 'objective'): MorpheusWorkerRequest {
  return { v: 1, objectiveRunId: owner, attemptId: 'attempt', planId: 'plan', stepId: 'step', workerRunId: randomUUID(), cancellationGeneration: 1,
    operation: { kind: 'browser.inspect', url: 'https://example.com/' },
    authority: { capabilityId: 'browser.inspect', service: 'public-browser', origins: ['https://example.com'], tools: ['browser.inspect', 'browser.interact'], providerRouteRef: 'local-public-browser' },
    limits: { deadlineAt: new Date(Date.now() + 10000).toISOString(), maxSteps: 4, maxOutputBytes: 32768, maxInputTokens: 0, maxOutputTokens: 0, maxCostUsd: 0 } };
}
function fixture() {
  const observed = observation();
  const browser = { id: observed.sessionId, origin: 'https://example.com', snapshot: vi.fn(async () => structuredClone(observed)), act: vi.fn(async () => structuredClone(observed)), navigate: vi.fn(), close: vi.fn(async () => {}) };
  const createBrowser = vi.fn(async () => browser) as unknown as typeof createTaskBrowser;
  const adapter = createBrowserWorkerAdapter({ createBrowser });
  const progress = vi.fn(async () => {});
  return { observed, browser, createBrowser, adapter, progress };
}
function interact(observed: MorpheusBrowserSnapshot, owner = 'objective'): MorpheusWorkerRequest {
  const base = request(owner);
  return { ...base, operation: { kind: 'browser.interact', url: observed.url, sessionId: observed.sessionId, command: { kind: 'click', revision: observed.revision, ref: 'e1' } }, authority: { ...base.authority, capabilityId: 'browser.interact' } };
}

describe('Main browser worker ownership', () => {
  it('reuses only the owning objective session across review attempts and releases it on completion', async () => {
    const { adapter, browser, observed, progress, createBrowser } = fixture();
    await adapter.run(request(), new AbortController().signal, progress);
    const result = await adapter.run({ ...interact(observed), attemptId: 'second-attempt', planId: 'second-plan' }, new AbortController().signal, progress);
    expect(result).toMatchObject({ browser: observed, effect: 'verified', usage: { costUsd: 0 } });
    expect(createBrowser).toHaveBeenCalledTimes(1);
    expect(browser.act).toHaveBeenCalledTimes(1);
    adapter.releaseOwner!('objective');
    expect(browser.close).toHaveBeenCalledTimes(1);
    adapter.dispose!();
  });
  it('rejects another owner or generation even with a real observed session id', async () => {
    const { adapter, browser, observed, progress } = fixture();
    await adapter.run(request(), new AbortController().signal, progress);
    await expect(adapter.run(interact(observed, 'attacker'), new AbortController().signal, progress)).rejects.toThrow('another task');
    expect(browser.act).not.toHaveBeenCalled();
    expect(browser.close).not.toHaveBeenCalled();
    await expect(adapter.run({ ...interact(observed), cancellationGeneration: 2 }, new AbortController().signal, progress)).rejects.toThrow('another task');
    expect(browser.act).not.toHaveBeenCalled();
    adapter.dispose!();
  });
  it('bounds combined DOM evidence without inventing controls', async () => {
    const { adapter, browser, progress } = fixture();
    browser.snapshot.mockResolvedValue({ ...observation(), text: '語'.repeat(16000) });
    const result = await adapter.run(request(), new AbortController().signal, progress);
    expect(Buffer.byteLength(JSON.stringify(result.browser))).toBeLessThanOrEqual(32768);
    expect(result.browser?.truncated).toBe(true);
    adapter.dispose!();
  });
  it('does not dispatch when control authority contains generated JavaScript or another origin', async () => {
    const { adapter, browser, observed, progress } = fixture();
    await adapter.run(request(), new AbortController().signal, progress);
    const bad = interact(observed);
    if (bad.operation.kind !== 'browser.interact') throw new Error('test');
    Object.assign(bad.operation.command, { script: 'process.exit()' });
    await expect(adapter.run(bad, new AbortController().signal, progress)).rejects.toThrow('Invalid typed');
    await expect(adapter.run({ ...request(), authority: { ...request().authority, origins: ['https://other.com'] } }, new AbortController().signal, progress)).rejects.toThrow('origin');
    expect(browser.act).not.toHaveBeenCalled();
    adapter.dispose!();
  });
  it('cancels the owned browser and discards late results', async () => {
    const { adapter, browser, observed, progress } = fixture();
    await adapter.run(request(), new AbortController().signal, progress);
    const controller = new AbortController();
    browser.act.mockImplementation(async () => { controller.abort(); return observed; });
    await expect(adapter.run(interact(observed), controller.signal, progress)).rejects.toThrow();
    expect(browser.close).toHaveBeenCalledTimes(1);
    adapter.dispose!();
  });
});
