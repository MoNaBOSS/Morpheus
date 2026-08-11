import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workspaces: vi.fn(),
  addWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
  removeWorkspace: vi.fn(),
  openWorkspace: vi.fn(),
}));

vi.mock('@/lib/host-api', () => ({
  hostApi: { morpheus: mocks },
}));

import { useMorpheusWorkspacesStore } from '@/stores/morpheus-workspaces';

const managed = {
  v: 1 as const,
  workspaceId: 'morpheus-files',
  name: 'Morpheus Files',
  rootPath: 'C:\\Morpheus\\Files',
  kind: 'managed' as const,
  access: 'read-write' as const,
  enabled: true,
  available: true,
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
};

const client = {
  ...managed,
  workspaceId: 'workspace-client',
  name: 'Client',
  rootPath: 'C:\\Client',
  kind: 'user' as const,
};

const snapshot = {
  defaultWorkspaceId: 'morpheus-files' as const,
  workspaces: [managed, client],
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useMorpheusWorkspacesStore.setState({
    snapshot: null,
    selectedWorkspaceId: 'morpheus-files',
    loading: false,
    error: null,
  });
  mocks.workspaces.mockResolvedValue(snapshot);
  mocks.addWorkspace.mockResolvedValue({ workspace: client });
  mocks.updateWorkspace.mockResolvedValue({ workspace: client });
  mocks.removeWorkspace.mockResolvedValue({ workspace: client });
  mocks.openWorkspace.mockResolvedValue({ ok: true });
});

describe('Morpheus workspace renderer projection', () => {
  it('keeps only a logical selected id and falls back from stale selections', async () => {
    useMorpheusWorkspacesStore.setState({ selectedWorkspaceId: 'workspace-stale' });
    await useMorpheusWorkspacesStore.getState().load();

    expect(useMorpheusWorkspacesStore.getState().selectedWorkspaceId).toBe('morpheus-files');
    expect(useMorpheusWorkspacesStore.getState().snapshot).toEqual(snapshot);
  });

  it('selects only an enabled, available Main-authored workspace', async () => {
    await useMorpheusWorkspacesStore.getState().load();
    useMorpheusWorkspacesStore.getState().select('workspace-client');
    expect(useMorpheusWorkspacesStore.getState().selectedWorkspaceId).toBe('workspace-client');

    useMorpheusWorkspacesStore.getState().select('workspace-unknown');
    expect(useMorpheusWorkspacesStore.getState().selectedWorkspaceId).toBe('workspace-client');
  });

  it('adds metadata only and lets Main choose the directory', async () => {
    const added = await useMorpheusWorkspacesStore.getState().add({
      name: 'Client', access: 'read',
    });

    expect(mocks.addWorkspace).toHaveBeenCalledWith({ name: 'Client', access: 'read' });
    expect(added).toEqual(client);
    expect(useMorpheusWorkspacesStore.getState().selectedWorkspaceId).toBe('workspace-client');
  });

  it('uses typed Main actions for opening and removal', async () => {
    await useMorpheusWorkspacesStore.getState().load();
    useMorpheusWorkspacesStore.getState().select('workspace-client');
    await useMorpheusWorkspacesStore.getState().open();
    await useMorpheusWorkspacesStore.getState().remove('workspace-client');

    expect(mocks.openWorkspace).toHaveBeenCalledWith('workspace-client');
    expect(mocks.removeWorkspace).toHaveBeenCalledWith('workspace-client');
    expect(useMorpheusWorkspacesStore.getState().selectedWorkspaceId).toBe('morpheus-files');
  });
});
