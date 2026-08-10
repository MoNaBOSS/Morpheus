import { randomUUID } from 'node:crypto';

import {
  MORPHEUS_PLAN_VERSION,
  type ExecutionOrigin,
  type ExecutionPlan,
  type ExecutionStep,
  type PermissionRequirement,
} from '@shared/morpheus/execution-types';
import {
  getMorpheusActionDescriptor,
  requiresMandatoryConfirmation,
  type MorpheusRiskTier,
} from '@shared/morpheus/actions/registry';
import type { MorpheusAgentProfile } from '@shared/morpheus/agent-profile-types';
import type { MorpheusWorkflow, WorkflowTriggerType } from '@shared/morpheus/workflow-types';
import { validateParams } from '@shared/morpheus/capabilities/params';
import { buildPlanGraph } from '@shared/morpheus/plan/graph';

const RISK_ORDER: Record<MorpheusRiskTier, number> = {
  low: 0, medium: 1, high: 2, critical: 3,
};

function declaredScope(capabilityId: ExecutionStep['capabilityId'], params: ExecutionStep['params'], filesRoot: string): string {
  const descriptor = getMorpheusActionDescriptor(capabilityId);
  if (descriptor.rootKey) return filesRoot;
  if (capabilityId === 'app.launch' && 'applicationKey' in params) return String(params.applicationKey);
  return 'runtime';
}

export type CompileWorkflowOptions = {
  workflow: MorpheusWorkflow;
  profile: MorpheusAgentProfile;
  trigger: WorkflowTriggerType;
  origin: ExecutionOrigin;
  platform: string;
  filesRoot: string;
  now?: () => Date;
  createId?: () => string;
};

/**
 * Compiles a reusable workflow into the same plan shape as command input.
 * Profile checks only NARROW the plan. The runtime still resolves targets and
 * evaluates trust, so compilation can never grant authority.
 */
export function compileWorkflowPlan(options: CompileWorkflowOptions): ExecutionPlan {
  const { workflow, profile, trigger, origin, platform, filesRoot } = options;
  if (!workflow.enabled) throw new Error('Workflow is disabled');
  if (!profile.enabled) throw new Error('Agent Profile is disabled');
  if (workflow.agentProfileId !== profile.profileId) throw new Error('Workflow Agent Profile does not match');
  if (!workflow.allowedTriggers.includes(trigger)) throw new Error(`Workflow does not allow ${trigger} execution`);

  const allowed = new Set(profile.permissionBoundary.capabilityIds);
  const steps: ExecutionStep[] = workflow.steps.map((workflowStep) => {
    if (!allowed.has(workflowStep.capabilityId)) {
      throw new Error(`Agent Profile does not allow ${workflowStep.capabilityId}`);
    }
    const descriptor = getMorpheusActionDescriptor(workflowStep.capabilityId);
    if (RISK_ORDER[descriptor.riskTier] > RISK_ORDER[profile.permissionBoundary.maxRiskTier]) {
      throw new Error(`${workflowStep.capabilityId} exceeds the Agent Profile risk boundary`);
    }
    const validated = validateParams(descriptor.params, workflowStep.params);
    if (!validated.ok) throw new Error(`Invalid workflow parameters for ${workflowStep.capabilityId}`);
    const permission: PermissionRequirement = {
      capabilityId: workflowStep.capabilityId,
      platform,
      riskTier: descriptor.riskTier,
      resourceScope: declaredScope(workflowStep.capabilityId, validated.params as never, filesRoot),
      mandatoryConfirmation: requiresMandatoryConfirmation(descriptor.riskTier),
    };
    return {
      stepId: workflowStep.stepId,
      capabilityId: workflowStep.capabilityId,
      params: validated.params as ExecutionStep['params'],
      summaryKey: 'morpheus.workflow.step',
      summaryValues: { summary: workflowStep.summary },
      permission,
      dependsOn: [...workflowStep.dependsOn],
    };
  });

  const graph = buildPlanGraph(steps);
  if (!graph.ok) throw new Error('Workflow dependency graph is invalid');

  const now = options.now ?? (() => new Date());
  return {
    v: MORPHEUS_PLAN_VERSION,
    planId: options.createId?.() ?? `workflow-${randomUUID()}`,
    createdAt: now().toISOString(),
    origin,
    objective: workflow.name,
    status: 'draft',
    steps,
    plannedBy: 'deterministic',
  };
}

