export const MORPHEUS_RUNTIME_CONTROL_VERSION = 1 as const;

export type MorpheusRuntimeControlSnapshot = {
  v: typeof MORPHEUS_RUNTIME_CONTROL_VERSION;
  /** Pausing stops new objectives and schedules; an active plan may finish safely. */
  paused: boolean;
  updatedAt: string;
};

export type SetMorpheusRuntimePausedPayload = { paused: boolean };
