import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot } from 'lucide-react';

import { useMorpheusExecutionContextStore } from '@/stores/morpheus-execution-context';
import { useMorpheusFoundationStore } from '@/stores/morpheus-foundation';
import { cn } from '@/lib/utils';
import { MorpheusWorkspaceControl } from './MorpheusWorkspaceControl';

export function MorpheusObjectiveContextPicker({ className }: { className?: string }) {
  const { t } = useTranslation('dashboard');
  const profiles = useMorpheusFoundationStore((state) => state.agentProfiles);
  const loadModels = useMorpheusFoundationStore((state) => state.loadModels);
  const selectedAgentProfileId = useMorpheusExecutionContextStore((state) => state.selectedAgentProfileId);
  const selectAgentProfile = useMorpheusExecutionContextStore((state) => state.selectAgentProfile);

  useEffect(() => {
    let active = true;
    void loadModels().then(() => {
      if (!active) return;
      const persistedId = useMorpheusExecutionContextStore.getState().selectedAgentProfileId;
      const available = useMorpheusFoundationStore.getState().agentProfiles
        .some((profile) => profile.enabled && profile.profileId === persistedId);
      if (persistedId && !available) selectAgentProfile(null);
    });
    return () => { active = false; };
  }, [loadModels, selectAgentProfile]);

  const enabledProfiles = profiles.filter((profile) => profile.enabled);
  const selected = enabledProfiles.find((profile) => profile.profileId === selectedAgentProfileId);

  return (
    <div data-testid="morpheus-objective-context" className={cn('flex min-w-0 items-center gap-2', className)}>
      <MorpheusWorkspaceControl compact />
      <div className="flex min-w-0 items-center gap-1.5">
        <Bot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <select
          data-testid="morpheus-agent-profile-select"
          value={selected?.profileId ?? ''}
          disabled={enabledProfiles.length === 0}
          onChange={(event) => selectAgentProfile(event.target.value || null)}
          aria-label={t('morpheus.agentProfiles.active')}
          className="min-w-0 max-w-44 rounded-md border border-border/70 bg-[hsl(var(--morpheus-surface-2))] px-2 py-1.5 text-2xs text-foreground outline-none focus:border-[hsl(var(--morpheus-accent-dim))]"
        >
          <option value="">{t('morpheus.agentProfiles.automatic')}</option>
          {enabledProfiles.map((profile) => (
            <option key={profile.profileId} value={profile.profileId}>{profile.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
