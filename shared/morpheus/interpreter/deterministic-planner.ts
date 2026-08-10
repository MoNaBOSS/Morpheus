/** The real 0.5 planner adapter: bounded phrase interpretation, no AI claims. */
import type { MorpheusPlanner, MorpheusPlanningRequest } from '../planner';
import { interpretCommand, type InterpretOptions } from './deterministic';

export type DeterministicPlannerOptions = Pick<InterpretOptions, 'now' | 'createId'>;

export function createDeterministicMorpheusPlanner(
  options: DeterministicPlannerOptions = {},
): MorpheusPlanner {
  return Object.freeze({
    plannerId: 'deterministic-v1',
    plannedBy: 'deterministic' as const,
    plan: (request: MorpheusPlanningRequest) => interpretCommand({ ...request, ...options }),
  });
}
