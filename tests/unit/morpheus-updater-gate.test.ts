// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasTrustedUpdatePublisherMetadata, resolveUpdateConfiguration } from '@electron/main/updater-policy';

const mocks = vi.hoisted(() => ({
  configuration: { configured: false, reason: 'not-configured' } as ReturnType<typeof resolveUpdateConfiguration>,
  readFile: vi.fn(),
  updater: { on: vi.fn(), setFeedURL: vi.fn(), checkForUpdates: vi.fn(), downloadUpdate: vi.fn(), quitAndInstall: vi.fn(), channel: '', autoDownload: false, autoInstallOnAppQuit: false },
}));
vi.mock('node:fs', () => ({ readFileSync: mocks.readFile }));
vi.mock('electron-updater', () => ({ autoUpdater: mocks.updater }));
vi.mock('electron', () => ({ app: { getVersion: () => '1.2.0', isPackaged: true }, ipcMain: { handle: vi.fn() } }));
vi.mock('@electron/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('@electron/main/app-state', () => ({ setQuitting: vi.fn() }));
vi.mock('@electron/main/updater-policy', async (original) => ({
  ...await original<typeof import('@electron/main/updater-policy')>(),
  resolveUpdateConfiguration: () => mocks.configuration,
}));
import { AppUpdater } from '@electron/main/updater';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('process', { ...process, platform: 'win32', resourcesPath: 'C:/fixture/resources' });
  mocks.configuration = { configured: true, feedUrl: 'https://updates.morpheus.example', publisherNames: ['Fixture Publisher'] };
});
afterEach(() => vi.unstubAllGlobals());

describe('packaged updater publisher gate', () => {
  it.each([undefined, {}, { publisherName: '' }, { publisherName: 'Other Publisher' }, { publisherName: ['Fixture Publisher', 'Other Publisher'] }, { publisherName: ['Fixture Publisher', 'Fixture Publisher'] }])(
    'rejects missing, ambiguous or mismatched publisher metadata: %j', (metadata) => {
      expect(hasTrustedUpdatePublisherMetadata(['Fixture Publisher'], metadata)).toBe(false);
    },
  );
  it('accepts exact single or rotation publisher metadata only', () => {
    expect(hasTrustedUpdatePublisherMetadata(['Fixture Publisher'], { publisherName: 'Fixture Publisher' })).toBe(true);
    expect(hasTrustedUpdatePublisherMetadata(['Fixture Publisher', 'Next Publisher'], { publisherName: ['Next Publisher', 'Fixture Publisher'] })).toBe(true);
    expect(hasTrustedUpdatePublisherMetadata([], { publisherName: 'Fixture Publisher' })).toBe(false);
    expect(hasTrustedUpdatePublisherMetadata(['ValueCell'], { publisherName: 'ValueCell' })).toBe(false);
  });
  it.each(['publisherName: Other Publisher', 'provider: generic', 'publisherName: [broken'])('keeps feed and updater network inert for untrusted metadata: %s', async (metadata) => {
    mocks.readFile.mockReturnValue(metadata);
    const updater = new AppUpdater();
    expect(updater.getStatus().status).toBe('not-configured');
    await updater.checkForUpdates();
    await updater.downloadUpdate();
    expect(mocks.updater.setFeedURL).not.toHaveBeenCalled();
    expect(mocks.updater.on).not.toHaveBeenCalled();
    expect(mocks.updater.checkForUpdates).not.toHaveBeenCalled();
    expect(mocks.updater.downloadUpdate).not.toHaveBeenCalled();
  });
  it('fails closed when the packaged file cannot be read', () => {
    mocks.readFile.mockImplementation(() => { throw new Error('missing fixture file'); });
    expect(new AppUpdater().getStatus().status).toBe('not-configured');
    expect(mocks.updater.setFeedURL).not.toHaveBeenCalled();
  });
  it('enables the existing feed route only after matching packaged publisher metadata', () => {
    mocks.readFile.mockReturnValue('publisherName: Fixture Publisher');
    expect(new AppUpdater().getStatus().status).toBe('idle');
    expect(mocks.readFile).toHaveBeenCalledWith(expect.stringMatching(/app-update\.yml$/), 'utf8');
    expect(mocks.updater.setFeedURL).toHaveBeenCalledWith({ provider: 'generic', url: 'https://updates.morpheus.example/latest', useMultipleRangeRequest: false });
    expect(mocks.updater.on).toHaveBeenCalled();
  });
});
