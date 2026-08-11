import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, BrainCircuit, Pencil, Plus, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';

import { EmptyState, Panel, RiskBadge, StatusDot } from '@/components/morpheus/ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useMorpheusFoundationStore } from '@/stores/morpheus-foundation';
import type { MorpheusAgentProfileDraft } from '@shared/morpheus/agent-profile-types';
import { getMorpheusActionDescriptor, listMorpheusActionIds } from '@shared/morpheus/actions/registry';

import { AgentProfileEditor } from './AgentProfileEditor';

function newAgentProfileDraft(): MorpheusAgentProfileDraft {
  return {
    name: '',
    description: '',
    instructions: '',
    planner: { kind: 'auto' },
    workspace: { rootKey: 'morpheusFiles', access: 'read-write' },
    memory: { mode: 'session', maxContextItems: 24 },
    permissionBoundary: {
      maxRiskTier: 'high',
      capabilityIds: listMorpheusActionIds().filter(
        (id) => getMorpheusActionDescriptor(id).riskTier !== 'critical',
      ),
    },
    enabled: true,
  };
}

export function AgentProfiles() {
  const { t } = useTranslation('dashboard');
  const profiles = useMorpheusFoundationStore((state) => state.agentProfiles);
  const loading = useMorpheusFoundationStore((state) => state.loading);
  const error = useMorpheusFoundationStore((state) => state.error);
  const loadModels = useMorpheusFoundationStore((state) => state.loadModels);
  const getAgentProfile = useMorpheusFoundationStore((state) => state.getAgentProfile);
  const saveAgentProfile = useMorpheusFoundationStore((state) => state.saveAgentProfile);
  const removeAgentProfile = useMorpheusFoundationStore((state) => state.removeAgentProfile);
  const resetAgentProfiles = useMorpheusFoundationStore((state) => state.resetAgentProfiles);
  const [editor, setEditor] = useState<{ draft: MorpheusAgentProfileDraft; builtIn: boolean } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => { void loadModels(); }, [loadModels]);

  const openEditor = (profileId: string) => {
    void getAgentProfile(profileId).then((profile) => {
      if (!profile) return;
      const { builtIn, createdAt: _createdAt, updatedAt: _updatedAt, v: _v, ...draft } = profile;
      setEditor({ draft, builtIn });
    });
  };

  return (
    <main data-morpheus data-testid="agent-profiles-page" className="h-full overflow-y-auto bg-[hsl(var(--morpheus-surface-1))] p-5">
      <header className="mb-4 flex items-end justify-between gap-4 border-b border-border/70 pb-3">
        <div>
          <p className="text-2xs uppercase tracking-[0.2em] text-muted-foreground">{t('morpheus.foundation.systemBuilder')}</p>
          <h1 className="mt-1 font-serif text-2xl font-normal tracking-tight">{t('morpheus.agentProfiles.title')}</h1>
          <p className="mt-1 max-w-2xl text-tiny text-muted-foreground">{t('morpheus.agentProfiles.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusDot tone="ok" label={t('morpheus.agentProfiles.mainOwned')} />
          <button
            type="button"
            data-testid="agent-profiles-reset"
            onClick={() => setResetting(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border/80 px-3 py-2 text-2xs text-muted-foreground hover:bg-white/5 hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t('morpheus.agentProfiles.reset')}
          </button>
          <button
            type="button"
            data-testid="agent-profile-create"
            onClick={() => setEditor({ draft: newAgentProfileDraft(), builtIn: false })}
            className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--morpheus-accent-dim))] bg-[hsl(var(--morpheus-accent))]/10 px-3 py-2 text-2xs text-[hsl(var(--morpheus-accent))] hover:bg-[hsl(var(--morpheus-accent))]/15"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('morpheus.agentProfiles.create')}
          </button>
        </div>
      </header>

      {error ? <p data-testid="agent-profiles-error" className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-tiny text-destructive">{error}</p> : null}
      {loading && profiles.length === 0 ? (
        <EmptyState message={t('morpheus.common.loading')} testId="agent-profiles-loading" />
      ) : profiles.length === 0 ? (
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
              className="min-h-64"
              actions={
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    data-testid={`agent-profile-edit-${profile.profileId}`}
                    onClick={() => openEditor(profile.profileId)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-[hsl(var(--morpheus-accent))]"
                    aria-label={t('morpheus.common.edit')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {!profile.builtIn ? (
                    <button
                      type="button"
                      data-testid={`agent-profile-remove-${profile.profileId}`}
                      onClick={() => setRemovingId(profile.profileId)}
                      className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-destructive"
                      aria-label={t('morpheus.common.remove')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              }
            >
              <div className="mb-2 flex items-center gap-2 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                <span>{profile.builtIn ? t('morpheus.agentProfiles.builtIn') : t('morpheus.agentProfiles.custom')}</span>
                <span>·</span>
                <StatusDot tone={profile.enabled ? 'ok' : 'idle'} label={profile.enabled ? t('morpheus.common.enabled') : t('morpheus.common.disabled')} />
              </div>
              <dl className="divide-y divide-border/60 rounded-md bg-[hsl(var(--morpheus-surface-3))]">
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

      {editor ? (
        <AgentProfileEditor
          key={editor.draft.profileId ?? 'new'}
          initial={editor.draft}
          builtIn={editor.builtIn}
          onClose={() => setEditor(null)}
          onSave={async (draft) => Boolean(await saveAgentProfile(draft))}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(removingId)}
        title={t('morpheus.agentProfiles.removeTitle')}
        message={t('morpheus.agentProfiles.removeDescription')}
        confirmLabel={t('morpheus.common.remove')}
        cancelLabel={t('morpheus.common.cancel')}
        variant="destructive"
        onCancel={() => setRemovingId(null)}
        onConfirm={async () => {
          if (!removingId) return;
          await removeAgentProfile(removingId);
          setRemovingId(null);
        }}
      />
      <ConfirmDialog
        open={resetting}
        title={t('morpheus.agentProfiles.resetTitle')}
        message={t('morpheus.agentProfiles.resetDescription')}
        confirmLabel={t('morpheus.agentProfiles.reset')}
        cancelLabel={t('morpheus.common.cancel')}
        onCancel={() => setResetting(false)}
        onConfirm={async () => {
          await resetAgentProfiles();
          setResetting(false);
        }}
      />
    </main>
  );
}
