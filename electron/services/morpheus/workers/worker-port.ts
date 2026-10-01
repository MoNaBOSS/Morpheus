import { randomUUID } from 'node:crypto';
import { isMorpheusWorkerAction } from '@shared/morpheus/worker-types';
import type { MorpheusActionId } from '@shared/morpheus/actions/registry';
import type { MorpheusActionResult } from '@shared/morpheus/action-types';
import type { MorpheusWorkerOperation, MorpheusWorkerOutcome, MorpheusWorkerOwner, MorpheusWorkerRequest, MorpheusWorkerProgress } from '@shared/morpheus/worker-types';
import type { MorpheusResolution } from '../capability-registry';
import type { MorpheusAuditSink } from '../audit';
import { createMorpheusTaskCoordinator } from '../core/task-coordinator';
import type { MorpheusWorkerCheckpoints, MorpheusWorkerCheckpoint } from './worker-checkpoints';

export interface MorpheusWorkerAdapter {
  supportedActions?(): readonly MorpheusActionId[];
  releaseOwner?(objectiveRunId: string): void | Promise<void>;
  dispose?(): void;
  run(request: MorpheusWorkerRequest, signal: AbortSignal, progress: (entry: MorpheusWorkerProgress) => Promise<void>): Promise<MorpheusWorkerOutcome>;
}

export interface MorpheusWorkerPort {
  supportedActions(): readonly MorpheusActionId[];
  resolve(operation: MorpheusWorkerOperation, owner: MorpheusWorkerOwner): Promise<MorpheusResolution>;
  dispose(): void;
  releaseOwner?(objectiveRunId: string): void | Promise<void>;
}

function normalizeUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2048) throw new Error('A public HTTPS URL without credentials is required.');
  url.hash = '';
  return url;
}

/** Injected into Core; no Gateway, ACP, renderer, provider or process dependency. */
export function createMorpheusWorkerPort(options: {
  adapter: MorpheusWorkerAdapter;
  checkpoints: MorpheusWorkerCheckpoints;
  audit: MorpheusAuditSink;
  appVersion: string;
  now?: () => Date;
  createId?: () => string;
  deadlineMs?: number;
}): MorpheusWorkerPort {
  const now = options.now ?? (() => new Date());
  const coordinator = createMorpheusTaskCoordinator({ maxActive: 1, maxPending: 32 });
  const active = new Set<AbortController>();
  const recovery = options.checkpoints.reconcile();
  let disposed = false;
  return {
    supportedActions: () => options.adapter.supportedActions?.() ?? ['web.readPage'],
    releaseOwner: (objectiveRunId) => options.adapter.releaseOwner?.(objectiveRunId),
    async resolve(operation, owner) {
      const allowedKeys = operation.kind === 'browser.interact' ? ['kind', 'url', 'sessionId', 'command'] : ['kind', 'url'];
      if (disposed || !isMorpheusWorkerAction(operation.kind)
        || !(options.adapter.supportedActions?.() ?? ['web.readPage']).includes(operation.kind)
        || Object.keys(operation).some((key) => !allowedKeys.includes(key))) throw new Error('Unsupported worker operation.');
      if (!['objectiveRunId', 'attemptId', 'planId', 'stepId'].every((key) => typeof owner[key as keyof MorpheusWorkerOwner] === 'string' && String(owner[key as keyof MorpheusWorkerOwner]).length <= 200)
        || !Number.isSafeInteger(owner.cancellationGeneration) || owner.cancellationGeneration < 0) throw new Error('Invalid worker ownership.');
      if (recovery.some((entry) => entry.objectiveRunId === owner.objectiveRunId && !entry.replaySafe)
        || options.checkpoints.list().some((entry) => entry.objectiveRunId === owner.objectiveRunId && entry.state === 'needs-review'
          && (entry.effect !== 'none' || entry.usage.status !== 'known'
            || entry.usage.inputTokens !== 0 || entry.usage.outputTokens !== 0 || entry.usage.costUsd !== 0))) throw new Error('Interrupted worker usage or side effects need review before continuing.');
      const url = normalizeUrl(operation.url);
      const worker: MorpheusWorkerRequest = {
        v: 1, ...owner, workerRunId: options.createId?.() ?? randomUUID(),
        operation: { ...structuredClone(operation), url: url.href },
        authority: operation.kind === 'web.readPage'
          ? { capabilityId: operation.kind, origins: [url.origin], service: 'public-https', tools: ['https.get'], providerRouteRef: 'local-public-http' }
          : { capabilityId: operation.kind, origins: [url.origin], service: 'public-browser', tools: ['browser.inspect', 'browser.interact'], providerRouteRef: 'local-public-browser' },
        limits: { deadlineAt: new Date(now().getTime() + Math.min(60_000, Math.max(1, options.deadlineMs ?? 30_000))).toISOString(), maxSteps: 4, maxOutputBytes: 32 * 1024, maxInputTokens: 0, maxOutputTokens: 0, maxCostUsd: 0 },
      };
      let consumed = false;
      return {
        target: { kind: 'none' },
        async execute(signal = new AbortController().signal): Promise<MorpheusActionResult> {
          if (consumed || disposed) throw new Error('Worker request already consumed or unavailable.');
          consumed = true;
          const controller = new AbortController();
          active.add(controller);
          const relay = () => controller.abort(signal.reason);
          signal.addEventListener('abort', relay, { once: true });
          if (signal.aborted) relay();
          const timeout = setTimeout(() => controller.abort(new DOMException('Worker deadline reached', 'TimeoutError')), Math.max(1, Date.parse(worker.limits.deadlineAt) - now().getTime()));
          timeout.unref?.();
          let release: (() => void) | undefined;
          let checkpoint: MorpheusWorkerCheckpoint = {
            v: 1, ...owner, workerRunId: worker.workerRunId, operation: operation.kind, origin: url.origin,
            state: 'running', effect: operation.kind === 'browser.interact' ? 'unknown' : 'none', usage: { status: 'known', inputTokens: 0, outputTokens: 0, costUsd: 0 }, updatedAt: now().toISOString(),
          };
          let latestSequence = 0;
          try {
            release = await coordinator.acquire([{ key: 'worker:heavy', access: 'write' }], 'background', controller.signal);
            controller.signal.throwIfAborted();
            options.checkpoints.put(checkpoint);
            await options.audit.recordControl({ category: 'objective', event: 'worker-started', subjectId: worker.workerRunId,
              details: { objectiveRunId: owner.objectiveRunId, attemptId: owner.attemptId, planId: owner.planId, stepId: owner.stepId, cancellationGeneration: owner.cancellationGeneration, operation: operation.kind, origin: url.origin }, appVersion: options.appVersion });
            controller.signal.throwIfAborted();
            const outcome = await options.adapter.run(structuredClone(worker), controller.signal, async (progress) => {
              if (controller.signal.aborted || progress.workerRunId !== worker.workerRunId
                || progress.cancellationGeneration !== owner.cancellationGeneration || !Number.isSafeInteger(progress.sequence)
                || progress.sequence <= latestSequence || progress.sequence > 8
                || !['retrieving', 'verified'].includes(progress.phase)) return;
              latestSequence = progress.sequence;
              await options.audit.recordControl({ category: 'objective', event: 'worker-progress', subjectId: worker.workerRunId,
                details: { phase: progress.phase, sequence: progress.sequence }, appVersion: options.appVersion });
            });
            controller.signal.throwIfAborted();
            checkpoint = { ...checkpoint, effect: outcome.effect, usage: outcome.usage };
            if (operation.kind !== 'web.readPage') {
              const snapshot = outcome.browser;
              if (outcome.workerRunId !== worker.workerRunId || !snapshot
                || outcome.effect !== (operation.kind === 'browser.interact' ? 'verified' : 'none')
                || outcome.usage.status !== 'known' || outcome.usage.costUsd !== 0 || outcome.usage.inputTokens !== 0 || outcome.usage.outputTokens !== 0
                || normalizeUrl(snapshot.url).origin !== url.origin || !/^[a-f0-9-]{36}$/.test(snapshot.sessionId) || !/^[a-f0-9-]{36}$/.test(snapshot.revision)
                || typeof snapshot.title !== 'string' || snapshot.title.length > 240 || typeof snapshot.text !== 'string'
                || !Array.isArray(snapshot.controls) || snapshot.controls.length > 100
                || snapshot.controls.some((control) => !/^e\d{1,3}$/.test(control.ref) || !['link', 'button', 'input', 'select'].includes(control.kind)
                  || typeof control.name !== 'string' || control.name.length > 180 || control.href && normalizeUrl(control.href).origin !== url.origin)
                || !Number.isSafeInteger(snapshot.blockedRequests) || snapshot.blockedRequests < 0 || typeof snapshot.truncated !== 'boolean'
                || Buffer.byteLength(JSON.stringify(snapshot)) > worker.limits.maxOutputBytes) throw new Error('Worker returned unverified browser evidence.');
              checkpoint = { ...checkpoint, state: 'completed', updatedAt: now().toISOString() };
              options.checkpoints.put(checkpoint);
              await options.audit.recordControl({ category: 'objective', event: 'worker-completed', subjectId: worker.workerRunId,
                details: { origin: url.origin, controls: snapshot.controls.length, usageStatus: 'known', effect: outcome.effect }, appVersion: options.appVersion });
              controller.signal.throwIfAborted();
              return { kind: 'browser', snapshot, workerRunId: worker.workerRunId };
            }
            const source = outcome.source;
            if (!source || outcome.workerRunId !== worker.workerRunId || outcome.effect !== 'none'
              || outcome.usage.status !== 'known' || outcome.usage.inputTokens !== 0 || outcome.usage.outputTokens !== 0 || outcome.usage.costUsd !== 0
              || normalizeUrl(source.originalUrl).href !== worker.operation.url || normalizeUrl(source.finalUrl).origin !== url.origin
              || typeof source.title !== 'string' || source.title.length > 240 || typeof source.excerpt !== 'string'
              || !source.excerpt.trim() || Buffer.byteLength(source.excerpt, 'utf8') > worker.limits.maxOutputBytes
              || !/^[a-f0-9]{64}$/.test(source.contentSha256) || source.location !== 'body-text'
              || !Number.isSafeInteger(source.bytes) || source.bytes < 1 || source.bytes > 512 * 1024
              || !Number.isFinite(Date.parse(source.retrievedAt))) throw new Error('Worker returned unverified source, usage or effects.');
            checkpoint = { ...checkpoint, state: 'completed', contentSha256: source.contentSha256, updatedAt: now().toISOString() };
            options.checkpoints.put(checkpoint);
            await options.audit.recordControl({ category: 'objective', event: 'worker-completed', subjectId: worker.workerRunId,
              details: { origin: url.origin, contentSha256: source.contentSha256, sourceBytes: source.bytes, inputTokens: 0, outputTokens: 0, costUsd: 0, usageStatus: 'known', effect: 'none' }, appVersion: options.appVersion });
            controller.signal.throwIfAborted();
            return { kind: 'source', source, workerRunId: worker.workerRunId, usage: outcome.usage };
          } catch (error) {
            const uncertain = checkpoint.effect !== 'none' || checkpoint.usage.status !== 'known'
              || checkpoint.usage.inputTokens !== 0 || checkpoint.usage.outputTokens !== 0 || checkpoint.usage.costUsd !== 0;
            checkpoint = { ...checkpoint, state: uncertain ? 'needs-review' : controller.signal.aborted ? 'cancelled' : 'failed', updatedAt: now().toISOString() };
            options.checkpoints.put(checkpoint);
            await options.audit.recordControl({ category: 'objective', event: 'worker-stopped', subjectId: worker.workerRunId,
              details: { state: checkpoint.state, usageStatus: checkpoint.usage.status, effect: checkpoint.effect }, appVersion: options.appVersion });
            throw controller.signal.aborted ? controller.signal.reason : error;
          } finally {
            clearTimeout(timeout);
            signal.removeEventListener('abort', relay);
            active.delete(controller);
            release?.();
          }
        },
      };
    },
    dispose() {
      disposed = true;
      for (const controller of active) controller.abort(new DOMException('Morpheus shutting down', 'AbortError'));
      options.adapter.dispose?.();
      coordinator.dispose();
    },
  };
}
