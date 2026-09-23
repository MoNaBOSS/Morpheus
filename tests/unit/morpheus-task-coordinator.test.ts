import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { actionResources, createMorpheusTaskCoordinator } from '@electron/services/morpheus/core/task-coordinator';

describe('Main task resource coordination', () => {
  it('allows disjoint work while serializing the desktop and canonical workspace aliases', async () => {
    const coordinator = createMorpheusTaskCoordinator();
    const signal = new AbortController().signal;
    const root = join(process.cwd(), 'workspace');
    const release = await coordinator.acquire(actionResources('file.createText', root), 'background', signal);
    let fileStarted = false;
    const waiting = coordinator.acquire(actionResources('file.appendText', join(root, '..', 'workspace')), 'interactive', signal)
      .then((done) => { fileStarted = true; return done; });
    const desktop = await coordinator.acquire(actionResources('app.launch', root), 'interactive', signal);
    expect(fileStarted).toBe(false);
    desktop(); release(); (await waiting)();
    expect(fileStarted).toBe(true);
    coordinator.dispose();
  });

  it('gives a queued manual command the next foreground lease before background work', async () => {
    const coordinator = createMorpheusTaskCoordinator();
    const signal = new AbortController().signal;
    const resource = [{ key: 'desktop', access: 'write' as const }];
    const release = await coordinator.acquire(resource, 'background', signal);
    const order: string[] = [];
    const background = coordinator.acquire(resource, 'background', signal).then((done) => { order.push('background'); done(); });
    const interactive = coordinator.acquire(resource, 'interactive', signal).then((done) => { order.push('interactive'); done(); });
    release(); await Promise.all([background, interactive]);
    expect(order).toEqual(['interactive', 'background']);
    coordinator.dispose();
  });

  it('removes cancelled waiters but holds the running lease until native work settles', async () => {
    const coordinator = createMorpheusTaskCoordinator();
    const owner = new AbortController();
    const queued = new AbortController();
    const resource = [{ key: 'desktop', access: 'write' as const }];
    const release = await coordinator.acquire(resource, 'interactive', owner.signal);
    const waiting = coordinator.acquire(resource, 'interactive', queued.signal);
    queued.abort();
    await expect(waiting).rejects.toThrow('cancelled');
    owner.abort();
    let started = false;
    const next = coordinator.acquire(resource, 'interactive', new AbortController().signal).then((done) => { started = true; done(); });
    await Promise.resolve(); expect(started).toBe(false);
    release(); await next; expect(started).toBe(true);
    coordinator.dispose();
  });

  it('bounds the queue and detects overlapping parent/child workspace roots', async () => {
    const coordinator = createMorpheusTaskCoordinator({ maxPending: 1 });
    const signal = new AbortController().signal;
    const root = join(process.cwd(), 'workspace');
    const release = await coordinator.acquire(actionResources('file.createText', root), 'interactive', signal);
    const pending = coordinator.acquire(actionResources('file.createText', join(root, 'child')), 'interactive', signal);
    await expect(coordinator.acquire([], 'interactive', signal)).rejects.toThrow('full');
    release(); (await pending)();
    coordinator.dispose();
  });
});
