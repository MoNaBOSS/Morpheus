import type { ExecutionPlan } from '@shared/morpheus/execution-types';
import type { MorpheusWorkflow, WorkflowTriggerType, WorkflowsSnapshot } from '@shared/morpheus/workflow-types';

import type { MorpheusRuntime } from '../runtime';
import type { MorpheusAgentProfileStore } from '../agents/profile-store';
import type { MorpheusWorkflowStore } from './workflow-store';
import { compileWorkflowPlan } from './compiler';

export interface MorpheusWorkflowService {
  list(): WorkflowsSnapshot;
  get(workflowId: string): MorpheusWorkflow | undefined;
  prepare(input: {
    workflowId: string;
    trigger: WorkflowTriggerType;
    origin: ExecutionPlan['origin'];
  }): ExecutionPlan;
}

export function createMorpheusWorkflowService(options: {
  store: MorpheusWorkflowStore;
  profiles: MorpheusAgentProfileStore;
  runtime: MorpheusRuntime;
  filesRoot: string;
  platform?: string;
}): MorpheusWorkflowService {
  return {
    list: () => options.store.list(),
    get: (workflowId) => options.store.get(workflowId),
    prepare(input) {
      const workflow = options.store.get(input.workflowId);
      if (!workflow) throw new Error('Unknown Morpheus workflow');
      const profile = options.profiles.get(workflow.agentProfileId);
      if (!profile) throw new Error('Workflow Agent Profile is unavailable');
      const plan = compileWorkflowPlan({
        workflow,
        profile,
        trigger: input.trigger,
        origin: input.origin,
        platform: options.platform ?? process.platform,
        filesRoot: options.filesRoot,
      });
      return options.runtime.registerPlan(plan);
    },
  };
}
