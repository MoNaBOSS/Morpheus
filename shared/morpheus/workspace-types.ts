/** Platform-neutral view of Main-owned Morpheus workspaces. */
export const MORPHEUS_WORKSPACE_VERSION = 1 as const;
export const MORPHEUS_DEFAULT_WORKSPACE_ID = 'morpheus-files' as const;

export type MorpheusWorkspaceAccess = 'read' | 'read-write';

export type MorpheusWorkspace = {
  v: typeof MORPHEUS_WORKSPACE_VERSION;
  workspaceId: string;
  name: string;
  /** Canonical root selected and persisted by Main. Renderer cannot set it. */
  rootPath: string;
  kind: 'managed' | 'user';
  access: MorpheusWorkspaceAccess;
  enabled: boolean;
  available: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MorpheusWorkspacesSnapshot = {
  defaultWorkspaceId: typeof MORPHEUS_DEFAULT_WORKSPACE_ID;
  workspaces: readonly MorpheusWorkspace[];
};

/** Path is deliberately absent: Main obtains it from the native folder picker. */
export type AddMorpheusWorkspacePayload = {
  name?: string;
  access?: MorpheusWorkspaceAccess;
};

export type UpdateMorpheusWorkspacePayload = {
  workspaceId: string;
  name?: string;
  access?: MorpheusWorkspaceAccess;
  enabled?: boolean;
};

export type MorpheusWorkspaceIdPayload = { workspaceId: string };
export type RemoveMorpheusWorkspacePayload = MorpheusWorkspaceIdPayload;
export type MorpheusWorkspaceResult = { workspace: MorpheusWorkspace | null };

export function isMorpheusWorkspaceId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9-]{1,79}$/.test(value);
}
