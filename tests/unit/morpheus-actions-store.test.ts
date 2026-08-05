import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  auditRecentMock,
  cancelActionMock,
  describeActionsMock,
  onMorpheusActionEventMock,
  requestActionMock,
  respondPermissionMock,
  systemInfoMock,
} = vi.hoisted(() => ({
  auditRecentMock: vi.fn(),
  cancelActionMock: vi.fn(),
  describeActionsMock: vi.fn(),
  onMorpheusActionEventMock: vi.fn(),
  requestActionMock: vi.fn(),
  respondPermissionMock: vi.fn(),
  systemInfoMock: vi.fn(),
}));

vi.mock('@/lib/host-api', () => ({
  hostApi: {
    morpheus: {
      describeActions: describeActionsMock,
      systemInfo: systemInfoMock,
      requestAction: requestActionMock,
      respondPermission: respondPermissionMock,
      cancelAction: cancelActionMock,
      auditRecent: auditRecentMock,
    },
  },
}));

vi.mock('@/lib/host-events', () => ({
  hostEvents: { onMorpheusActionEvent: onMorpheusActionEventMock },
}));

import {
  useMorpheusActionsStore,
  selectPendingPermissionRun,
  selectRunsNewestFirst,
} from '@/stores/morpheus-actions';
import type { MorpheusActionEvent, MorpheusRunPhase } from '@shared/morpheus/action-types';

function event(overrides: Partial<MorpheusActionEvent> = {}): MorpheusActionEvent {
  return {
    v: 1,
    seq: 1,
    ts: '2026-08-05T00:00:00.000Z',
    runId: 'run-1',
    actionId: 'system.report',
    phase: 'requested' as MorpheusRunPhase,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  auditRecentMock.mockResolvedValue({ entries: [], truncated: false });
  useMorpheusActionsStore.setState({
    runOrder: [],
    runsById: {},
    auditEntries: [],
    requestError: null,
    supportedActions: {},
    platform: null,
    systemInfo: null,
    systemInfoError: null,
  });
});

describe('morpheus actions store — event projection', () => {
  it('creates a run from the first event', () => {
    useMorpheusActionsStore.getState().applyEvent(event());

    const state = useMorpheusActionsStore.getState();
    expect(state.runOrder).toEqual(['run-1']);
    expect(state.runsById['run-1']).toMatchObject({ phase: 'requested', seq: 1 });
  });

  it('advances a run in place without duplicating it', () => {
    const store = useMorpheusActionsStore.getState();
    store.applyEvent(event({ seq: 1, phase: 'requested' }));
    store.applyEvent(event({ seq: 2, phase: 'awaiting-permission' }));
    store.applyEvent(event({ seq: 3, phase: 'running' }));

    const state = useMorpheusActionsStore.getState();
    expect(state.runOrder).toEqual(['run-1']);
    expect(state.runsById['run-1'].phase).toBe('running');
  });

  it('ignores an out-of-order or replayed event', () => {
    const store = useMorpheusActionsStore.getState();
    store.applyEvent(event({ seq: 3, phase: 'running' }));
    store.applyEvent(event({ seq: 2, phase: 'awaiting-permission' }));
    store.applyEvent(event({ seq: 3, phase: 'requested' }));

    expect(useMorpheusActionsStore.getState().runsById['run-1'].phase).toBe('running');
  });

  it('keeps the richer value when a later phase omits a field', () => {
    const store = useMorpheusActionsStore.getState();
    store.applyEvent(event({
      seq: 1,
      phase: 'awaiting-permission',
      target: { kind: 'file', path: 'C:\\root\\a.txt', bytes: 5 },
    }));
    store.applyEvent(event({ seq: 2, phase: 'running' }));

    expect(useMorpheusActionsStore.getState().runsById['run-1'].target)
      .toEqual({ kind: 'file', path: 'C:\\root\\a.txt', bytes: 5 });
  });

  it('ignores a malformed event', () => {
    const store = useMorpheusActionsStore.getState();
    store.applyEvent(undefined as never);
    store.applyEvent({} as never);
    store.applyEvent(event({ runId: '' }));

    expect(useMorpheusActionsStore.getState().runOrder).toEqual([]);
  });

  it('preserves the original request timestamp across phases', () => {
    const store = useMorpheusActionsStore.getState();
    store.applyEvent(event({ seq: 1, ts: '2026-08-05T00:00:00.000Z' }));
    store.applyEvent(event({ seq: 2, ts: '2026-08-05T00:00:05.000Z', phase: 'succeeded' }));

    const run = useMorpheusActionsStore.getState().runsById['run-1'];
    expect(run.requestedAt).toBe('2026-08-05T00:00:00.000Z');
    expect(run.updatedAt).toBe('2026-08-05T00:00:05.000Z');
  });

  it('bounds retained runs', () => {
    const store = useMorpheusActionsStore.getState();
    for (let index = 0; index < 130; index += 1) {
      store.applyEvent(event({ runId: `run-${index}`, seq: index + 1 }));
    }

    const state = useMorpheusActionsStore.getState();
    expect(state.runOrder).toHaveLength(100);
    expect(Object.keys(state.runsById)).toHaveLength(100);
    expect(state.runOrder[0]).toBe('run-30');
    expect(state.runsById['run-0']).toBeUndefined();
  });

  it('refreshes the audit projection only on terminal phases', () => {
    const store = useMorpheusActionsStore.getState();
    store.applyEvent(event({ seq: 1, phase: 'requested' }));
    store.applyEvent(event({ seq: 2, phase: 'awaiting-permission' }));
    expect(auditRecentMock).not.toHaveBeenCalled();

    store.applyEvent(event({ seq: 3, phase: 'succeeded' }));
    expect(auditRecentMock).toHaveBeenCalledTimes(1);
  });
});

describe('morpheus actions store — subscription', () => {
  it('subscribes and unsubscribes cleanly', () => {
    const unsubscribe = vi.fn();
    onMorpheusActionEventMock.mockReturnValue(unsubscribe);

    const teardown = useMorpheusActionsStore.getState().subscribe();
    expect(onMorpheusActionEventMock).toHaveBeenCalledTimes(1);
    expect(useMorpheusActionsStore.getState().subscribed).toBe(true);

    teardown();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(useMorpheusActionsStore.getState().subscribed).toBe(false);
  });

  it('routes delivered events into the projection', () => {
    onMorpheusActionEventMock.mockImplementation((handler) => {
      handler(event({ seq: 7, phase: 'succeeded' }));
      return vi.fn();
    });

    useMorpheusActionsStore.getState().subscribe();
    expect(useMorpheusActionsStore.getState().runsById['run-1'].phase).toBe('succeeded');
  });
});

describe('morpheus actions store — host calls', () => {
  it('returns the run id from a successful request', async () => {
    requestActionMock.mockResolvedValue({ runId: 'run-9' });
    const runId = await useMorpheusActionsStore.getState().requestAction('system.report');

    expect(runId).toBe('run-9');
    expect(requestActionMock).toHaveBeenCalledWith({ actionId: 'system.report', params: undefined });
    expect(useMorpheusActionsStore.getState().requestError).toBeNull();
  });

  it('surfaces a rejected request as an error without creating a run', async () => {
    requestActionMock.mockRejectedValue(new Error('params contains an unsupported key: args'));
    const runId = await useMorpheusActionsStore.getState().requestAction('app.launch', { applicationKey: 'notepad' });

    expect(runId).toBeNull();
    expect(useMorpheusActionsStore.getState().requestError).toContain('unsupported key');
    expect(useMorpheusActionsStore.getState().runOrder).toEqual([]);
  });

  it('forwards permission decisions verbatim', async () => {
    respondPermissionMock.mockResolvedValue({ accepted: true });
    await useMorpheusActionsStore.getState().respondPermission('run-1', 'denied');
    expect(respondPermissionMock).toHaveBeenCalledWith({ runId: 'run-1', decision: 'denied' });
  });

  it('records a permission failure without throwing', async () => {
    respondPermissionMock.mockRejectedValue(new Error('bridge gone'));
    await useMorpheusActionsStore.getState().respondPermission('run-1', 'granted');
    expect(useMorpheusActionsStore.getState().requestError).toBe('bridge gone');
  });

  it('loads capabilities into a lookup map', async () => {
    describeActionsMock.mockResolvedValue({
      platform: 'win32',
      actions: [
        { actionId: 'app.launch', supported: true },
        { actionId: 'file.createText', supported: false },
      ],
      applicationKeys: ['notepad'],
    });

    await useMorpheusActionsStore.getState().loadCapabilities();
    const state = useMorpheusActionsStore.getState();
    expect(state.platform).toBe('win32');
    expect(state.supportedActions).toEqual({ 'app.launch': true, 'file.createText': false });
  });

  it('records a system info failure instead of throwing', async () => {
    systemInfoMock.mockRejectedValue(new Error('bridge unavailable'));
    await useMorpheusActionsStore.getState().loadSystemInfo();

    const state = useMorpheusActionsStore.getState();
    expect(state.systemInfo).toBeNull();
    expect(state.systemInfoError).toBe('bridge unavailable');
  });

  it('presents audit entries newest first', async () => {
    auditRecentMock.mockResolvedValue({
      entries: [{ seq: 1 }, { seq: 2 }, { seq: 3 }],
      truncated: false,
    });

    await useMorpheusActionsStore.getState().loadAudit(3);
    expect(useMorpheusActionsStore.getState().auditEntries.map((e) => e.seq)).toEqual([3, 2, 1]);
  });
});

describe('morpheus actions store — selectors', () => {
  it('finds the run awaiting a confirmation', () => {
    const store = useMorpheusActionsStore.getState();
    store.applyEvent(event({ runId: 'run-a', seq: 1, phase: 'succeeded' }));
    store.applyEvent(event({ runId: 'run-b', seq: 2, phase: 'awaiting-permission' }));

    expect(selectPendingPermissionRun(useMorpheusActionsStore.getState())?.runId).toBe('run-b');
  });

  it('returns null once no run is pending', () => {
    const store = useMorpheusActionsStore.getState();
    store.applyEvent(event({ runId: 'run-b', seq: 1, phase: 'awaiting-permission' }));
    store.applyEvent(event({ runId: 'run-b', seq: 2, phase: 'denied' }));

    expect(selectPendingPermissionRun(useMorpheusActionsStore.getState())).toBeNull();
  });

  it('orders runs newest first', () => {
    const store = useMorpheusActionsStore.getState();
    store.applyEvent(event({ runId: 'run-a', seq: 1 }));
    store.applyEvent(event({ runId: 'run-b', seq: 2 }));

    expect(selectRunsNewestFirst(useMorpheusActionsStore.getState()).map((r) => r.runId))
      .toEqual(['run-b', 'run-a']);
  });

  it('keeps selectPendingPermissionRun reference-stable so it is safe as a store selector', () => {
    // Passing a selector that builds a fresh value on every call to the zustand
    // hook never satisfies the Object.is check and renders infinitely. This
    // selector is used that way, so its identity must settle.
    useMorpheusActionsStore.getState().applyEvent(event({ seq: 1, phase: 'awaiting-permission' }));
    const state = useMorpheusActionsStore.getState();

    expect(selectPendingPermissionRun(state)).toBe(selectPendingPermissionRun(state));
    expect(selectPendingPermissionRun({ runOrder: [], runsById: {} }))
      .toBe(selectPendingPermissionRun({ runOrder: [], runsById: {} }));
  });

  it('documents selectRunsNewestFirst as reference-unstable', () => {
    // Guards the inverse: this one must be memoised at the call site, never
    // handed to the store hook directly.
    const state = useMorpheusActionsStore.getState();
    expect(selectRunsNewestFirst(state)).not.toBe(selectRunsNewestFirst(state));
  });
});
