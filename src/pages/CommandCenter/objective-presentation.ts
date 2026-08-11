/**
 * Objective runs start at zero while Main is still understanding the request,
 * then use one-based iteration numbers for every planned execution pass.
 */
export function objectivePassNumber(iteration: number): number {
  return Math.max(1, iteration);
}
