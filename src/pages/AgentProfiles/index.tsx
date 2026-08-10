import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, BrainCircuit, ShieldCheck } from 'lucide-react';

import { EmptyState, Panel, RiskBadge, StatusDot } from '@/components/morpheus/ui';
import { useMorpheusFoundationStore } from '@/stores/morpheus-foundation';

export function AgentProfiles() {
  const { t } = useTranslation('dashboard');
  const profiles = useMorpheusFoundationStore((state) => state.agentProfiles);
  const loadModels = useMorpheusFoundationStore((state) => state.loadModels);
  useEffect(() => { void loadModels(); }, [loadModels]);

  return (
    <main data-morpheus data-testid="agent-profiles-page" className="h-full overflow-y-auto bg-[hsl(var(--morpheus-surface-1))] p-5">
      <header className="mb-4 flex items-end justify-between gap-4 border-b border-border/70 pb-3">
        <div>
          <p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground">{t('morpheus.foundation.systemBuilder')}</p>
          <h1 className="mt-1 font-serif text-2xl font-normal tracking-tight">{t('morpheus.agentProfiles.title')}</h1>
          <p className="mt-1 max-w-2xl text-tiny text-muted-foreground">{t('morpheus.agentProfiles.description')}</p>
        </div>
        <StatusDot tone="ok" label={t('morpheus.agentProfiles.mainOwned')} />
      </header>

      {profiles.length === 0 ? (
        <EmptyState message={t('morpheus.agentProfiles.empty')} testId="agent-profiles-empty" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {profiles.map((profile, index) => (
            <Panel
              key={profile.profileId}
              testId={`agent-profile-${profile.profileId}`}
              title={
                <span className="flex items-center gap-2">
                  {index === 0 ? <Bot className="h-4 w-4" /> : index === 1 ? <BrainCircuit className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  {profile.name}
                </span>
              }
              description={profile.description}
              className="min-h-56"
            >
              <dl className="mt-3 divide-y divide-border/60 rounded-md bg-[hsl(var(--morpheus-surface-3))]">
                <div className="flex items-center justify-between px-2.5 py-2 text-tiny">
                  <dt className="text-muted-foreground">{t('morpheus.agentProfiles.planner')}</dt>
                  <dd className="font-mono text-2xs">{profile.planner.kind}</dd>
                </div>
                <div className="flex items-center justify-between px-2.5 py-2 text-tiny">
                  <dt className="text-muted-foreground">{t('morpheus.agentProfiles.workspace')}</dt>
                  <dd>{profile.workspace.access}</dd>
                </div>
                <div className="flex items-center justify-between px-2.5 py-2 text-tiny">
                  <dt className="text-muted-foreground">{t('morpheus.agentProfiles.capabilities')}</dt>
                  <dd className="font-mono">{profile.permissionBoundary.capabilityIds.length}</dd>
                </div>
                <div className="flex items-center justify-between px-2.5 py-2 text-tiny">
                  <dt className="text-muted-foreground">{t('morpheus.agentProfiles.maxRisk')}</dt>
                  <dd><RiskBadge tier={profile.permissionBoundary.maxRiskTier} /></dd>
                </div>
              </dl>
              <p className="mt-3 text-2xs leading-relaxed text-muted-foreground">{t('morpheus.agentProfiles.authorityNote')}</p>
            </Panel>
          ))}
        </div>
      )}
    </main>
  );
}
