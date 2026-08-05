import { useTranslation } from 'react-i18next';

import { FeedbackState } from '@/components/common/FeedbackState';
import { useMorpheusActionsStore } from '@/stores/morpheus-actions';

function formatBytes(bytes: number): string {
  const gigabytes = bytes / 1024 ** 3;
  if (gigabytes >= 1) return `${gigabytes.toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function SystemInfoPanel() {
  const { t } = useTranslation('dashboard');
  const info = useMorpheusActionsStore((state) => state.systemInfo);
  const error = useMorpheusActionsStore((state) => state.systemInfoError);

  if (!info) {
    return (
      <div data-testid="morpheus-system-panel">
        <FeedbackState
          state={error ? 'error' : 'loading'}
          title={error ? t('morpheus.systemPanel.unavailable') : t('morpheus.systemPanel.title')}
          description={error ?? undefined}
        />
      </div>
    );
  }

  const rows: Array<{ key: string; label: string; value: string }> = [
    { key: 'platform', label: t('morpheus.systemPanel.platform'), value: `${info.platform} ${info.release}` },
    { key: 'arch', label: t('morpheus.systemPanel.arch'), value: info.arch },
    { key: 'cpu', label: t('morpheus.systemPanel.cpu'), value: String(info.cpuCount) },
    {
      key: 'memory',
      label: t('morpheus.systemPanel.memory'),
      value: t('morpheus.systemPanel.memoryValue', {
        free: formatBytes(info.freeMemoryBytes),
        total: formatBytes(info.totalMemoryBytes),
      }),
    },
    { key: 'uptime', label: t('morpheus.systemPanel.uptime'), value: formatUptime(info.uptimeSeconds) },
    { key: 'appVersion', label: t('morpheus.systemPanel.appVersion'), value: info.appVersion },
    {
      key: 'runtime',
      label: t('morpheus.systemPanel.runtime'),
      value: `Electron ${info.electronVersion} · Node ${info.nodeVersion}`,
    },
  ];

  return (
    <dl data-testid="morpheus-system-panel" className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.key} className="flex items-baseline justify-between gap-3 border-b py-1.5 last:border-b-0">
          <dt className="text-tiny text-muted-foreground">{row.label}</dt>
          <dd data-testid={`morpheus-system-${row.key}`} className="truncate text-tiny font-medium">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
