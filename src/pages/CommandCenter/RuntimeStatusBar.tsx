/**
 * Runtime readiness, provider/model and permission profile.
 *
 * Every value here is backed by real runtime state. Where something genuinely
 * is not known — no provider configured, no model selected — it says so rather
 * than displaying a plausible guess.
 */
import { useTranslation } from 'react-i18next';
import { ShieldCheck, ShieldAlert, Cpu, Activity } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { useGatewayStore } from '@/stores/gateway';
import { useProviderStore } from '@/stores/providers';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import type { PermissionProfile } from '@shared/morpheus/permission-types';

const PROFILE_VARIANT: Record<PermissionProfile, 'secondary' | 'default' | 'warning'> = {
  strict: 'secondary',
  balanced: 'default',
  autonomous: 'warning',
};

export function RuntimeStatusBar() {
  const { t } = useTranslation('dashboard');
  const gatewayStatus = useGatewayStore((state) => state.status);
  const accounts = useProviderStore((state) => state.accounts);
  const defaultAccountId = useProviderStore((state) => state.defaultAccountId);
  const permission = useMorpheusCommandStore((state) => state.permission);

  const running = gatewayStatus.state === 'running';
  const ready = running && gatewayStatus.gatewayReady !== false;

  // Only claim a provider/model when one is genuinely configured and selected.
  // An unknown value is displayed as unknown rather than guessed.
  const activeAccount = defaultAccountId
    ? accounts.find((account) => account.id === defaultAccountId)
    : undefined;
  const providerLabel = activeAccount?.label ?? null;
  const modelLabel = activeAccount?.model ?? null;

  return (
    <div data-testid="morpheus-runtime-status" className="flex flex-wrap items-center gap-2">
      <Badge
        data-testid="morpheus-runtime-gateway"
        data-ready={ready ? 'true' : 'false'}
        variant={ready ? 'success' : running ? 'warning' : 'secondary'}
        className="gap-1"
      >
        <Activity className="h-3 w-3" aria-hidden />
        {ready
          ? t('morpheus.status.runtimeReady')
          : running
            ? t('morpheus.status.runtimeStarting')
            : t('morpheus.status.runtimeStopped')}
      </Badge>

      <Badge data-testid="morpheus-runtime-provider" variant="outline" className="gap-1">
        <Cpu className="h-3 w-3" aria-hidden />
        {providerLabel
          ? `${providerLabel}${modelLabel ? ` · ${modelLabel}` : ''}`
          : t('morpheus.status.providerUnknown')}
      </Badge>

      {permission ? (
        <Badge
          data-testid="morpheus-runtime-profile"
          data-profile={permission.profile}
          variant={PROFILE_VARIANT[permission.profile]}
          className="gap-1"
        >
          <ShieldCheck className="h-3 w-3" aria-hidden />
          {t(`morpheus.permission.profiles.${permission.profile}.name`)}
        </Badge>
      ) : null}

      {permission?.auditDegraded ? (
        // Degraded security is loud on purpose: writes and launches are blocked.
        <Badge data-testid="morpheus-audit-degraded" variant="destructive" className="gap-1">
          <ShieldAlert className="h-3 w-3" aria-hidden />
          {t('morpheus.status.auditDegraded')}
        </Badge>
      ) : null}
    </div>
  );
}
