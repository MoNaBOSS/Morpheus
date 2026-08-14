/** Truthful runtime, provider, and trust state for the Command Center. */
import { useTranslation } from 'react-i18next';
import { Activity, Cpu, ShieldAlert, ShieldCheck } from 'lucide-react';

import { StatusDot } from '@/components/morpheus/ui';
import { useGatewayStore } from '@/stores/gateway';
import { useProviderStore } from '@/stores/providers';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { MorpheusRuntimeControl } from '@/components/morpheus/MorpheusRuntimeControl';
import { PERMISSION_PROFILES, type PermissionProfile } from '@shared/morpheus/permission-types';

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
  const setProfile = useMorpheusCommandStore((state) => state.setProfile);

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
      className="morpheus-runtime-strip grid min-w-0 flex-1 grid-cols-[repeat(3,minmax(0,1fr))_auto] divide-x divide-border/50 overflow-hidden rounded-lg border border-border/60 bg-[hsl(var(--morpheus-surface-2))]/80 px-2"
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
      <div
        data-testid="morpheus-runtime-profile"
        data-profile={permission?.profile ?? 'unknown'}
        className="flex min-w-0 items-center gap-2 px-3 py-2"
      >
        <span className="shrink-0 text-muted-foreground">
          {permission?.auditDegraded
            ? <ShieldAlert className="h-4 w-4 text-[hsl(var(--morpheus-danger))]" />
            : <ShieldCheck className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 text-[8px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            <span>{t('morpheus.status.trust')}</span>
            {permission ? (
              <span className="flex min-w-0 items-center gap-1 normal-case tracking-normal" aria-label={t('morpheus.status.trust')}>
                <span data-testid="morpheus-session-grant-count">{t('morpheus.permission.sessionCount', { count: permission.sessionGrants.length })}</span>
                <span aria-hidden>·</span>
                <span data-testid="morpheus-persistent-grant-count">{t('morpheus.permission.persistentCount', { count: permission.persistentGrants.length })}</span>
                {permission.deniedScopes.length > 0 ? (
                  <>
                    <span aria-hidden>·</span>
                    <span data-testid="morpheus-denied-count" className="text-[hsl(var(--morpheus-danger))]">{t('morpheus.permission.deniedCount', { count: permission.deniedScopes.length })}</span>
                  </>
                ) : null}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex items-center gap-1" role="group" aria-label={t('morpheus.permission.profileLabel')}>
            <StatusDot tone={permission?.auditDegraded ? 'error' : 'ok'} />
            {permission ? PERMISSION_PROFILES.map((profile: PermissionProfile) => (
              <button
                key={profile}
                type="button"
                data-testid={`morpheus-profile-${profile}`}
                data-active={permission.profile === profile ? 'true' : 'false'}
                title={t(`morpheus.permission.profiles.${profile}.description`)}
                onClick={() => void setProfile(profile)}
                className="rounded border border-border/55 px-1.5 py-0.5 text-[8px] text-muted-foreground transition-colors hover:text-foreground data-[active=true]:border-[hsl(var(--morpheus-accent-dim))] data-[active=true]:bg-[hsl(var(--morpheus-accent))]/8 data-[active=true]:text-foreground"
              >
                {t(`morpheus.permission.profiles.${profile}.name`)}
              </button>
            )) : <span className="truncate text-2xs">{profileLabel}</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center pl-2">
        <MorpheusRuntimeControl compact />
      </div>
      {permission?.auditDegraded ? (
        <span data-testid="morpheus-audit-degraded" className="sr-only">{t('morpheus.status.auditDegraded')}</span>
      ) : null}
    </div>
  );
}
