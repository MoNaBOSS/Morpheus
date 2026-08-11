import { describe, expect, it, vi } from 'vitest';

import {
  MorpheusValidationError,
  createMorpheusApi,
  validateAuditRecentPayload,
  validateCancelActionPayload,
  validateCancelObjectivePayload,
  validateCorrectObjectivePayload,
  validateRequestActionPayload,
  validateRespondPermissionPayload,
  validateSubmitObjectivePayload,
} from '@electron/services/morpheus-api';
import type { MorpheusRuntime } from '@electron/services/morpheus';

function stubGrants() {
  return {
    getProfile: vi.fn(() => 'balanced' as const),
    setProfile: vi.fn(),
    findGrant: vi.fn(),
    createGrant: vi.fn(),
    recordUse: vi.fn(),
    revoke: vi.fn(() => true),
    revokeAllSession: vi.fn(() => 0),
    reset: vi.fn(),
    listSessionGrants: vi.fn(() => []),
    listPersistentGrants: vi.fn(() => []),
    listDeniedScopes: vi.fn(() => []),
  };
}

function stubOptions(runtime = stubRuntime()) {
  return {
    runtime,
    grants: stubGrants() as never,
    agentProfiles: {
      list: vi.fn(() => ({ profiles: [] })),
      get: vi.fn(),
      save: vi.fn(),
      resetBuiltIns: vi.fn(() => ({ profiles: [] })),
    } as never,
    workflows: {
      list: vi.fn(() => ({ workflows: [] })),
      get: vi.fn(),
      prepare: vi.fn(),
    } as never,
    scheduler: {
      list: vi.fn(() => ({ schedules: [] })),
      save: vi.fn(),
      remove: vi.fn(() => true),
      runNow: vi.fn(),
      tick: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    } as never,
    objectives: {
      submit: vi.fn(async () => ({ objectiveRunId: 'objective-1', accepted: true })),
      snapshot: vi.fn(() => ({ activeObjectiveRunId: null, runOrder: [], runsById: {}, plansByObjectiveRunId: {} })),
      correct: vi.fn(async () => ({ accepted: true })),
      cancel: vi.fn(async () => ({ accepted: true })),
    } as never,
    audit: {
      recordControl: vi.fn(async () => undefined),
      query: vi.fn(async () => ({ entries: [], truncated: false })),
    } as never,
    filesRoot: 'C:\\Morpheus\\files',
    appVersion: '0.5.0',
    auditHealth: () => 'healthy' as const,
  };
}

function stubRuntime(): MorpheusRuntime {
  return {
    describeActions: vi.fn(() => ({ platform: 'win32', actions: [], applicationKeys: [] })),
    systemInfo: vi.fn(() => ({ appVersion: '0.1.0' }) as never),
    requestAction: vi.fn(async () => ({ runId: 'run-1' })),
    respondPermission: vi.fn(async () => ({ accepted: true })),
    cancelAction: vi.fn(async () => ({ accepted: true })),
    auditRecent: vi.fn(async () => ({ entries: [], truncated: false })),
    registerPlan: vi.fn((plan) => plan),
    executePlan: vi.fn(async () => ({ planId: 'plan-1', status: 'completed' as const, steps: [] })),
    respondPlanPermission: vi.fn(async () => ({ accepted: true })),
    cancelPlan: vi.fn(async () => ({ accepted: true })),
    dispose: vi.fn(),
  };
}

describe('validateRequestActionPayload', () => {
  it('accepts a well-formed request', () => {
    // A parameterless action still normalises to an empty params object, so
    // downstream code never has to distinguish "absent" from "empty".
    expect(validateRequestActionPayload({ actionId: 'system.report' }))
      .toEqual({ actionId: 'system.report', params: {} });
    expect(validateRequestActionPayload({
      actionId: 'file.createText',
      params: { fileName: 'a.txt', content: 'hi' },
    })).toEqual({
      actionId: 'file.createText',
      params: { fileName: 'a.txt', content: 'hi' },
    });
  });

  it('rejects an unknown action', () => {
    expect(() => validateRequestActionPayload({ actionId: 'shell.exec' })).toThrow(/Unknown action/);
    expect(() => validateRequestActionPayload({ actionId: '__proto__' })).toThrow(/Unknown action/);
    expect(() => validateRequestActionPayload({ actionId: 'constructor' })).toThrow(/Unknown action/);
  });

  it('rejects a malformed envelope', () => {
    for (const payload of [undefined, null, 'system.report', 42, ['system.report']]) {
      expect(() => validateRequestActionPayload(payload)).toThrow(MorpheusValidationError);
    }
    expect(() => validateRequestActionPayload({})).toThrow(/actionId must be a non-empty string/);
    expect(() => validateRequestActionPayload({ actionId: '' })).toThrow(/non-empty/);
  });

  it('REJECTS unknown envelope keys rather than ignoring them', () => {
    expect(() => validateRequestActionPayload({
      actionId: 'system.report',
      executablePath: 'C:\\Windows\\System32\\cmd.exe',
    })).toThrow(/unsupported key: executablePath/);
  });

  it('REJECTS unknown parameter keys rather than ignoring them', () => {
    for (const smuggled of ['cwd', 'env', 'shell', 'args', 'path', 'root']) {
      expect(() => validateRequestActionPayload({
        actionId: 'file.createText',
        params: { fileName: 'a.txt', content: 'hi', [smuggled]: 'x' },
      })).toThrow(new RegExp(`${smuggled} is not a parameter of this capability`));
    }
  });

  it('rejects a parameter the descriptor does not declare for that action', () => {
    // `applicationKey` is valid for app.launch but not for file.createText.
    expect(() => validateRequestActionPayload({
      actionId: 'file.createText',
      params: { fileName: 'a.txt', content: 'hi', applicationKey: 'notepad' },
    })).toThrow(/applicationKey is not a parameter of this capability/);
  });

  it('requires declared required parameters', () => {
    expect(() => validateRequestActionPayload({ actionId: 'app.launch' }))
      .toThrow(/applicationKey is required/);
    expect(() => validateRequestActionPayload({ actionId: 'file.createText', params: { fileName: 'a.txt' } }))
      .toThrow(/content is required/);
  });

  it('rejects non-string parameter values', () => {
    for (const value of [1, true, null, {}, ['a']]) {
      expect(() => validateRequestActionPayload({
        actionId: 'app.launch',
        params: { applicationKey: value },
      })).toThrow(MorpheusValidationError);
    }
  });

  it('rejects a non-object params field', () => {
    expect(() => validateRequestActionPayload({ actionId: 'system.report', params: 'x' }))
      .toThrow(/must be an object/);
    expect(() => validateRequestActionPayload({ actionId: 'system.report', params: [] }))
      .toThrow(/must be an object/);
  });
});

describe('validateRespondPermissionPayload', () => {
  it('accepts the five decision kinds and the legacy wire values', () => {
    for (const decision of ['deny', 'deny-always', 'allow-once', 'allow-session', 'allow-always'] as const) {
      expect(validateRespondPermissionPayload({ runId: 'r1', decision })).toEqual({ runId: 'r1', decision });
    }
  });

  it('accepts both legacy decisions', () => {
    expect(validateRespondPermissionPayload({ runId: 'r1', decision: 'granted' }))
      .toEqual({ runId: 'r1', decision: 'granted' });
    expect(validateRespondPermissionPayload({ runId: 'r1', decision: 'denied' }))
      .toEqual({ runId: 'r1', decision: 'denied' });
  });

  it('rejects anything else', () => {
    expect(() => validateRespondPermissionPayload({ runId: 'r1', decision: 'maybe' })).toThrow(/decision must be one of/);
    expect(() => validateRespondPermissionPayload({ runId: '', decision: 'granted' })).toThrow(/non-empty/);
    expect(() => validateRespondPermissionPayload({ runId: 'r1' })).toThrow(/decision must be one of/);
    expect(() => validateRespondPermissionPayload({ runId: 'r1', decision: 'granted', force: true }))
      .toThrow(/unsupported key: force/);
  });
});

describe('validateCancelActionPayload', () => {
  it('accepts a run id and rejects extras', () => {
    expect(validateCancelActionPayload({ runId: 'r1' })).toEqual({ runId: 'r1' });
    expect(() => validateCancelActionPayload({ runId: 'r1', kill: true })).toThrow(/unsupported key: kill/);
    expect(() => validateCancelActionPayload({})).toThrow(/non-empty/);
  });
});

describe('objective payload validation', () => {
  it('accepts only bounded logical objective fields', () => {
    expect(validateSubmitObjectivePayload({ objective: 'Open Notepad', originType: 'quick-command' }))
      .toEqual({ objective: 'Open Notepad', originType: 'quick-command' });
    expect(validateCorrectObjectivePayload({ objectiveRunId: 'objective-1', correction: 'Use notes.txt' }))
      .toEqual({ objectiveRunId: 'objective-1', correction: 'Use notes.txt' });
    expect(validateCancelObjectivePayload({ objectiveRunId: 'objective-1' }))
      .toEqual({ objectiveRunId: 'objective-1' });
  });

  it('rejects renderer authority smuggling', () => {
    expect(() => validateSubmitObjectivePayload({ objective: 'test', executablePath: 'cmd.exe' }))
      .toThrow(/unsupported key/);
    expect(() => validateSubmitObjectivePayload({ objective: 'test', originType: 'schedule' }))
      .toThrow(/unsupported objective originType/);
    expect(() => validateCorrectObjectivePayload({ objectiveRunId: 'objective-1', correction: 'x', plan: {} }))
      .toThrow(/unsupported key/);
  });
});

describe('validateAuditRecentPayload', () => {
  it('defaults, clamps and rejects', () => {
    expect(validateAuditRecentPayload(undefined)).toEqual({});
    expect(validateAuditRecentPayload({})).toEqual({});
    expect(validateAuditRecentPayload({ limit: 10 })).toEqual({ limit: 10 });
    expect(validateAuditRecentPayload({ limit: 100_000 })).toEqual({ limit: 200 });
    expect(validateAuditRecentPayload({ limit: -3 })).toEqual({ limit: 1 });
    expect(() => validateAuditRecentPayload({ limit: 'all' })).toThrow(/finite number/);
    expect(() => validateAuditRecentPayload({ limit: Number.NaN })).toThrow(/finite number/);
    expect(() => validateAuditRecentPayload({ limit: 5, path: '/etc' })).toThrow(/unsupported key: path/);
  });
});

describe('createMorpheusApi', () => {
  it('exposes exactly the contract surface', () => {
    expect(Object.keys(createMorpheusApi(stubOptions())).sort()).toEqual([
      'agentProfile',
      'agentProfiles',
      'auditQuery',
      'auditRecent',
      'cancelAction',
      'cancelObjective',
      'correctObjective',
      'describeActions',
      'executePlan',
      'filesRoot',
      'interpretCommand',
      'objectiveSnapshot',
      'openFilesRoot',
      'permissionCenter',
      'prepareWorkflow',
      'removeSchedule',
      'requestAction',
      'resetPermissionPolicy',
      'respondPermission',
      'respondPlanPermission',
      'revokeAllSessionGrants',
      'revokeGrant',
      'runSchedule',
      'saveSchedule',
      'schedules',
      'setPermissionProfile',
      'submitObjective',
      'systemInfo',
      'workflow',
      'workflows',
    ]);
  });

  it('forwards validated payloads to the runtime', async () => {
    const runtime = stubRuntime();
    const api = createMorpheusApi(stubOptions(runtime));

    await api.requestAction({ actionId: 'system.report' });
    expect(runtime.requestAction).toHaveBeenCalledWith({ actionId: 'system.report', params: {} });

    await api.respondPermission({ runId: 'r1', decision: 'granted' });
    expect(runtime.respondPermission).toHaveBeenCalledWith({ runId: 'r1', decision: 'granted' });
  });

  it('routes objectives through the selected Main-owned planner adapter', async () => {
    const runtime = stubRuntime();
    const plan = {
      v: 1 as const,
      planId: 'plan-provider-boundary',
      createdAt: '2026-08-10T00:00:00.000Z',
      origin: { type: 'quick-command' as const, commandText: 'Show system information' },
      objective: 'Show system information',
      status: 'draft' as const,
      steps: [],
      plannedBy: 'provider' as const,
    };
    const planner = {
      plannerId: 'test-provider-adapter',
      plannedBy: 'provider' as const,
      plan: vi.fn(async () => ({ ok: true as const, plan })),
    };
    const api = createMorpheusApi({ ...stubOptions(runtime), planner });

    await expect(api.interpretCommand({
      objective: 'Show system information',
      originType: 'quick-command',
    })).resolves.toEqual({ ok: true, plan });

    expect(planner.plan).toHaveBeenCalledWith({
      objective: 'Show system information',
      origin: { type: 'quick-command', commandText: 'Show system information' },
      platform: process.platform,
      filesRoot: 'C:\\Morpheus\\files',
    });
    expect(runtime.registerPlan).toHaveBeenCalledWith(plan);
  });

  it('never reaches the runtime with an invalid payload', async () => {
    const runtime = stubRuntime();
    const api = createMorpheusApi(stubOptions(runtime));

    await expect(async () => api.requestAction({ actionId: 'shell.exec' } as never)).rejects.toThrow();
    await expect(async () => api.requestAction({
      actionId: 'app.launch',
      params: { applicationKey: 'notepad', args: ['/c', 'del'] },
    } as never)).rejects.toThrow(/args is not a parameter of this capability/);

    expect(runtime.requestAction).not.toHaveBeenCalled();
  });

  it('does not audit or gate the read-only system info call', () => {
    const runtime = stubRuntime();
    createMorpheusApi(stubOptions(runtime)).systemInfo();
    expect(runtime.systemInfo).toHaveBeenCalledTimes(1);
    expect(runtime.requestAction).not.toHaveBeenCalled();
  });
});
