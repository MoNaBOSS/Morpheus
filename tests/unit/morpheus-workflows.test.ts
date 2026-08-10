import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MORPHEUS_STARTER_AGENT_PROFILES } from '../../shared/morpheus/agents/registry';
import { MORPHEUS_STARTER_WORKFLOWS } from '../../shared/morpheus/workflows/registry';
import { compileWorkflowPlan } from '../../electron/services/morpheus/workflows/compiler';
import { createMorpheusWorkflowStore, validateMorpheusWorkflow } from '../../electron/services/morpheus/workflows/workflow-store';
import { createMorpheusAgentProfileStore } from '../../electron/services/morpheus/agents/profile-store';
import { createMorpheusWorkflowService } from '../../electron/services/morpheus/workflows/workflow-service';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'morpheus-workflows-'));
  roots.push(root);
  return root;
}

describe('Morpheus workflows', () => {
  it('compiles a starter workflow into a sequential typed plan carrying agent identity', () => {
    const workflow = MORPHEUS_STARTER_WORKFLOWS[0];
    const profile = MORPHEUS_STARTER_AGENT_PROFILES.find((entry) => entry.profileId === workflow.agentProfileId)!;
    const plan = compileWorkflowPlan({
      workflow,
      profile,
      trigger: 'manual',
      origin: { type: 'workflow', workflowId: workflow.workflowId, agentProfileId: profile.profileId },
      platform: 'win32',
      filesRoot: 'C:\\Morpheus Files',
      createId: () => 'workflow-plan-1',
      now: () => new Date('2026-08-10T01:00:00.000Z'),
    });
    expect(plan.planId).toBe('workflow-plan-1');
    expect(plan.origin).toEqual({ type: 'workflow', workflowId: 'system-brief', agentProfileId: 'general' });
    expect(plan.steps.map((step) => step.capabilityId)).toEqual(['system.report', 'system.storage']);
    expect(plan.steps[1].dependsOn).toEqual(['system']);
  });

  it('rejects a workflow that exceeds its Agent Profile allowlist', () => {
    const workflow = structuredClone(MORPHEUS_STARTER_WORKFLOWS[0]);
    workflow.steps[0] = { ...workflow.steps[0], capabilityId: 'file.delete', params: { path: 'x.txt' } };
    const profile = MORPHEUS_STARTER_AGENT_PROFILES[0];
    expect(() => compileWorkflowPlan({
      workflow,
      profile,
      trigger: 'manual',
      origin: { type: 'workflow', workflowId: workflow.workflowId, agentProfileId: profile.profileId },
      platform: 'win32',
      filesRoot: 'C:\\Morpheus Files',
    })).toThrow(/does not allow/);
  });

  it('rejects cyclic workflow state before persistence', () => {
    const workflow = structuredClone(MORPHEUS_STARTER_WORKFLOWS[0]);
    workflow.steps[0] = { ...workflow.steps[0], dependsOn: ['storage'] };
    expect(validateMorpheusWorkflow(workflow)).toBeNull();
  });

  it('registers a manual workflow plan in Main rather than returning renderer-authored work', () => {
    const root = temporaryRoot();
    const store = createMorpheusWorkflowStore({ userDataDir: root });
    const profiles = createMorpheusAgentProfileStore({ userDataDir: root });
    const registerPlan = vi.fn((plan) => plan);
    const service = createMorpheusWorkflowService({
      store,
      profiles,
      runtime: { registerPlan } as never,
      filesRoot: join(root, 'morpheus', 'files'),
      platform: 'win32',
    });
    const plan = service.prepare({
      workflowId: 'system-brief',
      trigger: 'manual',
      origin: { type: 'workflow', workflowId: 'system-brief', agentProfileId: 'general' },
    });
    expect(registerPlan).toHaveBeenCalledOnce();
    expect(plan.steps).toHaveLength(2);
  });
});
