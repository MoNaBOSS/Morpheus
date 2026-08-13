import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import {
  MORPHEUS_PERSONAL_PROJECT_ID,
  MORPHEUS_PROJECT_VERSION,
  isMorpheusProjectId,
  type MorpheusProject,
  type MorpheusProjectDraft,
  type MorpheusProjectsSnapshot,
} from '@shared/morpheus/project-types';
import { MORPHEUS_DEFAULT_WORKSPACE_ID } from '@shared/morpheus/workspace-types';

import { readValidatedJson, writeJsonAtomically } from '../storage/atomic-json';

const MAX_PROJECTS = 100;

type StoredProjects = { v: 1; projects: MorpheusProject[] };

export interface MorpheusProjectStore {
  list(): MorpheusProjectsSnapshot;
  get(projectId: string): MorpheusProject | undefined;
  save(draft: MorpheusProjectDraft): MorpheusProject;
  remove(projectId: string): MorpheusProject | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validText(value: unknown, max: number, allowEmpty = false): value is string {
  return typeof value === 'string' && value.length <= max && (allowEmpty || Boolean(value.trim()));
}

function validateProject(value: unknown): MorpheusProject | null {
  if (!isRecord(value) || value.v !== MORPHEUS_PROJECT_VERSION
    || !isMorpheusProjectId(value.projectId) || !validText(value.name, 80)
    || !validText(value.description, 400, true) || !validText(value.instructions, 2_000, true)
    || typeof value.workspaceId !== 'string' || typeof value.enabled !== 'boolean'
    || typeof value.builtIn !== 'boolean' || typeof value.createdAt !== 'string'
    || typeof value.updatedAt !== 'string') return null;
  return structuredClone(value) as MorpheusProject;
}

function validateStored(value: unknown): StoredProjects | null {
  if (!isRecord(value) || value.v !== 1 || !Array.isArray(value.projects)) return null;
  const projects = value.projects.map(validateProject);
  if (projects.some((project) => !project)) return null;
  return { v: 1, projects: (projects as MorpheusProject[]).slice(0, MAX_PROJECTS) };
}

function normalizeDraft(draft: MorpheusProjectDraft): MorpheusProjectDraft {
  const name = draft.name.trim();
  const description = draft.description.trim();
  const instructions = draft.instructions.trim();
  if (!name || name.length > 80) throw new Error('Project name must be between 1 and 80 characters');
  if (description.length > 400) throw new Error('Project description is too long');
  if (instructions.length > 2_000) throw new Error('Project context is too long');
  if (typeof draft.workspaceId !== 'string' || !draft.workspaceId) throw new Error('Project workspace is required');
  return { ...draft, name, description, instructions };
}

export function createMorpheusProjectStore(options: {
  userDataDir: string;
  now?: () => Date;
  createId?: () => string;
}): MorpheusProjectStore {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => `project-${randomUUID()}`);
  const file = join(options.userDataDir, 'morpheus', 'projects.json');
  const loaded = readValidatedJson(file, validateStored);
  const byId = new Map<string, MorpheusProject>();
  for (const project of loaded?.projects ?? []) byId.set(project.projectId, structuredClone(project));
  const stamp = now().toISOString();
  const loadedPersonal = byId.get(MORPHEUS_PERSONAL_PROJECT_ID);
  byId.set(MORPHEUS_PERSONAL_PROJECT_ID, {
    v: MORPHEUS_PROJECT_VERSION,
    projectId: MORPHEUS_PERSONAL_PROJECT_ID,
    name: loadedPersonal?.name ?? 'Personal',
    description: loadedPersonal?.description ?? 'Your default Morpheus context.',
    workspaceId: loadedPersonal?.workspaceId ?? MORPHEUS_DEFAULT_WORKSPACE_ID,
    instructions: loadedPersonal?.instructions ?? '',
    enabled: true,
    builtIn: true,
    createdAt: loadedPersonal?.createdAt ?? stamp,
    updatedAt: loadedPersonal?.updatedAt ?? stamp,
  });

  const flush = (): void => writeJsonAtomically(file, {
    v: 1,
    projects: [...byId.values()].slice(0, MAX_PROJECTS),
  } satisfies StoredProjects);

  return {
    list: () => ({
      defaultProjectId: MORPHEUS_PERSONAL_PROJECT_ID,
      projects: [...byId.values()].map((project) => structuredClone(project)),
    }),
    get(projectId) {
      const project = byId.get(projectId);
      return project ? structuredClone(project) : undefined;
    },
    save(input) {
      const draft = normalizeDraft(input);
      const projectId = draft.projectId ?? createId();
      if (!isMorpheusProjectId(projectId)) throw new Error('Invalid generated Project id');
      const existing = byId.get(projectId);
      if (existing?.builtIn && draft.enabled === false) throw new Error('The Personal Project cannot be disabled');
      if (!existing && byId.size >= MAX_PROJECTS) throw new Error('Project limit reached');
      const timestamp = now().toISOString();
      const project: MorpheusProject = {
        v: MORPHEUS_PROJECT_VERSION,
        projectId,
        name: draft.name,
        description: draft.description,
        workspaceId: draft.workspaceId,
        instructions: draft.instructions,
        enabled: existing?.builtIn ? true : draft.enabled,
        builtIn: existing?.builtIn ?? false,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      byId.set(projectId, project);
      try {
        flush();
      } catch (error) {
        if (existing) byId.set(projectId, existing);
        else byId.delete(projectId);
        throw error;
      }
      return structuredClone(project);
    },
    remove(projectId) {
      const project = byId.get(projectId);
      if (!project) return null;
      if (project.builtIn) throw new Error('The Personal Project cannot be removed');
      byId.delete(projectId);
      try {
        flush();
      } catch (error) {
        byId.set(projectId, project);
        throw error;
      }
      return structuredClone(project);
    },
  };
}
