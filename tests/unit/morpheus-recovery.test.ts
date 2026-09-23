import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMorpheusAuditSink, morpheusContentDigest } from '@electron/services/morpheus/audit';
import { createMorpheusCapabilityRegistry } from '@electron/services/morpheus/capability-registry';
import { createMorpheusGrantStore } from '@electron/services/morpheus/policy/grant-store';
import { createMorpheusPolicyEngine } from '@electron/services/morpheus/policy/policy-engine';
import { createPolicyPermissionGate } from '@electron/services/morpheus/policy/permission-gate';
import { createMorpheusRuntime } from '@electron/services/morpheus/runtime';
import { createMorpheusObjectiveStore } from '@electron/services/morpheus/core/objective-store';
import { createMorpheusObjectiveOrchestrator } from '@electron/services/morpheus/core/objective-orchestrator';
import { createMorpheusTaskCheckpoints } from '@electron/services/morpheus/core/task-checkpoints';
import { createMorpheusAgentProfileStore } from '@electron/services/morpheus/agents/profile-store';
import { createMorpheusMissionStore } from '@electron/services/morpheus/missions/mission-store';
import { handleMorpheusTaskControl } from '@electron/services/morpheus/core/task-controls';
import { getMorpheusActionDescriptor } from '@shared/morpheus/actions/registry';
import type { ExecutionPlan, ExecutionStep, ExecutionStepResult } from '@shared/morpheus/execution-types';
import type { MorpheusObjectiveRun } from '@shared/morpheus/core/objective-types';
import type { MorpheusPlanner } from '@shared/morpheus/planner';

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); vi.restoreAllMocks(); });

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), 'morpheus-phase3-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'files'));
  return root;
}

function step(stepId: string, capabilityId: ExecutionStep['capabilityId'], params: ExecutionStep['params'], dependsOn: string[] = []): ExecutionStep {
  const descriptor = getMorpheusActionDescriptor(capabilityId);
  return { stepId, capabilityId, params, dependsOn, summaryKey: descriptor.labelKey,
    permission: { capabilityId, platform: 'win32', riskTier: descriptor.riskTier, resourceScope: 'main-resolves', mandatoryConfirmation: false } };
}
function plan(id = 'recovery-plan', steps = [
  step('create', 'file.createText', { fileName: 'notes.txt', content: 'once' }),
  step('notify', 'system.notify', { title: 'Done' }, ['create']),
]): ExecutionPlan {
  return { v: 1, planId: id, origin: { type: 'command-bar', commandText: 'Create notes' },
    objective: 'Create notes', createdAt: new Date().toISOString(), workspaceId: 'morpheus-files',
    status: 'draft', plannedBy: 'deterministic', steps };
}
function seed(root: string, savedPlan: ExecutionPlan, steps: ExecutionStepResult[]) {
  const id = 'objective-restart';
  const checkpoints = createMorpheusTaskCheckpoints(root);
  checkpoints.begin(id); checkpoints.setPlan(id, savedPlan, 1);
  for (const result of steps) checkpoints.recordStep(savedPlan.planId, result);
  const run: MorpheusObjectiveRun = {
    v: 1, objectiveRunId: id, objective: savedPlan.objective, origin: savedPlan.origin,
    state: 'executing', createdAt: savedPlan.createdAt, updatedAt: savedPlan.createdAt,
    workspaceId: 'morpheus-files', agentProfileId: 'general', iteration: 1,
    missionId: 'mission-restart', planIds: [savedPlan.planId], corrections: [], observations: [], artifacts: [],
  };
  createMorpheusObjectiveStore({ userDataDir: root }).put(run);
  return id;
}

function fixture(root = temporaryRoot(), planner?: MorpheusPlanner) {
  const filesRoot = join(root, 'files');
  const checkpoints = createMorpheusTaskCheckpoints(root);
  const store = createMorpheusObjectiveStore({ userDataDir: root, canRecover: (run) => Boolean(checkpoints.get(run.objectiveRunId)) });
  const grants = createMorpheusGrantStore({ userDataDir: root });
  grants.setProfile('autonomous');
  const audit = createMorpheusAuditSink({ auditDir: join(root, 'audit') });
  const registry = createMorpheusCapabilityRegistry();
  const executed: string[] = [];
  let beforeLaunch: () => Promise<void> = async () => {};
  registry.register({ actionId: 'file.createText', platform: 'win32', resolve: async (params) => ({
    target: { kind: 'file', path: join(filesRoot, params.fileName), bytes: Buffer.byteLength(params.content ?? ''), workspaceRoot: filesRoot },
    execute: async () => {
      executed.push('create');
      const path = join(filesRoot, params.fileName);
      writeFileSync(path, params.content ?? '', { flag: 'wx' });
      return { kind: 'file', path, bytes: Buffer.byteLength(params.content ?? ''), contentSha256: morpheusContentDigest(params.content ?? '') };
    },
  }) });
  registry.register({ actionId: 'system.notify', platform: 'win32', resolve: async () => ({
    target: { kind: 'none' },
    execute: async () => { executed.push('notify'); return { kind: 'notification', title: 'Done', body: '' }; },
  }) });
  registry.register({ actionId: 'system.report', platform: 'win32', resolve: async () => ({
    target: { kind: 'none' },
    execute: async () => { executed.push('report'); return { kind: 'system', info: { appVersion: 'test', platform: 'win32' } as never }; },
  }) });
  registry.register({ actionId: 'app.launch', platform: 'win32', resolve: async () => ({
    target: { kind: 'executable', path: 'C:\\Windows\\notepad.exe', applicationKey: 'notepad' },
    execute: async () => { executed.push('launch'); await beforeLaunch(); return { kind: 'launch', applicationKey: 'notepad', executablePath: 'C:\\Windows\\notepad.exe', pid: 1 }; },
  }) });
  const roots = { resolve: () => filesRoot, forWorkspace: () => roots };
  const workspaces = {
    get: () => ({ v: 1 as const, workspaceId: 'morpheus-files', name: 'Test', rootPath: filesRoot,
      kind: 'managed' as const, access: 'read-write' as const, enabled: true, available: true, createdAt: '', updatedAt: '' }),
    resolveRoot: () => filesRoot,
  };
  let objectives: ReturnType<typeof createMorpheusObjectiveOrchestrator>;
  const runtime = createMorpheusRuntime({
    registry, roots, workspaces, audit, grants, gate: createPolicyPermissionGate(createMorpheusPolicyEngine(grants), grants),
    platform: 'win32', appVersion: 'test', emit: () => {},
    checkpointStep: (id, result) => checkpoints.recordStep(id, result),
    onPlanLifecycle: (event) => objectives?.onPlanLifecycle(event),
  });
  const selectedPlanner = planner ?? { plannerId: 'test', plannedBy: 'provider' as const, plan: async () => ({ ok: true as const, plan: plan() }) };
  objectives = createMorpheusObjectiveOrchestrator({
    store, checkpoints, runtime, agents: createMorpheusAgentProfileStore({ userDataDir: root }),
    planners: { select: async () => ({ ok: true, planner: selectedPlanner }) }, audit, workspaces,
    missions: createMorpheusMissionStore({ userDataDir: root }), appVersion: 'test', platform: 'win32', emit: () => {},
  });
  cleanups.push(() => { objectives.dispose(); runtime.dispose(); });
  return { root, filesRoot, checkpoints, store, grants, runtime, objectives, executed, audit,
    holdLaunch: (callback: () => Promise<void>) => { beforeLaunch = callback; } };
}

describe('Phase 3 objective continuity through the real runtime', () => {
  it('reserves responsiveness for direct commands even with four occupied planning slots', async () => {
    const planner: MorpheusPlanner = { plannerId: 'held', plannedBy: 'provider', plan: vi.fn(() => new Promise(() => {})) };
    const f = fixture(undefined, planner);
    const research = await Promise.all([1, 2, 3, 4].map((n) => f.objectives.submit({ objective: `Research topic ${n}`, originType: 'command-bar' })));
    await vi.waitFor(() => expect(planner.plan).toHaveBeenCalledTimes(4));
    const quick = await f.objectives.submit({ objective: 'Open Notepad', originType: 'command-bar' });
    expect((await f.objectives.waitForTerminal(quick.objectiveRunId, 2000)).state).toBe('complete');
    expect((await handleMorpheusTaskControl('cancel research', { ...f, stopSpeech: vi.fn() }))?.control).toBe('choose-task');
    for (const item of research) await f.objectives.cancel(item);
    await f.objectives.waitForIdle(2000);
  });

  it('keeps a cancelled native operation locked until it settles, then starts the next desktop task', async () => {
    const f = fixture();
    let release!: () => void;
    f.holdLaunch(() => new Promise<void>((resolve) => { release = resolve; }));
    const first = await f.objectives.submit({ objective: 'Open Notepad', originType: 'command-bar' });
    await vi.waitFor(() => expect(f.executed).toEqual(['launch']));
    const second = await f.objectives.submit({ objective: 'Open Calculator', originType: 'command-bar' });
    await f.objectives.cancel(first);
    expect(f.store.get(first.objectiveRunId)?.state).toBe('cancelled');
    expect(f.executed).toEqual(['launch']);
    f.holdLaunch(async () => {});
    release();
    expect((await f.objectives.waitForTerminal(second.objectiveRunId)).state).toBe('complete');
    expect(f.executed).toEqual(['launch', 'launch']);
  });

  it('does not perform a side effect when its checkpoint or pre-action audit cannot persist', async () => {
    const f = fixture();
    vi.spyOn(f.checkpoints, 'recordStep').mockImplementation(() => { throw new Error('disk unavailable'); });
    const submitted = await f.objectives.submit({ objective: 'Open Notepad', originType: 'command-bar' });
    expect((await f.objectives.waitForTerminal(submitted.objectiveRunId)).state).toBe('error');
    expect(f.executed).toEqual([]);
    const other = fixture();
    vi.spyOn(other.audit, 'record').mockRejectedValue(new Error('audit unavailable'));
    const unaudited = await other.objectives.submit({ objective: 'Open Notepad', originType: 'command-bar' });
    expect((await other.objectives.waitForTerminal(unaudited.objectiveRunId)).state).toBe('error');
    expect(other.executed).toEqual([]);
  });

  it('refuses recovery after the bounded attempt count or workspace identity changes', async () => {
    const root = temporaryRoot();
    const id = seed(root, plan('bounded', [step('report', 'system.report', {})]), []);
    const checkpoints = createMorpheusTaskCheckpoints(root);
    for (let i = 0; i < 3; i += 1) checkpoints.claim(id);
    const f = fixture(root);
    await f.objectives.recover();
    expect(f.store.get(id)?.state).toBe('needs-clarification');
    expect(f.executed).toEqual([]);
    const changedRoot = temporaryRoot();
    const changedId = seed(changedRoot, plan(), []);
    const changedCheckpoints = createMorpheusTaskCheckpoints(changedRoot);
    changedCheckpoints.begin(changedId, root);
    changedCheckpoints.setPlan(changedId, plan(), 1);
    const changed = fixture(changedRoot);
    await changed.objectives.recover();
    expect(changed.store.get(changedId)?.state).toBe('needs-clarification');
    expect(changed.executed).toEqual([]);
  });
  it('runs a direct app command while independent provider work is still waiting, then cancels only that research', async () => {
    let resolvePlan!: (result: { ok: true; plan: ExecutionPlan }) => void;
    const planner: MorpheusPlanner = { plannerId: 'held-provider', plannedBy: 'provider',
      plan: vi.fn(() => new Promise((resolve) => { resolvePlan = resolve; })) };
    const f = fixture(undefined, planner);
    f.grants.setProfile('balanced');
    const research = await f.objectives.submit({ objective: 'Research a better project direction', originType: 'command-bar' });
    await vi.waitFor(() => expect(planner.plan).toHaveBeenCalled());
    const launch = await f.objectives.submit({ objective: 'Open Notepad', originType: 'command-bar' });
    expect(launch.accepted).toBe(true);
    expect((await f.objectives.waitForTerminal(launch.objectiveRunId)).state).toBe('complete');
    expect(f.executed).toEqual(['launch']);
    const stopSpeech = vi.fn();
    await handleMorpheusTaskControl('stop talking', { ...f, stopSpeech });
    expect(stopSpeech).toHaveBeenCalledOnce();
    expect(f.store.get(research.objectiveRunId)?.state).toBe('planning');
    expect((await handleMorpheusTaskControl('cancel research', { ...f, stopSpeech }))?.control).toBe('task-cancelled');
    resolvePlan({ ok: true, plan: plan() });
    await f.objectives.waitForIdle();
    expect(f.executed).toEqual(['launch']);
    expect(f.store.get(research.objectiveRunId)?.state).toBe('cancelled');
  });

  it('restores a completed file checkpoint and runs only the unfinished notification once', async () => {
    const root = temporaryRoot();
    const path = join(root, 'files', 'notes.txt');
    writeFileSync(path, 'once');
    const id = seed(root, plan(), [{ stepId: 'create', status: 'succeeded', artifact: {
      kind: 'file', artifactId: 'saved-file', path, bytes: 4,
      contentSha256: morpheusContentDigest('once'), createdAt: new Date().toISOString(),
    } }]);
    const f = fixture(root);
    await f.objectives.recover();
    const result = await f.objectives.waitForTerminal(id);
    expect(result.state).toBe('complete');
    expect(result.observations[0].steps.map((item) => item.status)).toEqual(['succeeded', 'succeeded']);
    expect(f.executed).toEqual(['notify']);
    expect(readFileSync(path, 'utf8')).toBe('once');
    await f.objectives.recover();
    expect(f.executed).toEqual(['notify']);
    expect(f.checkpoints.get(id)).toBeUndefined();
  });

  it('does not repeat an uncertain external effect or continue its dependents', async () => {
    const root = temporaryRoot();
    const saved = plan('uncertain', [step('notify', 'system.notify', { title: 'Maybe delivered' }), step('report', 'system.report', {}, ['notify'])]);
    const id = seed(root, saved, [{ stepId: 'notify', status: 'running' }]);
    const f = fixture(root);
    await f.objectives.recover();
    expect(f.store.get(id)).toMatchObject({ state: 'needs-clarification', recovery: { status: 'needs-review' } });
    expect(f.executed).toEqual([]);
  });

  it('retries an interrupted read, but refuses a changed completed file', async () => {
    const root = temporaryRoot();
    const id = seed(root, plan('read', [step('report', 'system.report', {})]), [{ stepId: 'report', status: 'running' }]);
    const f = fixture(root);
    await f.objectives.recover();
    expect((await f.objectives.waitForTerminal(id)).state).toBe('complete');
    expect(f.executed).toEqual(['report']);

    const changedRoot = temporaryRoot();
    const path = join(changedRoot, 'files', 'notes.txt');
    writeFileSync(path, 'edit');
    const changedId = seed(changedRoot, plan(), [{ stepId: 'create', status: 'succeeded', artifact: {
      kind: 'file', artifactId: 'changed', path, bytes: 4, contentSha256: morpheusContentDigest('once'), createdAt: '',
    } }]);
    const changed = fixture(changedRoot);
    await changed.objectives.recover();
    expect(changed.store.get(changedId)?.state).toBe('needs-clarification');
    expect(changed.executed).toEqual([]);
  });

  it('rechecks permissions after restart and remembers only the displayed exact scope', async () => {
    const root = temporaryRoot();
    const id = seed(root, plan('grant', [step('create', 'file.createText', { fileName: 'notes.txt', content: 'once' })]), []);
    const f = fixture(root);
    f.grants.setProfile('balanced');
    await f.objectives.recover();
    await vi.waitFor(() => expect(f.runtime.pendingPlanConsents()).toHaveLength(1));
    expect(f.executed).toEqual([]);
    expect((await handleMorpheusTaskControl('always do this without asking', { ...f, stopSpeech: vi.fn() }))?.control).toBe('permission-saved');
    expect((await f.objectives.waitForTerminal(id)).state).toBe('complete');
    const reloadedGrants = createMorpheusGrantStore({ userDataDir: root });
    expect(reloadedGrants.listPersistentGrants()).toHaveLength(1);
    expect(reloadedGrants.listPersistentGrants()[0].resourceScope).toBe(f.filesRoot);
    expect(reloadedGrants.getProfile()).toBe('balanced');
    reloadedGrants.revoke(reloadedGrants.listPersistentGrants()[0].grantId);
    expect(createMorpheusGrantStore({ userDataDir: root }).listPersistentGrants()).toEqual([]);
  });
});
