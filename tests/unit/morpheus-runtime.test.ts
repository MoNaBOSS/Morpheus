import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMorpheusRuntime,
  buildAuditParams,
  MorpheusRequestError,
  type MorpheusRuntime,
} from '@electron/services/morpheus/runtime';
import {
  createMorpheusCapabilityRegistry,
  MorpheusCapabilityError,
  type MorpheusCapability,
  type MorpheusCapabilityRegistry,
} from '@electron/services/morpheus/capability-registry';
import type { MorpheusAuditSink } from '@electron/services/morpheus/audit';
import type { MorpheusPermissionGate } from '@electron/services/morpheus/policy/permission-gate';
import { createMorpheusGrantStore } from '@electron/services/morpheus/policy/grant-store';
import type { MorpheusRootProvider } from '@electron/services/morpheus/roots';
import type { MorpheusActionEvent, MorpheusAuditEntry } from '@shared/morpheus/action-types';
import { getMorpheusActionDescriptor } from '@shared/morpheus/actions/registry';

const roots: MorpheusRootProvider = { resolve: () => 'C:\\root' };

/**
 * These tests exercise run lifecycle, not policy. An always-prompt gate keeps
 * every assertion about ordering, idempotency and limits meaningful; profile
 * and grant behaviour is covered by morpheus-policy-engine.test.ts.
 */
function alwaysPromptGate(): MorpheusPermissionGate {
  return {
    evaluate: () => ({ outcome: 'prompt', reason: 'prompt-required' }),
    recordGrantUse: () => {},
  };
}

type Harness = {
  runtime: MorpheusRuntime;
  events: MorpheusActionEvent[];
  audited: MorpheusAuditEntry[];
  /** Interleaved log proving audit writes land before emissions. */
  order: string[];
  executeSpy: ReturnType<typeof vi.fn>;
  registry: MorpheusCapabilityRegistry;
};

function makeCapability(executeSpy: ReturnType<typeof vi.fn>, overrides: Partial<MorpheusCapability> = {}): MorpheusCapability {
  return {
    actionId: 'system.report',
    platform: 'win32',
    resolve: async () => ({
      target: { kind: 'none' },
      execute: executeSpy,
    }),
    ...overrides,
  } as MorpheusCapability;
}

function makeHarness(options: {
  gate?: MorpheusPermissionGate;
  capability?: MorpheusCapability;
  platform?: string;
  permissionTimeoutMs?: number;
  auditFails?: boolean;
} = {}): Harness {
  const events: MorpheusActionEvent[] = [];
  const audited: MorpheusAuditEntry[] = [];
  const order: string[] = [];

  const executeSpy = vi.fn(async () => ({ kind: 'system' as const, info: { appVersion: '0.1.0' } as never }));

  const registry = createMorpheusCapabilityRegistry();
  registry.register(options.capability ?? makeCapability(executeSpy));

  const audit: MorpheusAuditSink = {
    async record(entry) {
      if (options.auditFails) throw new Error('disk full');
      // Defer a tick so an unordered implementation would visibly interleave.
      await Promise.resolve();
      audited.push(entry);
      order.push(`audit:${entry.phase}`);
    },
    async recent() {
      return { entries: audited.slice(-10), truncated: false };
    },
    isHealthy: () => !options.auditFails,
  };

  const runtime = createMorpheusRuntime({
    registry,
    roots,
    audit,
    gate: options.gate ?? alwaysPromptGate(),
    grants: createMorpheusGrantStore({ userDataDir: mkdtempSync(join(tmpdir(), 'morpheus-runtime-')) }),
    appVersion: '0.1.0',
    platform: options.platform ?? 'win32',
    env: { SystemRoot: 'C:\\Windows' },
    permissionTimeoutMs: options.permissionTimeoutMs,
    createRunId: (() => {
      let n = 0;
      return () => {
        n += 1;
        return `run-${n}`;
      };
    })(),
    emit: (event) => {
      events.push(event);
      order.push(`emit:${event.phase}`);
    },
  });

  return { runtime, events, audited, order, executeSpy, registry };
}

beforeEach(() => {
  vi.useRealTimers();
});

describe('morpheus runtime — permission gate', () => {
  it('never executes without an explicit grant', async () => {
    const h = makeHarness();
    await h.runtime.requestAction({ actionId: 'system.report' });

    expect(h.executeSpy).not.toHaveBeenCalled();
    expect(h.events.map((e) => e.phase)).toEqual(['requested', 'awaiting-permission']);
  });

  it('executes only after a grant', async () => {
    const h = makeHarness();
    const { runId } = await h.runtime.requestAction({ actionId: 'system.report' });
    await h.runtime.respondPermission({ runId, decision: 'granted' });

    expect(h.executeSpy).toHaveBeenCalledTimes(1);
    expect(h.events.map((e) => e.phase)).toEqual(['requested', 'awaiting-permission', 'running', 'succeeded']);
  });

  it('performs no work on denial', async () => {
    const h = makeHarness();
    const { runId } = await h.runtime.requestAction({ actionId: 'system.report' });
    await h.runtime.respondPermission({ runId, decision: 'denied' });

    expect(h.executeSpy).not.toHaveBeenCalled();
    expect(h.events.map((e) => e.phase)).toEqual(['requested', 'awaiting-permission', 'denied']);
    expect(h.audited.at(-1)).toMatchObject({ phase: 'denied', decision: 'denied' });
  });

  it('is idempotent: a repeated response cannot start a second run', async () => {
    const h = makeHarness();
    const { runId } = await h.runtime.requestAction({ actionId: 'system.report' });

    const first = await h.runtime.respondPermission({ runId, decision: 'granted' });
    const second = await h.runtime.respondPermission({ runId, decision: 'granted' });

    expect(first).toEqual({ accepted: true });
    expect(second).toEqual({ accepted: false });
    expect(h.executeSpy).toHaveBeenCalledTimes(1);
  });

  it('cannot be flipped from denied to granted after the fact', async () => {
    const h = makeHarness();
    const { runId } = await h.runtime.requestAction({ actionId: 'system.report' });
    await h.runtime.respondPermission({ runId, decision: 'denied' });
    const late = await h.runtime.respondPermission({ runId, decision: 'granted' });

    expect(late).toEqual({ accepted: false });
    expect(h.executeSpy).not.toHaveBeenCalled();
  });

  it('ignores a response for an unknown run id', async () => {
    const h = makeHarness();
    expect(await h.runtime.respondPermission({ runId: 'nope', decision: 'granted' })).toEqual({ accepted: false });
    expect(h.executeSpy).not.toHaveBeenCalled();
  });

  it('rejects a malformed decision', async () => {
    const h = makeHarness();
    const { runId } = await h.runtime.requestAction({ actionId: 'system.report' });
    await expect(h.runtime.respondPermission({ runId, decision: 'maybe' as never }))
      .rejects.toThrow(MorpheusRequestError);
    expect(h.executeSpy).not.toHaveBeenCalled();
  });

  it('auto-denies an unanswered confirmation', async () => {
    const h = makeHarness({ permissionTimeoutMs: 10 });
    await h.runtime.requestAction({ actionId: 'system.report' });

    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(h.executeSpy).not.toHaveBeenCalled();
    expect(h.events.map((e) => e.phase)).toEqual(['requested', 'awaiting-permission', 'timed-out']);
    expect(h.events.at(-1)?.error?.code).toBe('permission-timeout');
  });

  it('honours a policy gate that denies outright', async () => {
    const gate: MorpheusPermissionGate = {
      evaluate: () => ({ outcome: 'deny', reason: 'persistent-denial' }),
      recordGrantUse: () => {},
    };
    const h = makeHarness({ gate });
    await h.runtime.requestAction({ actionId: 'system.report' });

    expect(h.executeSpy).not.toHaveBeenCalled();
    expect(h.events.map((e) => e.phase)).toEqual(['requested', 'denied']);
  });

  it('cancels a pending run without executing', async () => {
    const h = makeHarness();
    const { runId } = await h.runtime.requestAction({ actionId: 'system.report' });
    expect(await h.runtime.cancelAction({ runId })).toEqual({ accepted: true });
    expect(await h.runtime.cancelAction({ runId })).toEqual({ accepted: false });

    expect(h.executeSpy).not.toHaveBeenCalled();
    expect(h.events.map((e) => e.phase)).toEqual(['requested', 'awaiting-permission', 'cancelled']);
  });
});

describe('morpheus runtime — audit ordering', () => {
  it('writes the audit record before emitting each phase', async () => {
    const h = makeHarness();
    const { runId } = await h.runtime.requestAction({ actionId: 'system.report' });
    await h.runtime.respondPermission({ runId, decision: 'granted' });

    expect(h.order).toEqual([
      'audit:requested', 'emit:requested',
      'audit:awaiting-permission', 'emit:awaiting-permission',
      'audit:running', 'emit:running',
      'audit:succeeded', 'emit:succeeded',
    ]);
  });

  it('assigns strictly increasing sequence numbers shared by audit and events', async () => {
    const h = makeHarness();
    const { runId } = await h.runtime.requestAction({ actionId: 'system.report' });
    await h.runtime.respondPermission({ runId, decision: 'granted' });

    expect(h.events.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(h.audited.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  });

  it('still surfaces the phase when the audit sink fails', async () => {
    const h = makeHarness({ auditFails: true });
    const { runId } = await h.runtime.requestAction({ actionId: 'system.report' });
    await h.runtime.respondPermission({ runId, decision: 'granted' });

    // The run stays visible rather than vanishing, but nothing is silently
    // upgraded: the sink failure is the sink's problem to report.
    expect(h.events.map((e) => e.phase)).toEqual(['requested', 'awaiting-permission', 'running', 'succeeded']);
  });
});

describe('morpheus runtime — validation and limits', () => {
  it('rejects an unknown action at the boundary without creating a run', async () => {
    const h = makeHarness();
    await expect(h.runtime.requestAction({ actionId: 'shell.exec' })).rejects.toThrow(MorpheusRequestError);
    await expect(h.runtime.requestAction({ actionId: '__proto__' })).rejects.toThrow(/Unknown Morpheus action/);
    await expect(h.runtime.requestAction({ actionId: 'constructor' })).rejects.toThrow(/Unknown Morpheus action/);
    expect(h.events).toHaveLength(0);
  });

  it('reports an unsupported platform as a normal terminal phase', async () => {
    const h = makeHarness({ platform: 'linux' });
    await h.runtime.requestAction({ actionId: 'system.report' });

    expect(h.executeSpy).not.toHaveBeenCalled();
    expect(h.events.map((e) => e.phase)).toEqual(['requested', 'unsupported-platform']);
    expect(h.events.at(-1)?.error?.code).toBe('unsupported-platform');
  });

  it('records a resolution failure without executing', async () => {
    const executeSpy = vi.fn();
    const capability = makeCapability(executeSpy, {
      resolve: async () => {
        throw new MorpheusCapabilityError('invalid-params', 'File name rejected');
      },
    });
    const h = makeHarness({ capability });
    await h.runtime.requestAction({ actionId: 'system.report' });

    expect(executeSpy).not.toHaveBeenCalled();
    expect(h.events.map((e) => e.phase)).toEqual(['requested', 'failed']);
    expect(h.events.at(-1)?.error).toMatchObject({ code: 'invalid-params' });
  });

  it('records an execution failure', async () => {
    const executeSpy = vi.fn(async () => {
      throw new MorpheusCapabilityError('execution-failed', 'boom');
    });
    const h = makeHarness({ capability: makeCapability(executeSpy) });
    const { runId } = await h.runtime.requestAction({ actionId: 'system.report' });
    await h.runtime.respondPermission({ runId, decision: 'granted' });

    expect(h.events.map((e) => e.phase)).toEqual(['requested', 'awaiting-permission', 'running', 'failed']);
    expect(h.events.at(-1)?.error).toMatchObject({ code: 'execution-failed' });
  });

  it('allows only one run in flight', async () => {
    const h = makeHarness();
    await h.runtime.requestAction({ actionId: 'system.report' });
    await h.runtime.requestAction({ actionId: 'system.report' });

    const phases = h.events.map((e) => e.phase);
    expect(phases).toEqual(['requested', 'awaiting-permission', 'requested', 'failed']);
    expect(h.events.at(-1)?.error?.code).toBe('rate-limited');
    expect(h.executeSpy).not.toHaveBeenCalled();
  });

  it('enforces the per-minute request ceiling', async () => {
    const h = makeHarness();
    for (let i = 0; i < 12; i += 1) {
      const { runId } = await h.runtime.requestAction({ actionId: 'system.report' });
      await h.runtime.cancelAction({ runId });
    }

    const rateLimited = h.events.filter((e) => e.error?.code === 'rate-limited');
    expect(rateLimited.length).toBeGreaterThan(0);
  });

  it('frees the slot once a run settles', async () => {
    const h = makeHarness();
    const first = await h.runtime.requestAction({ actionId: 'system.report' });
    await h.runtime.respondPermission({ runId: first.runId, decision: 'granted' });

    h.events.length = 0;
    const second = await h.runtime.requestAction({ actionId: 'system.report' });
    await h.runtime.respondPermission({ runId: second.runId, decision: 'granted' });

    expect(h.events.map((e) => e.phase)).toEqual(['requested', 'awaiting-permission', 'running', 'succeeded']);
    expect(h.executeSpy).toHaveBeenCalledTimes(2);
  });
});

describe('morpheus runtime — surface', () => {
  it('describes actions with per-platform availability', () => {
    expect(makeHarness().runtime.describeActions()).toEqual({
      platform: 'win32',
      actions: [
        { actionId: 'app.launch', supported: false },
        { actionId: 'file.createText', supported: false },
        { actionId: 'system.report', supported: true },
      ],
      applicationKeys: ['notepad'],
    });
  });

  it('reports every action as unsupported on a platform with no capabilities', () => {
    const described = makeHarness({ platform: 'darwin' }).runtime.describeActions();
    expect(described.platform).toBe('darwin');
    expect(described.actions.every((a) => !a.supported)).toBe(true);
  });

  it('returns system info without a run, a gate or an audit record', async () => {
    const h = makeHarness();
    const info = h.runtime.systemInfo();
    expect(info.appVersion).toBe('0.1.0');
    expect(h.events).toHaveLength(0);
    expect(h.audited).toHaveLength(0);
  });

  it('clears pending timers on dispose', async () => {
    const h = makeHarness({ permissionTimeoutMs: 10 });
    await h.runtime.requestAction({ actionId: 'system.report' });
    h.runtime.dispose();

    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(h.events.map((e) => e.phase)).toEqual(['requested', 'awaiting-permission']);
  });
});

describe('buildAuditParams', () => {
  it('replaces content with a byte count and digest', () => {
    expect(buildAuditParams('file.createText', { fileName: 'a.txt', content: 'hello' })).toEqual({
      fileName: 'a.txt',
      contentBytes: 5,
      contentSha256: '2cf24dba5fb0a30e',
    });
  });

  it('never carries the content itself', () => {
    const params = buildAuditParams('file.createText', { fileName: 'a.txt', content: 'SECRET' });
    expect(JSON.stringify(params)).not.toContain('SECRET');
  });

  it('passes through the application key and omits absent fields', () => {
    expect(buildAuditParams('app.launch', { applicationKey: 'notepad' })).toEqual({ applicationKey: 'notepad' });
    expect(buildAuditParams('app.launch', {})).toEqual({});
    expect(buildAuditParams('system.report', {})).toEqual({});
  });

  it('counts bytes rather than code units for multi-byte content', () => {
    expect(buildAuditParams('file.createText', { content: '😀' }).contentBytes).toBe(4);
  });

  it('drops a key the action does not declare, so a stray payload cannot reach the audit', () => {
    // Defence in depth: the API validator already rejects unknown keys. If a
    // future caller bypasses it, the audit still records only declared params.
    expect(buildAuditParams('app.launch', { applicationKey: 'notepad', token: 'sk-live-secret' }))
      .toEqual({ applicationKey: 'notepad' });
  });

  it('digests any textContent parameter, not a hardcoded key named "content"', () => {
    // The rule is driven by the descriptor KIND, so a capability added later
    // gets redaction without anyone remembering to update this function.
    for (const descriptor of getMorpheusActionDescriptor('file.createText').params) {
      if (descriptor.kind !== 'textContent') continue;
      const audited = buildAuditParams('file.createText', { [descriptor.key]: 'SECRET' });
      expect(audited[`${descriptor.key}Bytes`]).toBe(6);
      expect(JSON.stringify(audited)).not.toContain('SECRET');
    }
  });
});
