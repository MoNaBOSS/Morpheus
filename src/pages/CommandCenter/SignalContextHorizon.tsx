import { useTranslation } from 'react-i18next';
import { Cpu, FolderOpen, Layers3, ShieldCheck } from 'lucide-react';

import { MorpheusObjectiveContextPicker } from '@/components/morpheus/MorpheusObjectiveContextPicker';
import { useGatewayStore } from '@/stores/gateway';
import { useProviderStore } from '@/stores/providers';
import { useMorpheusCommandStore } from '@/stores/morpheus-command';
import { ArtifactsPanel } from './ArtifactsPanel';

export function SignalContextHorizon() {
  const { t } = useTranslation('dashboard');
  const gateway = useGatewayStore((state) => state.status);
  const accounts = useProviderStore((state) => state.accounts);
  const defaultAccountId = useProviderStore((state) => state.defaultAccountId);
  const permission = useMorpheusCommandStore((state) => state.permission);
  const account = accounts.find((candidate) => candidate.id === defaultAccountId);
  const runtimeReady = gateway.state === 'running' && gateway.gatewayReady !== false;

  return (
    <aside data-testid="command-center-context-rail" className="signal-horizon min-h-0 overflow-y-auto border-l border-white/[0.07] px-4 py-4">
      <p className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground">{t('morpheus.signalOs.context')}</p>
      <div className="mt-3 border-y border-white/[0.07] py-3">
        <MorpheusObjectiveContextPicker className="min-w-0" />
      </div>

      <dl className="divide-y divide-white/[0.06]">
        <div className="flex items-start gap-3 py-3">
          <Cpu className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
          <div className="min-w-0"><dt className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{t('morpheus.status.runtime')}</dt><dd data-testid="morpheus-runtime-gateway" data-ready={String(runtimeReady)} className="mt-1 text-[11px] text-foreground/85">{runtimeReady ? t('morpheus.status.runtimeReady') : t('morpheus.status.runtimeStarting')}</dd></div>
        </div>
        <div className="flex items-start gap-3 py-3">
          <Layers3 className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
          <div className="min-w-0"><dt className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{t('morpheus.status.provider')}</dt><dd data-testid="morpheus-runtime-provider" className="mt-1 truncate text-[11px] text-foreground/85">{account ? `${account.label}${account.model ? ` · ${account.model}` : ''}` : t('morpheus.status.providerUnknown')}</dd></div>
        </div>
        <div className="flex items-start gap-3 py-3">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 text-[hsl(var(--morpheus-accent))]" />
          <div className="min-w-0"><dt className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{t('morpheus.status.trust')}</dt><dd data-testid="morpheus-runtime-profile" data-profile={permission?.profile ?? 'unknown'} className="mt-1 text-[11px] text-foreground/85">{permission ? t(`morpheus.permission.profiles.${permission.profile}.name`) : t('morpheus.permission.loading')}</dd><p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">{permission?.auditDegraded ? t('morpheus.status.auditDegraded') : t('morpheus.signalOs.trustReason')}</p>{permission ? <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 font-mono text-[8px] text-muted-foreground"><span data-testid="morpheus-session-grant-count">{t('morpheus.permission.sessionCount', { count: permission.sessionGrants.length })}</span><span data-testid="morpheus-persistent-grant-count">{t('morpheus.permission.persistentCount', { count: permission.persistentGrants.length })}</span></p> : null}</div>
        </div>
      </dl>

      <section className="mt-4 border-t border-white/[0.07] pt-4">
        <p className="mb-2 flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground"><FolderOpen className="h-3 w-3" />{t('morpheus.signalOs.artifacts')}</p>
        <ArtifactsPanel limit={2} />
      </section>
    </aside>
  );
}
