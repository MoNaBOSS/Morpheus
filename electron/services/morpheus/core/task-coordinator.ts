import { resolve, sep } from 'node:path';
import { getMorpheusActionDescriptor, type MorpheusActionId } from '@shared/morpheus/actions/registry';
import type { ExecutionOriginType } from '@shared/morpheus/execution-types';

export type TaskResource = { key: string; access: 'read' | 'write' };
export type TaskPriority = 'interactive' | 'background';

export function taskPriority(origin: ExecutionOriginType): TaskPriority {
  return ['schedule', 'proactive', 'goal', 'system'].includes(origin) ? 'background' : 'interactive';
}

export function actionResources(actionId: MorpheusActionId, root: string): TaskResource[] {
  const descriptor = getMorpheusActionDescriptor(actionId);
  const resources: TaskResource[] = [];
  // A workspace lease protects dependent multi-step writes, directory operations
  // and read-after-write sequences, including aliases of the same physical root.
  if (descriptor.rootKey || actionId === 'site.verify' || actionId === 'dev.launchProject') {
    resources.push({ key: `files:${resolve(root).replace(/[\\/]+$/, '').toLowerCase()}`, access: 'write' });
  }
  if (['app.launch', 'web.openUrl', 'dev.launchProject', 'screen.capture'].includes(actionId)) {
    resources.push({ key: 'desktop', access: 'write' });
  }
  if (actionId.startsWith('clipboard.')) resources.push({ key: 'clipboard', access: 'write' });
  if (actionId === 'reminder.schedule') resources.push({ key: 'reminders', access: 'write' });
  return resources;
}

function overlaps(a: TaskResource, b: TaskResource): boolean {
  const same = a.key === b.key || (a.key.startsWith('files:') && b.key.startsWith('files:')
    && (a.key.startsWith(`${b.key}${sep}`) || b.key.startsWith(`${a.key}${sep}`)));
  return same && (a.access === 'write' || b.access === 'write');
}

/** Bounded, abortable, atomic leases. No task holds half a resource set. */
export function createMorpheusTaskCoordinator(options: { maxActive?: number; maxPending?: number } = {}) {
  const maxActive = options.maxActive ?? 4;
  const maxPending = options.maxPending ?? 32;
  const running = new Set<Waiter>();
  const pending: Waiter[] = [];
  let disposed = false;
  type Waiter = {
    resources: readonly TaskResource[];
    priority: TaskPriority;
    resolve: (release: () => void) => void;
    reject: (error: Error) => void;
    signal: AbortSignal;
    abort: () => void;
    addedAt: number;
    countsTowardLimit: boolean;
  };
  const conflicts = (a: Waiter, b: Waiter) => a.resources.some((left) => b.resources.some((right) => overlaps(left, right)));
  const pump = (): void => {
    if (disposed) return;
    // Aging prevents an endless stream of commands from starving background work.
    const weight = (entry: Waiter) => entry.priority === 'interactive' || Date.now() - entry.addedAt > 30_000 ? 0 : 1;
    pending.sort((a, b) => weight(a) - weight(b) || a.addedAt - b.addedAt);
    for (let i = 0; i < pending.length;) {
      const entry = pending[i];
      if (entry.countsTowardLimit && [...running].filter((other) => other.countsTowardLimit).length >= maxActive
        || [...running].some((other) => conflicts(entry, other))
        || pending.slice(0, i).some((other) => conflicts(entry, other))) { i += 1; continue; }
      pending.splice(i, 1);
      entry.signal.removeEventListener('abort', entry.abort);
      running.add(entry);
      let released = false;
      entry.resolve(() => {
        if (released) return;
        released = true;
        running.delete(entry);
        pump();
      });
    }
  };
  return {
    acquire(resources: readonly TaskResource[], priority: TaskPriority, signal: AbortSignal,
      admission: { countsTowardLimit?: boolean } = {}): Promise<() => void> {
      if (disposed || signal.aborted) return Promise.reject(new DOMException('Task cancelled', 'AbortError'));
      if (pending.length >= maxPending) return Promise.reject(new Error('Morpheus task queue is full.'));
      return new Promise((resolvePromise, reject) => {
        const entry: Waiter = {
          resources, priority, signal, resolve: resolvePromise, reject, addedAt: Date.now(), countsTowardLimit: admission.countsTowardLimit ?? true,
          abort: () => {
            const index = pending.indexOf(entry);
            if (index >= 0) pending.splice(index, 1);
            signal.removeEventListener('abort', entry.abort);
            reject(new DOMException('Task cancelled', 'AbortError'));
            pump();
          },
        };
        pending.push(entry);
        signal.addEventListener('abort', entry.abort, { once: true });
        pump();
      });
    },
    dispose() {
      disposed = true;
      for (const entry of pending.splice(0)) {
        entry.signal.removeEventListener('abort', entry.abort);
        entry.reject(new DOMException('Morpheus shutting down', 'AbortError'));
      }
      // Running leases are released only when their native operation settles.
    },
  };
}
