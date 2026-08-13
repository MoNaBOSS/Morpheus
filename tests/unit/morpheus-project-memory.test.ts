import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createMorpheusMemoryStore } from '@electron/services/morpheus/memory/memory-store';
import { createMorpheusProjectStore } from '@electron/services/morpheus/projects/project-store';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function setup() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'morpheus-project-memory-'));
  roots.push(userDataDir);
  let projectId = 0;
  let memoryId = 0;
  return {
    userDataDir,
    projects: createMorpheusProjectStore({
      userDataDir,
      now: () => new Date('2026-08-13T00:00:00.000Z'),
      createId: () => `project-${++projectId}`,
    }),
    memory: createMorpheusMemoryStore({
      userDataDir,
      now: () => new Date('2026-08-13T00:00:00.000Z'),
      createId: () => `memory-${++memoryId}`,
    }),
  };
}

describe('Morpheus Projects and inspectable memory', () => {
  it('keeps Projects as logical workspace context, not filesystem authority', () => {
    const { userDataDir, projects } = setup();
    expect(projects.get('personal')).toMatchObject({
      builtIn: true, workspaceId: 'morpheus-files', enabled: true,
    });
    const project = projects.save({
      name: 'Launch', description: 'Product launch', workspaceId: 'workspace-launch',
      instructions: 'Prefer concise progress summaries.', enabled: true,
    });
    expect(project).not.toHaveProperty('rootPath');
    expect(() => projects.remove('personal')).toThrow(/cannot be removed/);

    const restored = createMorpheusProjectStore({ userDataDir });
    expect(restored.get(project.projectId)).toMatchObject({
      name: 'Launch', workspaceId: 'workspace-launch',
    });
  });

  it('selects only enabled normal provider-allowed memory in the exact Project scope', () => {
    const { memory } = setup();
    const base = {
      kind: 'preference' as const,
      sensitivity: 'normal' as const,
      providerUse: 'allowed' as const,
      enabled: true,
    };
    memory.save({ ...base, title: 'Global style', text: 'Use concise summaries.' });
    memory.save({ ...base, title: 'Alpha context', text: 'Project Alpha targets Windows.', projectId: 'project-alpha' });
    memory.save({ ...base, title: 'Beta context', text: 'Project Beta targets mobile.', projectId: 'project-beta' });
    memory.save({ ...base, title: 'Secret', text: 'Never send this.', projectId: 'project-alpha', sensitivity: 'sensitive' });
    memory.save({ ...base, title: 'Local', text: 'Keep this local.', projectId: 'project-alpha', providerUse: 'local-only' });
    memory.save({ ...base, title: 'Disabled', text: 'Do not use.', projectId: 'project-alpha', enabled: false });

    expect(memory.eligibleForPlanning('project-alpha').map((entry) => entry.title).sort())
      .toEqual(['Alpha context', 'Global style']);
  });

  it('deletes memory immediately and leaves no mutable renderer authority', () => {
    const { userDataDir, memory } = setup();
    const entry = memory.save({
      title: 'Routine', text: 'Prepare a daily brief.', kind: 'routine',
      sensitivity: 'normal', providerUse: 'allowed', enabled: true,
    });
    expect(memory.remove(entry.memoryId)?.memoryId).toBe(entry.memoryId);
    expect(memory.get(entry.memoryId)).toBeUndefined();
    expect(createMorpheusMemoryStore({ userDataDir }).get(entry.memoryId)).toBeUndefined();
  });
});
