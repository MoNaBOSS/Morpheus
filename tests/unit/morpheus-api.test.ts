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
  validateTranscribeAudioPayload,
  validateAddWorkspacePayload,
  validateAgentProfileDraft,
  validateUpdateWorkspacePayload,
  validateWorkspaceIdPayload,
  validateWorkflowDraft,
  validateVoiceSettingsPatch,
  validateRuntimePausedPayload,
  validateMissionIdPayload,
  validateProjectDraft,
  validateProjectIdPayload,
  validateMemoryDraft,
  validateMemoryIdPayload,
  validateCompleteOnboardingPayload,
  validateGoalDraft,
  validateProactiveSettingsPatch,
  validateCreateReminderPayload,
  validateSystemDraft,
  validateSystemIdPayload,
  validateCreateSystemFromMissionPayload,
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
    revokeForResourceScope: vi.fn(() => 0),
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
      remove: vi.fn(() => true),
      resetBuiltIns: vi.fn(() => ({ profiles: [] })),
    } as never,
    workflows: {
      list: vi.fn(() => ({ workflows: [] })),
      get: vi.fn(),
      prepare: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(() => true),
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
      submitInternal: vi.fn(async () => ({ objectiveRunId: 'objective-workflow', accepted: true })),
      snapshot: vi.fn(() => ({ activeObjectiveRunId: null, runOrder: [], runsById: {}, plansByObjectiveRunId: {} })),
      correct: vi.fn(async () => ({ accepted: true })),
      cancel: vi.fn(async () => ({ accepted: true })),
      waitForTerminal: vi.fn(),
      waitForIdle: vi.fn(),
    } as never,
    missions: {
      snapshot: vi.fn(() => ({ activeMissionId: null, missionOrder: [], missionsById: {} })),
      get: vi.fn(),
      projectObjective: vi.fn(),
      reconcile: vi.fn(),
    } as never,
    projects: {
      list: vi.fn(() => ({ defaultProjectId: 'personal', projects: [] })),
      get: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
    } as never,
    memory: {
      list: vi.fn(() => ({ memories: [] })),
      eligibleForPlanning: vi.fn(() => []),
      get: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
      countForProject: vi.fn(() => 0),
    } as never,
    onboarding: {
      status: vi.fn(() => ({
        v: 1, completed: false, preferences: { speakResponses: true, personality: 'adaptive' },
      })),
      complete: vi.fn(),
      reset: vi.fn(),
    } as never,
    systems: {
      list: vi.fn(() => ({ systems: [] })),
      get: vi.fn(),
      save: vi.fn(),
      remove: vi.fn(),
      createFromMission: vi.fn(),
      test: vi.fn(),
      activate: vi.fn(),
      pause: vi.fn(),
      run: vi.fn(),
    } as never,
    companionSurface: {
      status: vi.fn(() => ({ mode: 'full' as const })),
      dismiss: vi.fn(() => ({ mode: 'full' as const })),
      expand: vi.fn(() => ({ mode: 'full' as const })),
    },
    voice: {
      status: vi.fn(async () => ({
        settings: {
          v: 1, enabled: true, providerAccountId: null, modelId: 'whisper-1',
          speakResponses: true, autoSubmitTranscript: true,
        },
        transcriptionAvailable: false,
        providers: [],
      })),
      updateSettings: vi.fn(),
      transcribe: vi.fn(),
    } as never,
    runtimeControl: {
      snapshot: vi.fn(() => ({ v: 1 as const, paused: false, updatedAt: '2026-08-11T00:00:00.000Z' })),
      setPaused: vi.fn(async (paused: boolean) => ({
        v: 1 as const, paused, updatedAt: '2026-08-11T00:00:01.000Z',
      })),
    },
    workspaces: {
      list: vi.fn(() => ({
        defaultWorkspaceId: 'morpheus-files',
        workspaces: [],
      })),
      get: vi.fn(),
      resolveRoot: vi.fn(() => 'C:\\Morpheus\\files'),
      add: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    } as never,
    audit: {
      recordControl: vi.fn(async () => undefined),
      query: vi.fn(async () => ({ entries: [], truncated: false })),
    } as never,
    filesRoot: 'C:\\Morpheus\\files',
    appVersion: '0.5.0',
    auditHealth: () => 'healthy' as const,
    selectWorkspaceDirectory: vi.fn(async () => null),
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

describe('workspace trust boundary validation', () => {
  it('accepts logical workspace metadata and rejects renderer paths', () => {
    expect(validateAddWorkspacePayload({ name: 'Client A', access: 'read' }))
      .toEqual({ name: 'Client A', access: 'read' });
    expect(validateUpdateWorkspacePayload({ workspaceId: 'workspace-client', enabled: false }))
      .toEqual({ workspaceId: 'workspace-client', enabled: false });
    expect(validateWorkspaceIdPayload({ workspaceId: 'workspace-client' }))
      .toEqual({ workspaceId: 'workspace-client' });

    expect(() => validateAddWorkspacePayload({ path: 'C:\\outside' }))
      .toThrow(/unsupported key: path/);
    expect(() => validateUpdateWorkspacePayload({
      workspaceId: 'workspace-client', rootPath: 'C:\\outside',
    })).toThrow(/unsupported key: rootPath/);
  });

  it('uses only the Main folder picker and revokes exact-root grants on removal', async () => {
    const options = stubOptions();
    const workspace = {
      v: 1 as const,
      workspaceId: 'workspace-client',
      name: 'Client',
      rootPath: 'C:\\Trusted\\Client',
      kind: 'user' as const,
      access: 'read-write' as const,
      enabled: true,
      available: true,
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:00:00.000Z',
    };
    options.selectWorkspaceDirectory = vi.fn(async () => 'C:\\Trusted\\Client');
    options.workspaces.add = vi.fn(() => workspace);
    options.workspaces.get = vi.fn(() => workspace);
    options.workspaces.update = vi.fn(() => ({ ...workspace, access: 'read' }));
    options.workspaces.remove = vi.fn(() => workspace);
    const api = createMorpheusApi(options);

    await expect(api.addWorkspace({ name: 'Client' })).resolves.toEqual({ workspace });
    expect(options.workspaces.add).toHaveBeenCalledWith(
      'C:\\Trusted\\Client', { name: 'Client' },
    );

    await expect(api.removeWorkspace({ workspaceId: 'workspace-client' }))
      .resolves.toEqual({ workspace });
    expect(options.grants.revokeForResourceScope).toHaveBeenCalledWith('C:\\Trusted\\Client');
    expect(options.workspaces.remove).toHaveBeenCalledWith('workspace-client');

    options.grants.revokeForResourceScope.mockClear();
    await api.updateWorkspace({ workspaceId: 'workspace-client', access: 'read' });
    expect(options.grants.revokeForResourceScope).toHaveBeenCalledWith('C:\\Trusted\\Client');
  });
});

describe('objective payload validation', () => {
  it('accepts only bounded logical objective fields', () => {
    expect(validateSubmitObjectivePayload({
      objective: 'Open Notepad', originType: 'quick-command', projectId: 'project-client',
    })).toEqual({ objective: 'Open Notepad', originType: 'quick-command', projectId: 'project-client' });
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

describe('Mission and explicit context validation', () => {
  it('accepts logical ids and rejects renderer filesystem authority', () => {
    expect(validateMissionIdPayload({ missionId: 'mission-client-research' }))
      .toEqual({ missionId: 'mission-client-research' });
    expect(validateProjectIdPayload({ projectId: 'project-client' }))
      .toEqual({ projectId: 'project-client' });
    expect(validateMemoryIdPayload({ memoryId: 'memory-client-tone' }))
      .toEqual({ memoryId: 'memory-client-tone' });

    expect(() => validateProjectDraft({
      name: 'Client', description: '', workspaceId: 'workspace-client', instructions: '',
      enabled: true, rootPath: 'C:\\outside',
    })).toThrow(/unsupported key: rootPath/);
    expect(() => validateMemoryDraft({
      title: 'Preference', text: 'Be concise', kind: 'preference', sensitivity: 'normal',
      providerUse: 'allowed', enabled: true, executablePath: 'cmd.exe',
    })).toThrow(/unsupported key: executablePath/);
  });

  it('keeps activation preferences bounded and non-authoritative', () => {
    expect(validateCompleteOnboardingPayload({ speakResponses: true, personality: 'warm' }))
      .toEqual({ speakResponses: true, personality: 'warm' });
    expect(() => validateCompleteOnboardingPayload({
      speakResponses: true, personality: 'warm', alwaysAllow: true,
    })).toThrow(/unsupported key: alwaysAllow/);
  });

  it('audits memory metadata without persisting memory text', async () => {
    const options = stubOptions();
    const api = createMorpheusApi(options);
    await api.saveMemory({
      title: 'Client preference', text: 'Never include this value in the ledger',
      kind: 'preference', sensitivity: 'normal', providerUse: 'allowed', enabled: true,
    });

    expect(options.audit.recordControl).toHaveBeenCalledWith(expect.objectContaining({
      category: 'memory',
      details: expect.objectContaining({ kind: 'preference', sensitivity: 'normal' }),
    }));
    expect(JSON.stringify(options.audit.recordControl.mock.calls)).not.toContain('Never include this value');
  });
});

describe('Goal and proactive intelligence validation', () => {
  const goal = {
    name: 'Launch Morpheus',
    objective: 'Deliver a testable release',
    successCriteria: 'Installer verified',
    status: 'active' as const,
    projectId: 'personal',
    workspaceId: 'morpheus-files',
    agentProfileId: 'general',
    nextAction: 'Prepare the release notes',
    milestones: [{ title: 'Run tests', status: 'pending' as const }],
  };

  it('accepts logical Goal context and rejects renderer-owned lineage or paths', () => {
    expect(validateGoalDraft(goal)).toEqual(goal);
    for (const [key, value] of [
      ['missionIds', ['mission-injected']],
      ['history', []],
      ['rootPath', 'C:\\outside'],
      ['executablePath', 'cmd.exe'],
      ['permissionGrant', 'always'],
    ] as const) {
      expect(() => validateGoalDraft({ ...goal, [key]: value })).toThrow(/unsupported key/);
    }
    expect(() => validateGoalDraft({
      ...goal,
      milestones: [{ ...goal.milestones[0], completedAt: new Date().toISOString() }],
    })).toThrow(/unsupported key/);
  });

  it('accepts bounded proactive preferences and rejects fact or execution injection', () => {
    expect(validateProactiveSettingsPatch({
      enabled: true,
      quietHoursStart: '22:00',
      categories: { goal: false },
    })).toEqual({ enabled: true, quietHoursStart: '22:00', categories: { goal: false } });
    expect(() => validateProactiveSettingsPatch({ enabled: true, sourceId: 'mission-injected' }))
      .toThrow(/unsupported key/);
    expect(() => validateProactiveSettingsPatch({ categories: { shell: true } }))
      .toThrow(/unsupported key/);
    expect(() => validateCreateReminderPayload({
      title: 'Review', detail: '', dueAt: '2026-08-15T09:00:00.000Z',
      sourceFingerprint: 'injected', executablePath: 'cmd.exe',
    })).toThrow(/unsupported key/);
  });
});

describe('System Builder validation', () => {
  const draft = {
    name: 'Weekly intelligence',
    description: 'Run a reviewed workflow.',
    workflowId: 'weekly-report',
    workspaceId: 'morpheus-files',
    projectId: 'personal',
    scheduleIds: ['schedule-weekly'],
    outputs: { collectArtifacts: true, retainHistory: true },
  };

  it('accepts logical references and rejects lifecycle, capability, or executable authority', () => {
    expect(validateSystemDraft(draft)).toEqual(draft);
    expect(validateSystemIdPayload({ systemId: 'system-weekly' })).toEqual({ systemId: 'system-weekly' });
    for (const [key, value] of [
      ['status', 'active'],
      ['capabilityIds', ['shell.exec']],
      ['agentProfileId', 'privileged'],
      ['testFingerprint', 'injected'],
      ['rootPath', 'C:\\outside'],
      ['executablePath', 'cmd.exe'],
      ['permissionGrant', 'always'],
    ] as const) {
      expect(() => validateSystemDraft({ ...draft, [key]: value })).toThrow(/unsupported key/);
    }
    expect(() => validateSystemDraft({
      ...draft,
      outputs: { ...draft.outputs, shell: true },
    })).toThrow(/unsupported key/);
  });

  it('allows Mission identity only when requesting conversion', () => {
    expect(validateCreateSystemFromMissionPayload({ missionId: 'mission-weekly', name: 'Weekly' }))
      .toEqual({ missionId: 'mission-weekly', name: 'Weekly' });
    expect(() => validateCreateSystemFromMissionPayload({
      missionId: 'mission-weekly', workflowId: 'injected', params: {},
    })).toThrow(/unsupported key/);
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

describe('voice payload validation', () => {
  it('accepts only bounded settings fields and ephemeral audio metadata', () => {
    expect(validateVoiceSettingsPatch({ enabled: true, speakResponses: false }))
      .toEqual({ enabled: true, speakResponses: false });
    expect(validateTranscribeAudioPayload({
      audioBase64: 'dm9pY2U=',
      mimeType: 'audio/webm',
      durationMs: 1_000,
    })).toEqual({ audioBase64: 'dm9pY2U=', mimeType: 'audio/webm', durationMs: 1_000 });
  });

  it('rejects authority smuggling and malformed voice envelopes', () => {
    expect(() => validateVoiceSettingsPatch({ enabled: true, apiKey: 'secret' }))
      .toThrow(/unsupported key/);
    expect(() => validateTranscribeAudioPayload({
      audioBase64: 'dm9pY2U=', mimeType: 'audio/wav', durationMs: 1_000, path: 'C:\\audio.wav',
    })).toThrow(/unsupported key/);
    expect(() => validateTranscribeAudioPayload({
      audioBase64: 'dm9pY2U=', mimeType: 'audio/wav', durationMs: 1_000,
    })).toThrow(/unsupported voice mimeType/);
  });
});

describe('runtime control validation', () => {
  it('accepts only a logical paused flag', () => {
    expect(validateRuntimePausedPayload({ paused: true })).toEqual({ paused: true });
    expect(() => validateRuntimePausedPayload({ paused: true, command: 'taskkill' }))
      .toThrow(/unsupported key/);
    expect(() => validateRuntimePausedPayload({ paused: 'yes' })).toThrow(/paused must be a boolean/);
  });
});

describe('createMorpheusApi', () => {
  it('exposes exactly the contract surface', () => {
    expect(Object.keys(createMorpheusApi(stubOptions())).sort()).toEqual([
      'actOnAttention',
      'activateSystem',
      'addWorkspace',
      'agentProfile',
      'agentProfiles',
      'auditQuery',
      'auditRecent',
      'beginAmbientVoice',
      'cancelAction',
      'cancelObjective',
      'companionSurfaceStatus',
      'completeOnboarding',
      'continueGoal',
      'correctObjective',
      'createReminder',
      'createSystemFromMission',
      'describeActions',
      'dismissAttention',
      'dismissCompanionSurface',
      'endAmbientVoice',
      'executePlan',
      'expandCompanionSurface',
      'filesRoot',
      'goal',
      'goals',
      'interpretCommand',
      'memories',
      'mission',
      'missions',
      'objectiveSnapshot',
      'onboardingStatus',
      'openFilesRoot',
      'openWorkspace',
      'pauseSystem',
      'permissionCenter',
      'proactiveSnapshot',
      'project',
      'projects',
      'refreshProactive',
      'removeAgentProfile',
      'removeGoal',
      'removeMemory',
      'removeProject',
      'removeReminder',
      'removeSchedule',
      'removeSystem',
      'removeWorkflow',
      'removeWorkspace',
      'requestAction',
      'rerunMission',
      'resetAgentProfiles',
      'resetOnboarding',
      'resetPermissionPolicy',
      'respondPermission',
      'respondPlanPermission',
      'revokeAllSessionGrants',
      'revokeGrant',
      'runSchedule',
      'runSystem',
      'runWorkflow',
      'runtimeControl',
      'saveAgentProfile',
      'saveGoal',
      'saveMemory',
      'saveProject',
      'saveSchedule',
      'saveSystem',
      'saveWorkflow',
      'schedules',
      'setAmbientVoiceListening',
      'setPermissionProfile',
      'setRuntimePaused',
      'setVoiceSpeaking',
      'snoozeAttention',
      'submitObjective',
      'system',
      'systemInfo',
      'systems',
      'testSystem',
      'transcribeAmbientAudio',
      'transcribeAudio',
      'updateProactiveSettings',
      'updateVoiceSettings',
      'updateWorkspace',
      'voiceStatus',
      'workflow',
      'workflows',
      'workspaces',
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

  it('submits a Main-compiled workflow through the objective orchestrator', async () => {
    const options = stubOptions();
    const workflow = { workflowId: 'system-brief', name: 'System brief', agentProfileId: 'general' };
    const plan = {
      planId: 'workflow-plan',
      workspaceId: 'workspace-client',
      origin: { type: 'workflow', workflowId: 'system-brief', agentProfileId: 'general' },
    };
    options.workflows.get = vi.fn(() => workflow);
    options.workflows.prepare = vi.fn(() => plan);
    const api = createMorpheusApi(options);

    await expect(api.runWorkflow({
      workflowId: 'system-brief', workspaceId: 'workspace-client',
    })).resolves.toEqual({ objectiveRunId: 'objective-workflow', accepted: true });
    expect(options.objectives.submitInternal).toHaveBeenCalledWith({
      objective: 'System brief',
      origin: plan.origin,
      workspaceId: 'workspace-client',
      agentProfileId: 'general',
      preparedPlan: plan,
    });
  });

  it('removes only unreferenced custom Agent Profiles', async () => {
    const options = stubOptions();
    const custom = { profileId: 'agent-custom', builtIn: false };
    options.agentProfiles.get = vi.fn(() => custom);
    options.workflows.list = vi.fn(() => ({ workflows: [] }));
    const api = createMorpheusApi(options);

    await expect(api.removeAgentProfile({ id: 'agent-custom' })).resolves.toEqual({ ok: true });
    expect(options.agentProfiles.remove).toHaveBeenCalledWith('agent-custom');

    options.workflows.list = vi.fn(() => ({
      workflows: [{ workflowId: 'using-agent', agentProfileId: 'agent-custom' }],
    }));
    await expect(api.removeAgentProfile({ id: 'agent-custom' })).rejects.toThrow(/Remove workflows/);
  });

  it('rejects workflow definitions outside their Agent Profile boundary', async () => {
    const options = stubOptions();
    options.agentProfiles.get = vi.fn(() => ({
      profileId: 'research',
      permissionBoundary: { capabilityIds: ['system.report'], maxRiskTier: 'low' },
    }));
    const api = createMorpheusApi(options);
    await expect(api.saveWorkflow({
      name: 'Unsafe mismatch', description: '', agentProfileId: 'research', enabled: true,
      allowedTriggers: ['manual'], outputs: { collectArtifacts: true, retainHistory: true },
      steps: [{
        stepId: 'launch', capabilityId: 'app.launch', params: { applicationKey: 'notepad' },
        dependsOn: [], summary: 'Launch Notepad',
      }],
    })).rejects.toThrow(/does not allow app\.launch/);
    expect(options.workflows.save).not.toHaveBeenCalled();
  });
});

describe('Agent Profile and workflow draft validation', () => {
  const agentDraft = {
    name: 'Research Agent',
    description: 'Researches bounded objectives.',
    instructions: 'Cite evidence.',
    planner: { kind: 'auto' },
    workspace: { rootKey: 'morpheusFiles', access: 'read' },
    memory: { mode: 'workspace', maxContextItems: 20 },
    permissionBoundary: {
      capabilityIds: ['system.report', 'file.readText'],
      maxRiskTier: 'medium',
    },
    enabled: true,
  };

  it('constructs a narrow Agent Profile draft and rejects hidden authority fields', () => {
    expect(validateAgentProfileDraft(agentDraft)).toEqual(agentDraft);
    expect(() => validateAgentProfileDraft({
      ...agentDraft, apiKey: 'secret',
    })).toThrow(/unsupported key: apiKey/);
    expect(() => validateAgentProfileDraft({
      ...agentDraft,
      planner: { kind: 'provider', providerId: 'provider-1', modelId: 'model', apiKey: 'secret' },
    })).toThrow(/unsupported key: apiKey/);
    expect(() => validateAgentProfileDraft({
      ...agentDraft,
      permissionBoundary: { capabilityIds: ['screen.capture'], maxRiskTier: 'medium' },
    })).toThrow(/exceeds maximum risk/);
  });

  it('normalizes capability params and rejects executable-shaped workflow fields', () => {
    const draft = {
      name: 'Workspace report',
      description: 'Reads a report.',
      agentProfileId: 'research',
      steps: [{
        stepId: 'read', capabilityId: 'file.readText', params: { path: 'report.txt' },
        dependsOn: [], summary: 'Read report',
      }],
      allowedTriggers: ['manual'],
      outputs: { collectArtifacts: true, retainHistory: true },
      enabled: true,
    };
    expect(validateWorkflowDraft(draft)).toEqual(draft);
    expect(() => validateWorkflowDraft({
      ...draft,
      steps: [{ ...draft.steps[0], command: 'powershell', args: ['-c', 'whoami'] }],
    })).toThrow(/unsupported key: command/);
  });
});
