import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createMorpheusRootProvider } from '@electron/services/morpheus/roots';
import { createMorpheusWorkspaceStore } from '@electron/services/morpheus/workspaces/workspace-store';
import { createMorpheusGrantStore } from '@electron/services/morpheus/policy/grant-store';

const scratch = mkdtempSync(join(tmpdir(), 'morpheus-workspaces-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let userDataDir: string;
let sequence = 0;

beforeEach(() => {
  sequence += 1;
  userDataDir = join(scratch, `case-${sequence}`);
  mkdirSync(userDataDir, { recursive: true });
});

function createStore() {
  let id = 0;
  return createMorpheusWorkspaceStore({
    userDataDir,
    now: () => new Date('2026-08-11T00:00:00.000Z'),
    createId: () => `workspace-${++id}`,
  });
}

describe('Morpheus workspace store', () => {
  it('keeps the managed root canonical and preserves its user metadata', () => {
    const first = createStore();
    const managed = first.update({
      workspaceId: 'morpheus-files', name: 'Primary workspace', access: 'read',
    });
    const second = createStore();
    const restored = second.get('morpheus-files');

    expect(restored).toMatchObject({
      name: 'Primary workspace', access: 'read', kind: 'managed', enabled: true,
      rootPath: managed.rootPath,
    });
    expect(existsSync(restored?.rootPath ?? '')).toBe(true);
  });

  it('canonicalizes a selected directory and deduplicates the same root', () => {
    const folder = join(userDataDir, 'Client Workspace');
    mkdirSync(folder, { recursive: true });
    const store = createStore();
    const first = store.add(folder, { name: 'Client' });
    const duplicate = store.add(folder, { name: 'Ignored duplicate' });

    expect(duplicate.workspaceId).toBe(first.workspaceId);
    expect(store.list().workspaces).toHaveLength(2);
    const persisted = JSON.parse(readFileSync(
      join(userDataDir, 'morpheus', 'workspaces.json'), 'utf8',
    )) as { workspaces: Array<{ rootPath: string }> };
    expect(persisted.workspaces.some((workspace) => workspace.rootPath === first.rootPath)).toBe(true);
  });

  it('removes only registration state and never deletes workspace contents', () => {
    const folder = join(userDataDir, 'keep-me');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'important.txt'), 'still here', 'utf8');
    const store = createStore();
    const workspace = store.add(folder);

    expect(store.remove(workspace.workspaceId)?.workspaceId).toBe(workspace.workspaceId);
    expect(readFileSync(join(folder, 'important.txt'), 'utf8')).toBe('still here');
    expect(() => store.remove('morpheus-files')).toThrow(/cannot be removed/);
  });

  it('marks missing roots unavailable and refuses to resolve them', () => {
    const folder = join(userDataDir, 'temporary');
    mkdirSync(folder, { recursive: true });
    const store = createStore();
    const workspace = store.add(folder);
    rmSync(folder, { recursive: true, force: true });

    expect(store.get(workspace.workspaceId)?.available).toBe(false);
    expect(() => store.resolveRoot(workspace.workspaceId)).toThrow(/unavailable/);
  });

  it('detects a registered root redirected to a different directory', () => {
    const original = join(userDataDir, 'original');
    const moved = join(userDataDir, 'moved');
    const replacement = join(userDataDir, 'replacement');
    mkdirSync(original, { recursive: true });
    mkdirSync(replacement, { recursive: true });
    const store = createStore();
    const workspace = store.add(original);

    renameSync(original, moved);
    symlinkSync(replacement, original, process.platform === 'win32' ? 'junction' : 'dir');

    expect(store.get(workspace.workspaceId)?.available).toBe(false);
    expect(() => store.resolveRoot(workspace.workspaceId)).toThrow(/root changed/);
  });

  it('captures a different immutable root provider for each logical workspace', () => {
    const alpha = join(userDataDir, 'alpha');
    const beta = join(userDataDir, 'beta');
    mkdirSync(alpha, { recursive: true });
    mkdirSync(beta, { recursive: true });
    const store = createStore();
    const alphaWorkspace = store.add(alpha);
    const betaWorkspace = store.add(beta);
    const roots = createMorpheusRootProvider({ userDataDir, workspaces: store });

    expect(roots.forWorkspace(alphaWorkspace.workspaceId).resolve('morpheusFiles'))
      .toBe(alphaWorkspace.rootPath);
    expect(roots.forWorkspace(betaWorkspace.workspaceId).resolve('morpheusFiles'))
      .toBe(betaWorkspace.rootPath);
  });

  it('never reuses an exact-scope grant across workspace roots', () => {
    const grants = createMorpheusGrantStore({
      userDataDir,
      createId: () => 'grant-alpha',
      now: () => new Date('2026-08-11T00:00:00.000Z'),
    });
    const scope = {
      capabilityId: 'file.createText' as const,
      capabilityGroup: 'workspace.write' as const,
      platform: 'win32',
      resourceScope: 'C:\\Workspaces\\Alpha',
      riskTier: 'medium' as const,
      originType: 'command-bar' as const,
    };
    grants.createGrant(scope, 'session');

    expect(grants.findGrant(scope)?.grantId).toBe('grant-alpha');
    expect(grants.findGrant({ ...scope, resourceScope: 'C:\\Workspaces\\Beta' })).toBeUndefined();
    expect(grants.revokeForResourceScope('C:\\Workspaces\\Alpha')).toBe(1);
    expect(grants.findGrant(scope)).toBeUndefined();
  });
});
