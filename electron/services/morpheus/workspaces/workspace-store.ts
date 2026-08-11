import { existsSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, isAbsolute, join } from 'node:path';

import {
  MORPHEUS_DEFAULT_WORKSPACE_ID,
  MORPHEUS_WORKSPACE_VERSION,
  type MorpheusWorkspace,
  type MorpheusWorkspaceAccess,
  type MorpheusWorkspacesSnapshot,
  type UpdateMorpheusWorkspacePayload,
  isMorpheusWorkspaceId,
} from '@shared/morpheus/workspace-types';

import { normalizeComparablePath } from '../../../utils/morpheus-path-guard';
import { readValidatedJson, writeJsonAtomically } from '../storage/atomic-json';

type StoredWorkspace = Omit<MorpheusWorkspace, 'available'>;
type StoredWorkspaces = { v: 1; workspaces: StoredWorkspace[] };

export interface MorpheusWorkspaceStore {
  list(): MorpheusWorkspacesSnapshot;
  get(workspaceId: string): MorpheusWorkspace | undefined;
  resolveRoot(workspaceId?: string): string;
  add(directoryPath: string, options?: { name?: string; access?: MorpheusWorkspaceAccess }): MorpheusWorkspace;
  update(payload: UpdateMorpheusWorkspacePayload): MorpheusWorkspace;
  remove(workspaceId: string): MorpheusWorkspace | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim();
  return name && name.length <= 80 ? name : null;
}

function validateStoredWorkspace(value: unknown): StoredWorkspace | null {
  if (!isRecord(value) || value.v !== MORPHEUS_WORKSPACE_VERSION
    || !isMorpheusWorkspaceId(value.workspaceId) || !validateName(value.name)
    || typeof value.rootPath !== 'string' || !isAbsolute(value.rootPath)
    || !['managed', 'user'].includes(String(value.kind))
    || !['read', 'read-write'].includes(String(value.access))
    || typeof value.enabled !== 'boolean'
    || typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') return null;
  return value as StoredWorkspace;
}

function validateStored(value: unknown): StoredWorkspaces | null {
  if (!isRecord(value) || value.v !== 1 || !Array.isArray(value.workspaces)) return null;
  const workspaces = value.workspaces.map(validateStoredWorkspace);
  if (workspaces.some((workspace) => !workspace)) return null;
  return { v: 1, workspaces: workspaces as StoredWorkspace[] };
}

function canonicalDirectory(path: string): string {
  if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error('Workspace folder is unavailable');
  return realpathSync.native(path);
}

function isAvailable(workspace: StoredWorkspace): boolean {
  if (!workspace.enabled) return false;
  try {
    return normalizeComparablePath(canonicalDirectory(workspace.rootPath))
      === normalizeComparablePath(workspace.rootPath);
  } catch {
    return false;
  }
}

function materialize(workspace: StoredWorkspace): MorpheusWorkspace {
  return { ...structuredClone(workspace), available: isAvailable(workspace) };
}

export function createMorpheusWorkspaceStore(options: {
  userDataDir: string;
  now?: () => Date;
  createId?: () => string;
}): MorpheusWorkspaceStore {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => `workspace-${randomUUID()}`);
  const managedRoot = join(options.userDataDir, 'morpheus', 'files');
  mkdirSync(managedRoot, { recursive: true });
  const canonicalManagedRoot = canonicalDirectory(managedRoot);
  const file = join(options.userDataDir, 'morpheus', 'workspaces.json');
  const loaded = readValidatedJson(file, validateStored);
  const loadedManaged = loaded?.workspaces.find(
    (workspace) => workspace.workspaceId === MORPHEUS_DEFAULT_WORKSPACE_ID,
  );
  const byId = new Map<string, StoredWorkspace>();
  for (const workspace of loaded?.workspaces ?? []) {
    if (workspace.workspaceId === MORPHEUS_DEFAULT_WORKSPACE_ID) continue;
    byId.set(workspace.workspaceId, structuredClone(workspace));
  }
  const stamp = now().toISOString();
  byId.set(MORPHEUS_DEFAULT_WORKSPACE_ID, {
    v: MORPHEUS_WORKSPACE_VERSION,
    workspaceId: MORPHEUS_DEFAULT_WORKSPACE_ID,
    name: loadedManaged?.name ?? 'Morpheus Files',
    rootPath: canonicalManagedRoot,
    kind: 'managed',
    access: loadedManaged?.access ?? 'read-write',
    enabled: true,
    createdAt: loadedManaged?.createdAt ?? stamp,
    updatedAt: loadedManaged?.updatedAt ?? stamp,
  });

  const flush = (): void => writeJsonAtomically(file, {
    v: 1,
    workspaces: [...byId.values()],
  });
  const getStored = (workspaceId: string): StoredWorkspace => {
    const workspace = byId.get(workspaceId);
    if (!workspace) throw new Error('Unknown Morpheus workspace');
    return workspace;
  };

  return {
    list: () => ({
      defaultWorkspaceId: MORPHEUS_DEFAULT_WORKSPACE_ID,
      workspaces: [...byId.values()].map(materialize),
    }),
    get(workspaceId) {
      const workspace = byId.get(workspaceId);
      return workspace ? materialize(workspace) : undefined;
    },
    resolveRoot(workspaceId = MORPHEUS_DEFAULT_WORKSPACE_ID) {
      const workspace = getStored(workspaceId);
      if (!workspace.enabled) throw new Error('Morpheus workspace is disabled');
      const canonical = canonicalDirectory(workspace.rootPath);
      if (normalizeComparablePath(canonical) !== normalizeComparablePath(workspace.rootPath)) {
        throw new Error('Morpheus workspace root changed after approval');
      }
      return canonical;
    },
    add(directoryPath, addOptions = {}) {
      const rootPath = canonicalDirectory(directoryPath);
      const duplicate = [...byId.values()].find((workspace) => (
        normalizeComparablePath(workspace.rootPath) === normalizeComparablePath(rootPath)
      ));
      if (duplicate) return materialize(duplicate);
      const name = validateName(addOptions.name) ?? validateName(basename(rootPath)) ?? 'Workspace';
      const access = addOptions.access ?? 'read-write';
      if (!['read', 'read-write'].includes(access)) throw new Error('Invalid workspace access');
      const timestamp = now().toISOString();
      const workspace: StoredWorkspace = {
        v: MORPHEUS_WORKSPACE_VERSION,
        workspaceId: createId(),
        name,
        rootPath,
        kind: 'user',
        access,
        enabled: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      if (!isMorpheusWorkspaceId(workspace.workspaceId)) throw new Error('Invalid generated workspace id');
      byId.set(workspace.workspaceId, workspace);
      try {
        flush();
      } catch (error) {
        byId.delete(workspace.workspaceId);
        throw error;
      }
      return materialize(workspace);
    },
    update(payload) {
      const current = getStored(payload.workspaceId);
      const name = payload.name === undefined ? current.name : validateName(payload.name);
      if (!name) throw new Error('Invalid workspace name');
      const access = payload.access ?? current.access;
      if (!['read', 'read-write'].includes(access)) throw new Error('Invalid workspace access');
      const enabled = current.kind === 'managed' ? true : payload.enabled ?? current.enabled;
      const next: StoredWorkspace = {
        ...current,
        name,
        access,
        enabled,
        updatedAt: now().toISOString(),
      };
      byId.set(next.workspaceId, next);
      try {
        flush();
      } catch (error) {
        byId.set(current.workspaceId, current);
        throw error;
      }
      return materialize(next);
    },
    remove(workspaceId) {
      const workspace = byId.get(workspaceId);
      if (!workspace) return null;
      if (workspace.kind === 'managed') throw new Error('The managed Morpheus workspace cannot be removed');
      byId.delete(workspaceId);
      try {
        flush();
      } catch (error) {
        byId.set(workspaceId, workspace);
        throw error;
      }
      return materialize(workspace);
    },
  };
}
