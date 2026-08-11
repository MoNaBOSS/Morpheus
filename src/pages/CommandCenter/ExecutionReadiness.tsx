/** Truthful idle-state readiness; every value comes from a live Main projection. */
import { useTranslation } from 'react-i18next';

import { StatusDot } from '@/components/morpheus/ui';
import { useGatewayStore } from '@/stores/gateway';
import { useMorpheusActionsStore } from '@/stores/morpheus-actions';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';

export function ExecutionReadiness() {
  const { t } = useTranslation('dashboard');
  const gateway = useGatewayStore((state) => state.status);
  const permission = useMorpheusCommandStore((state) => state.permission);
  const supported = useMorpheusActionsStore((state) => state.supportedActions);
  const gatewayReady = gateway.state === 'running' && gateway.gatewayReady !== false;
  const capabilityCount = Object.values(supported).filter((available) => available !== false).length;

  const rows = [
    {
      key: 'gateway',
      label: t('morpheus.readiness.gateway'),
      value: gatewayReady ? t('morpheus.status.runtimeReady') : t('morpheus.status.runtimeStarting'),
      tone: gatewayReady ? 'ok' as const : 'warn' as const,
    },
    {
      key: 'audit',
      label: t('morpheus.readiness.audit'),
      value: permission?.auditDegraded
        ? t('morpheus.status.auditDegraded')
        : t('morpheus.readiness.auditHealthy'),
      tone: permission?.auditDegraded ? 'error' as const : 'ok' as const,
    },
    {
      key: 'capabilities',
      label: t('morpheus.readiness.capabilities'),
      value: t('morpheus.readiness.capabilityCount', { count: capabilityCount }),
      tone: capabilityCount > 0 ? 'ok' as const : 'idle' as const,
    },
  ];

  return (
    <div data-testid="command-center-readiness" className="space-y-1">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center gap-2 rounded-lg bg-[hsl(var(--morpheus-surface-3))]/55 px-2.5 py-2">
          <StatusDot tone={row.tone} />
          <span className="min-w-0 flex-1 text-2xs text-muted-foreground">{row.label}</span>
          <span className="max-w-[55%] truncate text-right text-2xs text-foreground/80">{row.value}</span>
        </div>
      ))}
      <p className="px-2 pt-1 text-2xs leading-relaxed text-muted-foreground">
        {t('morpheus.readiness.sequential')}
      </p>
    </div>
  );
}
