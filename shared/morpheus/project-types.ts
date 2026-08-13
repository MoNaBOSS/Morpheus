/** Platform-neutral Projects that organize context around Main-owned workspaces. */
export const MORPHEUS_PROJECT_VERSION = 1 as const;
export const MORPHEUS_PERSONAL_PROJECT_ID = 'personal' as const;

export type MorpheusProject = {
  v: typeof MORPHEUS_PROJECT_VERSION;
  projectId: string;
  name: string;
  description: string;
  /** Logical reference only. Main remains authority for the actual root. */
  workspaceId: string;
  /** Bounded planning context, not executable instructions. */
  instructions: string;
  enabled: boolean;
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MorpheusProjectDraft = Pick<
  MorpheusProject,
  'name' | 'description' | 'workspaceId' | 'instructions' | 'enabled'
> & { projectId?: string };

export type MorpheusProjectsSnapshot = {
  defaultProjectId: typeof MORPHEUS_PERSONAL_PROJECT_ID;
  projects: readonly MorpheusProject[];
};

export type MorpheusProjectIdPayload = { projectId: string };
export type MorpheusProjectResult = { project: MorpheusProject | null };

export function isMorpheusProjectId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{1,79}$/.test(value);
}
