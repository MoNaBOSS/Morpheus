/** Truthful runtime, provider, trust, and workspace state for the Command Center. */
import { useTranslation } from 'react-i18next';
import { Activity, Cpu, FolderRoot, ShieldAlert, ShieldCheck } from 'lucide-react';

import { StatusDot } from '@/components/morpheus/ui';
import { useGatewayStore } from '@/stores/gateway';
import { useProviderStore } from '@/stores/providers';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';

type RuntimeCellProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  testId: string;
  children?: React.ReactNode;
  ready?: boolean;
  profile?: string;
};

function RuntimeCell({ icon, label, value, testId, children, ready, profile }: RuntimeCellProps) {
  return (
    <div
      data-testid={testId}
      data-ready={typeof ready === 'boolean' ? String(ready) : undefined}
      data-profile={profile}
      className="flex min-w-0 items-center gap-2.5 px-3 py-2 first:pl-0"
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
          {children}
          <p className="truncate text-2xs text-foreground" title={value}>{value}</p>
        </div>
      </div>
    </div>
  );
}

export function RuntimeStatusBar() {
  const { t } = useTranslation('dashboard');
  const gatewayStatus = useGatewayStore((state) => state.status);
  const accounts = useProviderStore((state) => state.accounts);
  const defaultAccountId = useProviderStore((state) => state.defaultAccountId);
  const permission = useMorpheusCommandStore((state) => state.permission);
  const filesRoot = useMorpheusCommandStore((state) => state.filesRoot);

  const running = gatewayStatus.state === 'running';
  const ready = running && gatewayStatus.gatewayReady !== false;
  const activeAccount = defaultAccountId
    ? accounts.find((account) => account.id === defaultAccountId)
    : undefined;
  const providerLabel = activeAccount?.label
    ? `${activeAccount.label}${activeAccount.model ? ` · ${activeAccount.model}` : ''}`
    : t('morpheus.status.providerUnknown');
  const runtimeLabel = ready
    ? t('morpheus.status.runtimeReady')
    : running
      ? t('morpheus.status.runtimeStarting')
      : t('morpheus.status.runtimeStopped');
  const profileLabel = permission
    ? t(`morpheus.permission.profiles.${permission.profile}.name`)
    : t('morpheus.permission.loading');

  return (
    <div
      data-testid="morpheus-runtime-status"
      className="grid min-w-0 flex-1 grid-cols-2 divide-x divide-border/60 rounded-md border border-border/70 bg-[hsl(var(--morpheus-surface-2))]/75 px-3 lg:grid-cols-4"
    >
      <RuntimeCell
        testId="morpheus-runtime-gateway"
        icon={<Activity className="h-4 w-4" />}
        label={t('morpheus.status.runtime')}
        value={runtimeLabel}
        ready={ready}
      >
        <StatusDot tone={ready ? 'ok' : running ? 'warn' : 'idle'} />
      </RuntimeCell>
      <RuntimeCell
        testId="morpheus-runtime-provider"
        icon={<Cpu className="h-4 w-4" />}
        label={t('morpheus.status.provider')}
        value={providerLabel}
      />
      <RuntimeCell
        testId="morpheus-runtime-profile"
        icon={permission?.auditDegraded
          ? <ShieldAlert className="h-4 w-4 text-[hsl(var(--morpheus-danger))]" />
          : <ShieldCheck className="h-4 w-4" />}
        label={t('morpheus.status.trust')}
        value={profileLabel}
        profile={permission?.profile ?? 'unknown'}
      >
        <StatusDot tone={permission?.auditDegraded ? 'error' : 'ok'} />
      </RuntimeCell>
      <RuntimeCell
        testId="morpheus-runtime-workspace"
        icon={<FolderRoot className="h-4 w-4" />}
        label={t('morpheus.status.workspace')}
        value={filesRoot ?? t('morpheus.artifacts.rootUnknown')}
      />
      {permission?.auditDegraded ? (
        <span data-testid="morpheus-audit-degraded" className="sr-only">{t('morpheus.status.auditDegraded')}</span>
      ) : null}
    </div>
  );
}
