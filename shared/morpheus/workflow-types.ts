/** Platform-neutral reusable workflow model. */
import type { MorpheusActionId } from './actions/registry';
import type { MorpheusActionParams } from './action-types';

export const MORPHEUS_WORKFLOW_VERSION = 1 as const;

export type WorkflowTriggerType = 'manual' | 'schedule' | 'app-startup';

export type WorkflowCondition =
  | { type: 'always' }
  | { type: 'step-succeeded'; stepId: string };

export type MorpheusWorkflowStep = {
  stepId: string;
  capabilityId: MorpheusActionId;
  params: MorpheusActionParams;
  dependsOn: readonly string[];
  condition?: WorkflowCondition;
  summary: string;
};

export type WorkflowOutputPolicy = {
  collectArtifacts: boolean;
  retainHistory: boolean;
};

export type MorpheusWorkflow = {
  v: typeof MORPHEUS_WORKFLOW_VERSION;
  workflowId: string;
  name: string;
  description: string;
  agentProfileId: string;
  steps: readonly MorpheusWorkflowStep[];
  allowedTriggers: readonly WorkflowTriggerType[];
  outputs: WorkflowOutputPolicy;
  builtIn: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowsSnapshot = { workflows: readonly MorpheusWorkflow[] };

export type RunMorpheusWorkflowPayload = {
  workflowId: string;
  workspaceId?: string;
};

/** Renderer-editable workflow definition. Main authors ids and timestamps. */
export type MorpheusWorkflowDraft = Pick<
  MorpheusWorkflow,
  'name' | 'description' | 'agentProfileId' | 'steps' | 'allowedTriggers'
  | 'outputs' | 'enabled'
> & { workflowId?: string };

export type MorpheusWorkflowResult = { workflow: MorpheusWorkflow | null };
