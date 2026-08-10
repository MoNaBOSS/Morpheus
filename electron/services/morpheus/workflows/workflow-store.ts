import { join } from 'node:path';

import { MORPHEUS_STARTER_WORKFLOWS } from '@shared/morpheus/workflows/registry';
import type { MorpheusWorkflow, WorkflowsSnapshot } from '@shared/morpheus/workflow-types';
import { isMorpheusActionId } from '@shared/morpheus/actions/registry';
import { validateParams } from '@shared/morpheus/capabilities/params';
import { getMorpheusActionDescriptor } from '@shared/morpheus/actions/registry';
import { buildPlanGraph } from '@shared/morpheus/plan/graph';

import { readValidatedJson, writeJsonAtomically } from '../storage/atomic-json';

type StoredWorkflows = { v: 1; workflows: MorpheusWorkflow[] };

export interface MorpheusWorkflowStore {
  list(): WorkflowsSnapshot;
  get(workflowId: string): MorpheusWorkflow | undefined;
  save(workflow: MorpheusWorkflow): MorpheusWorkflow;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateMorpheusWorkflow(value: unknown): MorpheusWorkflow | null {
  if (!isRecord(value) || value.v !== 1) return null;
  if (typeof value.workflowId !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(value.workflowId)) return null;
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100) return null;
  if (typeof value.description !== 'string' || value.description.length > 400) return null;
  if (typeof value.agentProfileId !== 'string' || !value.agentProfileId) return null;
  if (typeof value.enabled !== 'boolean' || typeof value.builtIn !== 'boolean') return null;
  if (typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') return null;
  if (!Array.isArray(value.allowedTriggers)
    || value.allowedTriggers.some((trigger) => !['manual', 'schedule', 'app-startup'].includes(String(trigger)))) return null;
  if (!isRecord(value.outputs) || typeof value.outputs.collectArtifacts !== 'boolean'
    || typeof value.outputs.retainHistory !== 'boolean') return null;
  if (!Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > 32) return null;

  const stepIds = new Set<string>();
  for (const raw of value.steps) {
    if (!isRecord(raw) || typeof raw.stepId !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(raw.stepId)
      || stepIds.has(raw.stepId) || !isMorpheusActionId(raw.capabilityId)
      || !Array.isArray(raw.dependsOn) || raw.dependsOn.some((id) => typeof id !== 'string')
      || typeof raw.summary !== 'string' || !raw.summary.trim() || raw.summary.length > 160) return null;
    stepIds.add(raw.stepId);
    const descriptor = getMorpheusActionDescriptor(raw.capabilityId);
    if (!validateParams(descriptor.params, raw.params).ok) return null;
    if (raw.condition !== undefined) {
      if (!isRecord(raw.condition) || !['always', 'step-succeeded'].includes(String(raw.condition.type))) return null;
      if (raw.condition.type === 'step-succeeded' && typeof raw.condition.stepId !== 'string') return null;
    }
  }

  const graph = buildPlanGraph(value.steps.map((step) => ({
    stepId: step.stepId,
    dependsOn: step.dependsOn,
  })) as never);
  if (!graph.ok) return null;
  for (const step of value.steps) {
    if (step.condition?.type === 'step-succeeded' && !step.dependsOn.includes(step.condition.stepId)) return null;
  }
  return value as MorpheusWorkflow;
}

function validateStored(value: unknown): StoredWorkflows | null {
  if (!isRecord(value) || value.v !== 1 || !Array.isArray(value.workflows)) return null;
  const workflows = value.workflows.map(validateMorpheusWorkflow);
  if (workflows.some((entry) => !entry)) return null;
  return { v: 1, workflows: workflows as MorpheusWorkflow[] };
}

export function createMorpheusWorkflowStore(options: { userDataDir: string }): MorpheusWorkflowStore {
  const file = join(options.userDataDir, 'morpheus', 'workflows.json');
  const byId = new Map<string, MorpheusWorkflow>();
  for (const workflow of MORPHEUS_STARTER_WORKFLOWS) byId.set(workflow.workflowId, structuredClone(workflow));
  const loaded = readValidatedJson(file, validateStored);
  for (const stored of loaded?.workflows ?? []) {
    const starter = MORPHEUS_STARTER_WORKFLOWS.find((workflow) => workflow.workflowId === stored.workflowId);
    byId.set(stored.workflowId, { ...structuredClone(stored), builtIn: Boolean(starter), createdAt: starter?.createdAt ?? stored.createdAt });
  }
  const flush = (): void => writeJsonAtomically(file, { v: 1, workflows: [...byId.values()] });
  const snapshot = (): WorkflowsSnapshot => ({ workflows: [...byId.values()].map((entry) => structuredClone(entry)) });
  return {
    list: snapshot,
    get(workflowId) {
      const workflow = byId.get(workflowId);
      return workflow ? structuredClone(workflow) : undefined;
    },
    save(workflow) {
      const valid = validateMorpheusWorkflow(workflow);
      if (!valid) throw new Error('Invalid Morpheus workflow');
      const existing = byId.get(valid.workflowId);
      const next = { ...structuredClone(valid), builtIn: existing?.builtIn ?? false, createdAt: existing?.createdAt ?? valid.createdAt };
      byId.set(next.workflowId, next);
      flush();
      return structuredClone(next);
    },
  };
}
