import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMorpheusAuditSink } from '@electron/services/morpheus/audit';
import { createMorpheusAgentProfileStore } from '@electron/services/morpheus/agents/profile-store';
import { createMorpheusCapabilityRegistry } from '@electron/services/morpheus/capability-registry';
import { win32FilesystemCapabilities } from '@electron/services/morpheus/capabilities/win32/filesystem';
import { createWin32ScheduleReminderCapability } from '@electron/services/morpheus/capabilities/win32/schedule-reminder';
import { win32VerifySiteCapability } from '@electron/services/morpheus/capabilities/win32/verify-site';
import { createMorpheusObjectiveOrchestrator } from '@electron/services/morpheus/core/objective-orchestrator';
import { createMorpheusObjectiveStore } from '@electron/services/morpheus/core/objective-store';
import { createMorpheusMemoryStore } from '@electron/services/morpheus/memory/memory-store';
import { createMorpheusMissionStore } from '@electron/services/morpheus/missions/mission-store';
import { createMorpheusGrantStore } from '@electron/services/morpheus/policy/grant-store';
import { createPolicyPermissionGate } from '@electron/services/morpheus/policy/permission-gate';
import { createMorpheusPolicyEngine } from '@electron/services/morpheus/policy/policy-engine';
import { createMorpheusProviderPlanner } from '@electron/services/morpheus/planning/provider-planner';
import { createMorpheusProjectStore } from '@electron/services/morpheus/projects/project-store';
import { createMorpheusRootProvider } from '@electron/services/morpheus/roots';
import { createMorpheusRuntime } from '@electron/services/morpheus/runtime';
import { createMorpheusScheduleStore } from '@electron/services/morpheus/schedules/schedule-store';
import { createMorpheusScheduler } from '@electron/services/morpheus/schedules/scheduler';
import { createMorpheusWorkspaceStore } from '@electron/services/morpheus/workspaces/workspace-store';
import { createMorpheusWorkflowService } from '@electron/services/morpheus/workflows/workflow-service';
import { createMorpheusWorkflowStore } from '@electron/services/morpheus/workflows/workflow-store';
import type { ProviderAccount } from '@electron/shared/providers/types';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const ACCOUNT: ProviderAccount = {
  id: 'provider-hero', vendorId: 'openai', label: 'Hero provider', authMode: 'api_key',
  baseUrl: 'https://provider.example/v1', apiProtocol: 'openai-completions', model: 'gpt-test',
  enabled: true, isDefault: true,
  createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z',
};

const HTML = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="styles.css"></head><body><main><h1>Northstar Studio</h1><p>Clear strategy, shipped beautifully.</p><a href="#services">Explore services</a><section id="services"><h2>Services</h2></section></main></body></html>';
const CSS = ':root{color-scheme:dark}body{margin:0;background:#07110f;color:#ecfff8;font-family:system-ui}main{max-width:70rem;margin:auto;padding:5rem 2rem}h1{font-size:clamp(3rem,8vw,7rem)}a{color:#62f6c8}@media(max-width:720px){main{padding:3rem 1.25rem}h1{font-size:3rem}}';

function providerPlan() {
  const files = [
    ['entry', 'projects/northstar/index.html', HTML],
    ['styles', 'projects/northstar/styles.css', CSS],
    ['analytics', 'projects/northstar/analytics.json', JSON.stringify({ schema: 'morpheus.analytics.v1', events: ['page_view', 'primary_action'] })],
    ['business-plan', 'projects/northstar/business-plan.md', '# Business plan\nPosition Northstar as a focused design partner.'],
    ['management-plan', 'projects/northstar/30-day-plan.md', '# 30-day plan\nWeek 1: validate the offer.\nWeek 2: publish proof.'],
  ];
  return {
    steps: [
      ...files.map(([stepId, path, content], index) => ({
        stepId, capabilityId: 'file.create', params: { path, content },
        dependsOn: index === 0 ? [] : [files[index - 1][0]], summary: `Create ${path}`,
      })),
      {
        stepId: 'verify', capabilityId: 'site.verify', params: { path: 'projects/northstar' },
        dependsOn: files.map(([stepId]) => stepId), summary: 'Verify the responsive website',
      },
      {
        stepId: 'reminder', capabilityId: 'reminder.schedule',
        params: {
          title: 'Northstar daily check-in', body: 'Open the 30-day plan and complete today’s task.',
          runAt: '2026-08-11T09:00:00.000Z', repeatDaily: true,
        },
        dependsOn: ['verify'], summary: 'Schedule a daily plan check-in',
      },
    ],
  };
}

describe('private-alpha hero website objective', () => {
  it('plans with a real provider, writes and verifies a project, then schedules a reminder without fake events', async () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'morpheus-hero-site-'));
    roots.push(userDataDir);
    const now = () => new Date('2026-08-10T10:00:00.000Z');
    const workspaces = createMorpheusWorkspaceStore({ userDataDir, now });
    const rootProvider = createMorpheusRootProvider({ userDataDir, workspaces });
    const auditDir = join(userDataDir, 'morpheus', 'audit');
    const audit = createMorpheusAuditSink({ auditDir, now });
    const grants = createMorpheusGrantStore({ userDataDir, now });
    grants.setProfile('autonomous');
    const registry = createMorpheusCapabilityRegistry();
    for (const capability of win32FilesystemCapabilities) registry.register(capability);
    registry.register(win32VerifySiteCapability);

    let objectives: ReturnType<typeof createMorpheusObjectiveOrchestrator> | undefined;
    const actionEvents: string[] = [];
    const consent = vi.fn();
    const runtime = createMorpheusRuntime({
      registry, roots: rootProvider, workspaces, audit,
      gate: createPolicyPermissionGate(createMorpheusPolicyEngine(grants), grants),
      grants, auditHealth: () => 'healthy', appVersion: '1.0.0', platform: 'win32', now,
      createRunId: (() => { let value = 0; return () => `run-${++value}`; })(),
      emit: (event) => actionEvents.push(`${event.actionId}:${event.phase}`),
      emitPlanConsent: consent,
      onPlanLifecycle: (event) => objectives?.onPlanLifecycle(event),
    });

    const profiles = createMorpheusAgentProfileStore({ userDataDir });
    const workflowStore = createMorpheusWorkflowStore({ userDataDir });
    const workflows = createMorpheusWorkflowService({ store: workflowStore, profiles, workspaces, platform: 'win32' });
    const scheduleStore = createMorpheusScheduleStore({ userDataDir });
    const scheduler = createMorpheusScheduler({
      store: scheduleStore, workflows, objectives: {} as never, now,
      createId: () => 'schedule-hero',
    });
    registry.register(createWin32ScheduleReminderCapability({ scheduler, now }));

    let providerCall = 0;
    const fetchImpl = vi.fn(async () => {
      providerCall += 1;
      const content = providerCall === 1
        ? JSON.stringify(providerPlan())
        : JSON.stringify({ outcome: 'complete', summary: 'Built and verified the Northstar launch project and scheduled its daily check-in.' });
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
    });
    const planner = createMorpheusProviderPlanner({
      account: ACCOUNT, apiKey: 'test-key-never-persisted', fetchImpl: fetchImpl as typeof fetch,
      now, createId: (() => { let value = 0; return () => `provider-plan-${++value}`; })(),
    });
    const objectiveStore = createMorpheusObjectiveStore({ userDataDir });
    objectives = createMorpheusObjectiveOrchestrator({
      store: objectiveStore, runtime, agents: profiles,
      planners: { select: async () => ({ ok: true, planner, providerAccountId: ACCOUNT.id, modelId: ACCOUNT.model }) },
      audit, appVersion: '1.0.0', workspaces,
      missions: createMorpheusMissionStore({ userDataDir }),
      projects: createMorpheusProjectStore({ userDataDir, now }),
      memory: createMorpheusMemoryStore({ userDataDir }),
      platform: 'win32', now,
      createId: () => 'objective-hero',
      emit: () => undefined,
    });

    const submitted = await objectives.submit({
      objective: 'Build a responsive website and business plan for Northstar, then remind me every day to execute the 30-day plan.',
      originType: 'command-bar', projectId: 'personal',
    });
    expect(submitted.accepted).toBe(true);
    const terminal = await objectives.waitForTerminal(submitted.objectiveRunId);
    expect(terminal.state).toBe('complete');
    expect(terminal.plannerId).toBe('provider:provider-hero');
    expect(terminal.route?.kind).toBe('provider-plan');
    expect(terminal.artifacts.map((artifact) => artifact.kind)).toEqual([
      'file', 'file', 'file', 'file', 'file', 'website', 'schedule',
    ]);
    expect(consent).not.toHaveBeenCalled();

    const project = join(workspaces.resolveRoot(), 'projects', 'northstar');
    expect(readFileSync(join(project, 'index.html'), 'utf8')).toContain('Northstar Studio');
    expect(existsSync(join(project, '30-day-plan.md'))).toBe(true);
    expect(terminal.artifacts.find((artifact) => artifact.kind === 'website')).toMatchObject({
      kind: 'website', entryPath: join(project, 'index.html'), fileCount: 5,
    });
    expect(scheduleStore.get('schedule-hero')).toMatchObject({
      workspaceId: 'morpheus-files', enabled: true, trigger: { type: 'daily' },
    });
    expect(actionEvents.filter((event) => event.endsWith(':succeeded'))).toHaveLength(7);
    // A conclusive completed plan does not need a second provider review call.
    expect(providerCall).toBe(1);

    const auditRaw = readdirSync(auditDir).map((name) => readFileSync(join(auditDir, name), 'utf8')).join('\n');
    expect(auditRaw).not.toContain(HTML);
    expect(auditRaw).not.toContain('Open the 30-day plan and complete today’s task.');
    expect(auditRaw).not.toContain('test-key-never-persisted');
    expect(auditRaw).toContain('site.verify');
    expect(auditRaw).toContain('reminder.schedule');

    objectives.dispose();
    runtime.dispose();
  });
});
