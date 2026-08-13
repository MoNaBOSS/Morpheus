/** Renderer-visible state of the Main-owned companion presentation mode. */
export type MorpheusCompanionTrigger = 'global-shortcut' | 'tray';

export type MorpheusCompanionSurfaceStatus = {
  mode: 'full' | 'compact';
  trigger?: MorpheusCompanionTrigger;
};
