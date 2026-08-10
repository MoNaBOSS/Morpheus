/** Real starter workflows; every step maps to a shipped capability. */
import { MORPHEUS_WORKFLOW_VERSION, type MorpheusWorkflow } from '../workflow-types';

const CREATED_AT = '2026-08-10T00:00:00.000Z';

export const MORPHEUS_STARTER_WORKFLOWS: readonly MorpheusWorkflow[] = Object.freeze([
  Object.freeze({
    v: MORPHEUS_WORKFLOW_VERSION,
    workflowId: 'system-brief',
    name: 'System brief',
    description: 'Collects privacy-safe machine and Morpheus storage information in sequence.',
    agentProfileId: 'general',
    steps: Object.freeze([
      Object.freeze({
        stepId: 'system', capabilityId: 'system.report' as const, params: Object.freeze({}),
        dependsOn: Object.freeze([]), condition: Object.freeze({ type: 'always' as const }),
        summary: 'Collect privacy-safe system information',
      }),
      Object.freeze({
        stepId: 'storage', capabilityId: 'system.storage' as const, params: Object.freeze({}),
        dependsOn: Object.freeze(['system']),
        condition: Object.freeze({ type: 'step-succeeded' as const, stepId: 'system' }),
        summary: 'Inspect approved Morpheus storage',
      }),
    ]),
    allowedTriggers: Object.freeze(['manual', 'schedule', 'app-startup'] as const),
    outputs: Object.freeze({ collectArtifacts: true, retainHistory: true }),
    builtIn: true, enabled: true, createdAt: CREATED_AT, updatedAt: CREATED_AT,
  }),
  Object.freeze({
    v: MORPHEUS_WORKFLOW_VERSION,
    workflowId: 'workspace-inventory',
    name: 'Workspace inventory',
    description: 'Lists the trusted workspace, then searches it for text artifacts.',
    agentProfileId: 'developer',
    steps: Object.freeze([
      Object.freeze({
        stepId: 'list', capabilityId: 'file.list' as const, params: Object.freeze({}),
        dependsOn: Object.freeze([]), condition: Object.freeze({ type: 'always' as const }),
        summary: 'List the approved workspace',
      }),
      Object.freeze({
        stepId: 'search', capabilityId: 'file.search' as const,
        params: Object.freeze({ query: '.txt', limit: 50 }),
        dependsOn: Object.freeze(['list']),
        condition: Object.freeze({ type: 'step-succeeded' as const, stepId: 'list' }),
        summary: 'Find text artifacts in the approved workspace',
      }),
    ]),
    allowedTriggers: Object.freeze(['manual', 'schedule'] as const),
    outputs: Object.freeze({ collectArtifacts: true, retainHistory: true }),
    builtIn: true, enabled: true, createdAt: CREATED_AT, updatedAt: CREATED_AT,
  }),
]);

export function getStarterWorkflow(workflowId: string): MorpheusWorkflow | undefined {
  return MORPHEUS_STARTER_WORKFLOWS.find((workflow) => workflow.workflowId === workflowId);
}
