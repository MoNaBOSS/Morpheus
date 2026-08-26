import type { MorpheusAgentProfile } from '@shared/morpheus/agent-profile-types';
import type { MorpheusMemory } from '@shared/morpheus/memory-types';
import type { MorpheusProject } from '@shared/morpheus/project-types';
import type {
  MorpheusContextItem,
  MorpheusObjectiveRun,
} from '@shared/morpheus/core/objective-types';

export const MORPHEUS_CONTEXT_MAX_ITEMS = 32;
export const MORPHEUS_CONTEXT_MAX_CHARS = 8_000;
const MAX_ITEM_CHARS = 1_000;

export type MorpheusContextSelectionInput = {
  current: MorpheusObjectiveRun;
  history: readonly MorpheusObjectiveRun[];
  agent: MorpheusAgentProfile;
  workspaceLabel: string;
  project?: MorpheusProject;
  memories?: readonly MorpheusMemory[];
  maxItems?: number;
  maxChars?: number;
};

/**
 * Selects bounded, provider-safe context. Raw file contents, audio, audit data,
 * credentials and failed-operation payloads never enter this layer.
 */
export function selectMorpheusContext(input: MorpheusContextSelectionInput): MorpheusContextItem[] {
  const itemLimit = Math.min(
    input.maxItems ?? MORPHEUS_CONTEXT_MAX_ITEMS,
    input.agent.memory.maxContextItems,
    MORPHEUS_CONTEXT_MAX_ITEMS,
  );
  if (itemLimit <= 0 || input.agent.memory.mode === 'none') return [];
  const charLimit = Math.min(input.maxChars ?? MORPHEUS_CONTEXT_MAX_CHARS, MORPHEUS_CONTEXT_MAX_CHARS);

  // Agent instructions have their own bounded field in the planner request.
  // Duplicating them here wastes tokens and increases provider latency.
  const candidates: MorpheusContextItem[] = [{
    contextId: 'workspace:morpheus-files',
    source: 'workspace',
    text: `Active approved workspace: ${input.workspaceLabel}. All file parameters must be relative to this workspace.`,
    createdAt: input.current.createdAt,
    sensitivity: 'normal',
    workspaceId: input.current.workspaceId,
  }];

  if (input.project?.instructions.trim()) {
    candidates.push({
      contextId: `project:${input.project.projectId}`,
      source: 'project',
      text: input.project.instructions.trim().slice(0, MAX_ITEM_CHARS),
      createdAt: input.project.updatedAt,
      sensitivity: 'normal',
      workspaceId: input.project.workspaceId,
    });
  }

  for (const memory of input.memories ?? []) {
    if (!memory.enabled || memory.providerUse !== 'allowed' || memory.sensitivity !== 'normal') continue;
    candidates.push({
      contextId: `memory:${memory.memoryId}`,
      source: memory.kind === 'preference' ? 'preference' : 'memory',
      text: memory.text.slice(0, MAX_ITEM_CHARS),
      createdAt: memory.updatedAt,
      sensitivity: 'normal',
      workspaceId: input.current.workspaceId,
    });
  }

  if (input.agent.memory.mode === 'session' || input.agent.memory.mode === 'workspace') {
    for (const run of input.history) {
      if (run.objectiveRunId === input.current.objectiveRunId || !run.summary || run.state !== 'complete') continue;
      if (input.agent.memory.mode === 'workspace' && run.workspaceId !== input.current.workspaceId) continue;
      candidates.push({
        contextId: `objective:${run.objectiveRunId}`,
        source: input.agent.memory.mode === 'workspace' ? 'workspace' : 'session',
        text: run.summary.slice(0, MAX_ITEM_CHARS),
        createdAt: run.completedAt ?? run.updatedAt,
        sensitivity: 'normal',
        workspaceId: run.workspaceId,
        agentProfileId: run.agentProfileId,
      });
    }
  }

  const selected: MorpheusContextItem[] = [];
  let used = 0;
  for (const candidate of candidates) {
    if (candidate.sensitivity !== 'normal' || selected.length >= itemLimit) continue;
    if (used + candidate.text.length > charLimit) continue;
    selected.push(candidate);
    used += candidate.text.length;
  }
  return selected;
}
