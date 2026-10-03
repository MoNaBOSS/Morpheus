export const ORB_PRESENTATION_ACTIONS = ['hover', 'collapse', 'open', 'focus', 'drag-start', 'drag-move', 'drag-end', 'move-left', 'move-right', 'move-up', 'move-down', 'reset-position'] as const;
export type OrbPresentationAction = typeof ORB_PRESENTATION_ACTIONS[number];
export type MorpheusOrbPlacement = { displayId: number; x: number; y: number };
