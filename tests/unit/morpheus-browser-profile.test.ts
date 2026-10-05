import { describe, expect, it, vi } from 'vitest';
import { existingChromeProfile } from '@electron/services/morpheus/capabilities/win32/browser-profile';

describe('existing Chrome profile selection', () => {
  it.each(['Default', 'Profile 1', 'Profile 24'])('accepts the existing last-used profile: %s', (directory) => {
    expect(existingChromeProfile({ profile: { last_used: directory, info_cache: { [directory]: { name: 'fixture' } } } })).toBe(directory);
  });
  it.each(['../outside', 'Profile 1 --user-data-dir=other', 'C:\\other', 'Default/child', '--incognito', 'Profile 0', 'Profile 1\n'])('rejects unsafe or unsupported profile names: %s', (directory) => {
    expect(existingChromeProfile({ profile: { last_used: directory, info_cache: { [directory]: {} } } })).toBeNull();
  });
  it('requires profile metadata and never guesses or creates a profile', () => {
    expect(existingChromeProfile({ profile: { last_used: 'Profile 1', info_cache: { Default: {} } } })).toBeNull();
    expect(existingChromeProfile(null)).toBeNull();
    expect(existingChromeProfile({})).toBeNull();
  });
});

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), open: vi.fn(), external: vi.fn() }));
vi.mock('electron', () => ({ shell: { openExternal: mocks.external } }));
vi.mock('@electron/services/morpheus/capabilities/win32/browser-profile', async (original) => ({
  ...await original<typeof import('@electron/services/morpheus/capabilities/win32/browser-profile')>(),
  resolveExistingChromeProfile: mocks.resolve, openInExistingChromeProfile: mocks.open,
}));

import { win32OpenUrlCapability } from '@electron/services/morpheus/capabilities/win32/open-url';
import type { MorpheusCapabilityContext } from '@electron/services/morpheus/capability-registry';
const context = { env: {} } as MorpheusCapabilityContext;

describe('public URL capability browser delegation', () => {
  it('pins an existing profile and preserves the exact encoded site query', async () => {
    vi.clearAllMocks(); mocks.resolve.mockResolvedValue({ directory: 'Profile 1' });
    const url = 'https://www.youtube.com/results?search_query=Mr%20Beast';
    const action = await win32OpenUrlCapability.resolve({ url }, context);
    await action.execute();
    expect(mocks.open).toHaveBeenCalledWith({ directory: 'Profile 1' }, url);
    expect(mocks.external).not.toHaveBeenCalled();
  });
  it('retains Windows default delegation for other browsers or missing valid metadata', async () => {
    vi.clearAllMocks(); mocks.resolve.mockResolvedValue(null);
    await (await win32OpenUrlCapability.resolve({ url: 'https://example.com/' }, context)).execute();
    expect(mocks.external).toHaveBeenCalledWith('https://example.com/');
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it('does not silently select another profile after a prepared browser launch fails', async () => {
    vi.clearAllMocks(); mocks.resolve.mockResolvedValue({ directory: 'Default' }); mocks.open.mockRejectedValue(new Error('fixture'));
    await expect((await win32OpenUrlCapability.resolve({ url: 'https://example.com/' }, context)).execute()).rejects.toMatchObject({ code: 'execution-failed' });
    expect(mocks.external).not.toHaveBeenCalled();
  });
});
