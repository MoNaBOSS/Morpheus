import type { MorpheusWorkerAdapter } from '../morpheus/workers/worker-port';
import type { MorpheusWorkerRequest } from '@shared/morpheus/worker-types';
import { createPublicSourceWorkerAdapter } from '../public-source-worker-adapter';
import { createTaskBrowser, validateBrowserCommand, type MorpheusTaskBrowser } from './session';
import { publicBrowserUrl } from './network';

/** One composed adapter, not a second executor. Main's port owns scheduling,
 * permission and audit. Persistent browser handles are scoped to one objective
 * and cancellation generation, never transferable by knowing the session id. */
export function createBrowserWorkerAdapter(options: { createBrowser?: typeof createTaskBrowser } = {}): MorpheusWorkerAdapter {
  const reader = createPublicSourceWorkerAdapter();
  type Entry = { browser: MorpheusTaskBrowser; controller: AbortController; generation: number; timer: ReturnType<typeof setTimeout> };
  const sessions = new Map<string, Entry>();
  const releaseOwner = async (owner: string) => {
    const entry = sessions.get(owner);
    if (!entry) return;
    sessions.delete(owner);
    clearTimeout(entry.timer);
    entry.controller.abort();
    await entry.browser.close();
  };
  const validate = (request: MorpheusWorkerRequest) => {
    if (!['browser.inspect', 'browser.interact'].includes(request.operation.kind)
      || request.authority.service !== 'public-browser' || request.authority.providerRouteRef !== 'local-public-browser'
      || request.authority.origins.length !== 1 || request.authority.capabilityId !== request.operation.kind
      || request.authority.tools.join(',') !== 'browser.inspect,browser.interact') throw new Error('Unsupported browser authority.');
    publicBrowserUrl(request.operation.url, request.authority.origins[0]);
    if (request.operation.kind === 'browser.interact') validateBrowserCommand(request.operation.command);
  };
  return {
    supportedActions: () => ['web.readPage', 'browser.inspect', 'browser.interact'],
    releaseOwner,
    dispose: () => { for (const owner of [...sessions.keys()]) void releaseOwner(owner).catch(() => {}); },
    async run(request, signal, progress) {
      if (request.operation.kind === 'web.readPage') return reader.run(request, signal, progress);
      validate(request);
      signal.throwIfAborted();
      const owner = request.objectiveRunId;
      const abort = () => { void releaseOwner(owner).catch(() => {}); };
      signal.addEventListener('abort', abort, { once: true });
      try {
        await progress({ workerRunId: request.workerRunId, cancellationGeneration: request.cancellationGeneration, sequence: 1, phase: 'retrieving' });
        let entry = sessions.get(owner);
        let browser;
        if (request.operation.kind === 'browser.inspect') {
          await releaseOwner(owner);
          if (sessions.size >= 4) throw new Error('Public browser session capacity reached.');
          const controller = new AbortController();
          const cancelSetup = () => controller.abort(signal.reason);
          signal.addEventListener('abort', cancelSetup, { once: true });
          if (signal.aborted) cancelSetup();
          try { browser = await (options.createBrowser ?? createTaskBrowser)({ url: request.operation.url, signal: controller.signal }); }
          finally { signal.removeEventListener('abort', cancelSetup); }
          const timer = setTimeout(() => { void releaseOwner(owner).catch(() => {}); }, 120_000);
          timer.unref();
          entry = { browser, controller, generation: request.cancellationGeneration, timer };
          sessions.set(owner, entry);
          signal.throwIfAborted();
        }
        if (!entry || entry.generation !== request.cancellationGeneration || entry.browser.origin !== request.authority.origins[0]
          || request.operation.kind === 'browser.interact' && entry.browser.id !== request.operation.sessionId) throw new Error('Browser session expired or belongs to another task; inspect the page again.');
        const snapshot = request.operation.kind === 'browser.inspect' ? await entry.browser.snapshot() : await entry.browser.act(request.operation.command);
        signal.throwIfAborted();
        // The combined snapshot, not just its text, must fit the Core context cap.
        while (Buffer.byteLength(JSON.stringify(snapshot)) > request.limits.maxOutputBytes && snapshot.controls.length) { snapshot.controls.pop(); snapshot.truncated = true; }
        while (Buffer.byteLength(JSON.stringify(snapshot)) > request.limits.maxOutputBytes && snapshot.text.length) { snapshot.text = snapshot.text.slice(0, Math.floor(snapshot.text.length / 2)); snapshot.truncated = true; }
        await progress({ workerRunId: request.workerRunId, cancellationGeneration: request.cancellationGeneration, sequence: 2, phase: 'verified' });
        return { workerRunId: request.workerRunId, browser: snapshot, effect: request.operation.kind === 'browser.interact' ? 'verified' : 'none', usage: { status: 'known', inputTokens: 0, outputTokens: 0, costUsd: 0 } };
      } catch (error) { await releaseOwner(owner); throw error; }
      finally { signal.removeEventListener('abort', abort); }
    },
  };
}
