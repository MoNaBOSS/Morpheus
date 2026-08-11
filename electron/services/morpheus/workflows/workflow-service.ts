import type { ExecutionPlan } from '@shared/morpheus/execution-types';
import type { MorpheusWorkflow, WorkflowTriggerType, WorkflowsSnapshot } from '@shared/morpheus/workflow-types';
import { MORPHEUS_DEFAULT_WORKSPACE_ID } from '@shared/morpheus/workspace-types';

import type { MorpheusAgentProfileStore } from '../agents/profile-store';
import type { MorpheusWorkflowStore } from './workflow-store';
import type { MorpheusWorkspaceStore } from '../workspaces/workspace-store';
import { compileWorkflowPlan } from './compiler';

export interface MorpheusWorkflowService {
  list(): WorkflowsSnapshot;
  get(workflowId: string): MorpheusWorkflow | undefined;
  save(workflow: MorpheusWorkflow): MorpheusWorkflow;
  remove(workflowId: string): boolean;
  prepare(input: {
    workflowId: string;
    trigger: WorkflowTriggerType;
    origin: ExecutionPlan['origin'];
    workspaceId?: string;
  }): ExecutionPlan;
}

export function createMorpheusWorkflowService(options: {
  store: MorpheusWorkflowStore;
  profiles: MorpheusAgentProfileStore;
  workspaces: Pick<MorpheusWorkspaceStore, 'get' | 'resolveRoot'>;
  platform?: string;
}): MorpheusWorkflowService {
  return {
    list: () => options.store.list(),
    get: (workflowId) => options.store.get(workflowId),
    save: (workflow) => options.store.save(workflow),
    remove: (workflowId) => options.store.remove(workflowId),
    prepare(input) {
      const workflow = options.store.get(input.workflowId);
      if (!workflow) throw new Error('Unknown Morpheus workflow');
      const profile = options.profiles.get(workflow.agentProfileId);
      if (!profile) throw new Error('Workflow Agent Profile is unavailable');
      const workspaceId = input.workspaceId ?? MORPHEUS_DEFAULT_WORKSPACE_ID;
      const workspace = options.workspaces.get(workspaceId);
      if (!workspace?.enabled || !workspace.available) throw new Error('Workflow workspace is unavailable');
      const plan = compileWorkflowPlan({
        workflow,
        profile,
        trigger: input.trigger,
        origin: input.origin,
        platform: options.platform ?? process.platform,
        filesRoot: options.workspaces.resolveRoot(workspaceId),
        workspaceAccess: workspace.access,
      });
      return { ...plan, workspaceId };
    },
  };
}
