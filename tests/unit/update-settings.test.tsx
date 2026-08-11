import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  checkForUpdates: vi.fn(),
  downloadUpdate: vi.fn(),
  installUpdate: vi.fn(),
  cancelAutoInstall: vi.fn(),
  clearError: vi.fn(),
  status: 'not-configured' as 'not-configured' | 'idle',
}));

vi.mock('@/stores/update', () => ({
  useUpdateStore: () => ({
    status: mocks.status,
    currentVersion: '1.0.0',
    updateInfo: null,
    progress: null,
    error: null,
    isInitialized: true,
    autoInstallCountdown: null,
    init: mocks.init,
    checkForUpdates: mocks.checkForUpdates,
    downloadUpdate: mocks.downloadUpdate,
    installUpdate: mocks.installUpdate,
    cancelAutoInstall: mocks.cancelAutoInstall,
    clearError: mocks.clearError,
  }),
}));

const translations: Record<string, string> = {
  'updates.currentVersion': 'Current Version',
  'updates.status.notConfigured': 'Updates are not configured for this build',
  'updates.status.check': 'Check for updates to get the latest features',
  'updates.action.notConfigured': 'Not Configured',
  'updates.action.check': 'Check for Updates',
  'updates.helpNotConfigured': 'This build has no Morpheus update endpoint configured and will not contact an update service.',
  'updates.help': 'Morpheus checks for updates automatically.',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => translations[key] ?? key }),
}));

import { UpdateSettings } from '@/components/settings/UpdateSettings';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.status = 'not-configured';
  mocks.init.mockResolvedValue(undefined);
});

describe('Morpheus update settings', () => {
  it('renders an honest disabled state when no Morpheus update endpoint exists', () => {
    render(<UpdateSettings />);

    expect(screen.getByTestId('update-status-text')).toHaveTextContent('Updates are not configured');
    expect(screen.getByTestId('update-not-configured-action')).toBeDisabled();
    expect(screen.getByText(/will not contact an update service/i)).toBeVisible();
    expect(mocks.checkForUpdates).not.toHaveBeenCalled();
  });

  it('retains the manual check action when an update service is configured', () => {
    mocks.status = 'idle';
    render(<UpdateSettings />);

    expect(screen.getByRole('button', { name: 'Check for Updates' })).toBeEnabled();
    expect(screen.queryByTestId('update-not-configured-action')).not.toBeInTheDocument();
  });
});
