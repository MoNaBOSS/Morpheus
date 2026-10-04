/** A local presentation preference. It grants no subscription or tool access. */
export const MORPHEUS_APPEARANCES = ['green', 'unrestricted-preview'] as const;
export type MorpheusAppearance = typeof MORPHEUS_APPEARANCES[number];

export function isMorpheusAppearance(value: unknown): value is MorpheusAppearance {
  return MORPHEUS_APPEARANCES.includes(value as MorpheusAppearance);
}

export function normalizeMorpheusAppearance(value: unknown): MorpheusAppearance {
  return isMorpheusAppearance(value) ? value : 'green';
}
