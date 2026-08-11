import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, RotateCcw } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useProviderStore } from '@/stores/providers';
import type { MorpheusAgentProfileDraft } from '@shared/morpheus/agent-profile-types';
import {
  getMorpheusActionDescriptor,
  listMorpheusActionIds,
  type MorpheusActionId,
  type MorpheusRiskTier,
} from '@shared/morpheus/actions/registry';

type AgentProfileEditorProps = {
  initial: MorpheusAgentProfileDraft;
  builtIn: boolean;
  onClose: () => void;
  onSave: (draft: MorpheusAgentProfileDraft) => Promise<boolean>;
};

const RISK_ORDER: Record<MorpheusRiskTier, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const fieldClass = 'mt-1 w-full rounded-md border border-border/80 bg-[hsl(var(--morpheus-surface-3))] px-3 py-2 text-tiny text-foreground outline-none transition-colors focus:border-[hsl(var(--morpheus-accent-dim))]';
const actionIds = listMorpheusActionIds();

function copyDraft(draft: MorpheusAgentProfileDraft): MorpheusAgentProfileDraft {
  return structuredClone(draft);
}

export function AgentProfileEditor({ initial, builtIn, onClose, onSave }: AgentProfileEditorProps) {
  const { t } = useTranslation('dashboard');
  const [draft, setDraft] = useState(() => copyDraft(initial));
  const [saving, setSaving] = useState(false);
  const accounts = useProviderStore((state) => state.accounts);
  const loadProviders = useProviderStore((state) => state.init);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const eligibleAccounts = useMemo(
    () => accounts.filter((account) => account.enabled),
    [accounts],
  );
  const selectedProviderId = draft.planner.kind === 'provider' ? draft.planner.providerId : null;
  const selectedProvider = selectedProviderId
    ? eligibleAccounts.find((account) => account.id === selectedProviderId)
    : undefined;
  const canSave = Boolean(
    draft.name.trim()
      && draft.instructions.length <= 8_000
      && draft.description.length <= 300
      && draft.memory.maxContextItems >= 0
      && draft.memory.maxContextItems <= 200
      && draft.permissionBoundary.capabilityIds.length > 0
      && (draft.planner.kind !== 'provider'
        || (draft.planner.providerId && draft.planner.modelId.trim())),
  );

  const setRisk = (maxRiskTier: MorpheusRiskTier) => {
    setDraft((current) => ({
      ...current,
      permissionBoundary: {
        maxRiskTier,
        capabilityIds: current.permissionBoundary.capabilityIds.filter(
          (id) => RISK_ORDER[getMorpheusActionDescriptor(id).riskTier] <= RISK_ORDER[maxRiskTier],
        ),
      },
    }));
  };

  const toggleCapability = (capabilityId: MorpheusActionId) => {
    setDraft((current) => {
      const selected = new Set(current.permissionBoundary.capabilityIds);
      if (selected.has(capabilityId)) selected.delete(capabilityId);
      else selected.add(capabilityId);
      return {
        ...current,
        permissionBoundary: {
          ...current.permissionBoundary,
          capabilityIds: actionIds.filter((id) => selected.has(id)),
        },
      };
    });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent
        data-morpheus
        data-testid="agent-profile-editor"
        className="flex max-h-[92vh] w-[min(920px,calc(100vw-2rem))] max-w-none flex-col overflow-hidden rounded-xl border border-border/80 bg-[hsl(var(--morpheus-surface-1))] p-0 shadow-2xl"
      >
        <header className="shrink-0 border-b border-border/70 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-2xs uppercase tracking-[0.2em] text-[hsl(var(--morpheus-accent))]">
                {builtIn ? t('morpheus.agentProfiles.editor.builtIn') : t('morpheus.agentProfiles.editor.custom')}
              </p>
              <DialogTitle className="mt-1 font-serif text-xl font-normal tracking-tight">
                {draft.profileId
                  ? t('morpheus.agentProfiles.editor.editTitle')
                  : t('morpheus.agentProfiles.editor.createTitle')}
              </DialogTitle>
              <DialogDescription className="mt-1 text-tiny text-muted-foreground">
                {t('morpheus.agentProfiles.editor.description')}
              </DialogDescription>
            </div>
            <label className="flex items-center gap-2 text-tiny text-muted-foreground">
              {t('morpheus.agentProfiles.editor.enabled')}
              <Switch
                data-testid="agent-profile-enabled"
                checked={draft.enabled}
                onCheckedChange={(enabled) => setDraft((current) => ({ ...current, enabled }))}
              />
            </label>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(310px,0.9fr)]">
            <section className="space-y-3" aria-label={t('morpheus.agentProfiles.editor.identity')}>
              <h3 className="text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t('morpheus.agentProfiles.editor.identity')}
              </h3>
              <label className="block text-2xs text-muted-foreground">
                {t('morpheus.agentProfiles.editor.name')}
                <input
                  data-testid="agent-profile-name"
                  value={draft.name}
                  maxLength={80}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  className={fieldClass}
                />
              </label>
              <label className="block text-2xs text-muted-foreground">
                {t('morpheus.agentProfiles.editor.profileDescription')}
                <input
                  data-testid="agent-profile-description"
                  value={draft.description}
                  maxLength={300}
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                  className={fieldClass}
                />
              </label>
              <label className="block text-2xs text-muted-foreground">
                {t('morpheus.agentProfiles.editor.instructions')}
                <Textarea
                  data-testid="agent-profile-instructions"
                  value={draft.instructions}
                  maxLength={8_000}
                  onChange={(event) => setDraft((current) => ({ ...current, instructions: event.target.value }))}
                  className="mt-1 min-h-44 resize-y border-border/80 bg-[hsl(var(--morpheus-surface-3))] text-tiny"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-2xs text-muted-foreground">
                  {t('morpheus.agentProfiles.editor.planner')}
                  <select
                    data-testid="agent-profile-planner"
                    value={draft.planner.kind}
                    onChange={(event) => {
                      const kind = event.target.value;
                      if (kind === 'deterministic') {
                        setDraft((current) => ({ ...current, planner: { kind: 'deterministic' } }));
                      } else if (kind === 'provider') {
                        const account = eligibleAccounts[0];
                        setDraft((current) => ({
                          ...current,
                          planner: {
                            kind: 'provider',
                            providerId: account?.id ?? '',
                            modelId: account?.model ?? '',
                          },
                        }));
                      } else {
                        setDraft((current) => ({ ...current, planner: { kind: 'auto' } }));
                      }
                    }}
                    className={fieldClass}
                  >
                    <option value="auto">{t('morpheus.agentProfiles.editor.planners.auto')}</option>
                    <option value="deterministic">{t('morpheus.agentProfiles.editor.planners.deterministic')}</option>
                    <option value="provider" disabled={eligibleAccounts.length === 0}>
                      {t('morpheus.agentProfiles.editor.planners.provider')}
                    </option>
                  </select>
                </label>
                <label className="block text-2xs text-muted-foreground">
                  {t('morpheus.agentProfiles.editor.workspaceAccess')}
                  <select
                    data-testid="agent-profile-workspace-access"
                    value={draft.workspace.access}
                    onChange={(event) => setDraft((current) => ({
                      ...current,
                      workspace: { ...current.workspace, access: event.target.value as 'read' | 'read-write' },
                    }))}
                    className={fieldClass}
                  >
                    <option value="read">{t('morpheus.agentProfiles.editor.readOnly')}</option>
                    <option value="read-write">{t('morpheus.agentProfiles.editor.readWrite')}</option>
                  </select>
                </label>
              </div>

              {draft.planner.kind === 'provider' ? (
                <div className="grid gap-3 rounded-md border border-border/70 bg-[hsl(var(--morpheus-surface-2))] p-3 sm:grid-cols-2">
                  <label className="block text-2xs text-muted-foreground">
                    {t('morpheus.agentProfiles.editor.providerAccount')}
                    <select
                      data-testid="agent-profile-provider"
                      value={draft.planner.providerId}
                      onChange={(event) => {
                        const account = eligibleAccounts.find((candidate) => candidate.id === event.target.value);
                        setDraft((current) => ({
                          ...current,
                          planner: {
                            kind: 'provider',
                            providerId: event.target.value,
                            modelId: account?.model ?? '',
                          },
                        }));
                      }}
                      className={fieldClass}
                    >
                      {eligibleAccounts.map((account) => (
                        <option key={account.id} value={account.id}>{account.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-2xs text-muted-foreground">
                    {t('morpheus.agentProfiles.editor.model')}
                    <input
                      data-testid="agent-profile-model"
                      value={draft.planner.modelId}
                      list="morpheus-agent-models"
                      onChange={(event) => setDraft((current) => ({
                        ...current,
                        planner: current.planner.kind === 'provider'
                          ? { ...current.planner, modelId: event.target.value }
                          : current.planner,
                      }))}
                      className={fieldClass}
                    />
                    <datalist id="morpheus-agent-models">
                      {[selectedProvider?.model, ...(selectedProvider?.metadata?.customModels ?? [])]
                        .filter((model): model is string => Boolean(model))
                        .map((model) => <option key={model} value={model} />)}
                    </datalist>
                  </label>
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-2xs text-muted-foreground">
                  {t('morpheus.agentProfiles.editor.memory')}
                  <select
                    data-testid="agent-profile-memory"
                    value={draft.memory.mode}
                    onChange={(event) => setDraft((current) => ({
                      ...current,
                      memory: { ...current.memory, mode: event.target.value as 'none' | 'session' | 'workspace' },
                    }))}
                    className={fieldClass}
                  >
                    <option value="none">{t('morpheus.agentProfiles.editor.memoryModes.none')}</option>
                    <option value="session">{t('morpheus.agentProfiles.editor.memoryModes.session')}</option>
                    <option value="workspace">{t('morpheus.agentProfiles.editor.memoryModes.workspace')}</option>
                  </select>
                </label>
                <label className="block text-2xs text-muted-foreground">
                  {t('morpheus.agentProfiles.editor.contextItems')}
                  <input
                    data-testid="agent-profile-context-items"
                    type="number"
                    min={0}
                    max={200}
                    value={draft.memory.maxContextItems}
                    onChange={(event) => setDraft((current) => ({
                      ...current,
                      memory: { ...current.memory, maxContextItems: Number(event.target.value) },
                    }))}
                    className={fieldClass}
                  />
                </label>
              </div>
            </section>

            <section className="space-y-3" aria-label={t('morpheus.agentProfiles.editor.boundary')}>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <h3 className="text-2xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {t('morpheus.agentProfiles.editor.boundary')}
                  </h3>
                  <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">
                    {t('morpheus.agentProfiles.editor.boundaryDescription')}
                  </p>
                </div>
                <label className="w-32 shrink-0 text-2xs text-muted-foreground">
                  {t('morpheus.agentProfiles.maxRisk')}
                  <select
                    data-testid="agent-profile-max-risk"
                    value={draft.permissionBoundary.maxRiskTier}
                    onChange={(event) => setRisk(event.target.value as MorpheusRiskTier)}
                    className={fieldClass}
                  >
                    {(['low', 'medium', 'high', 'critical'] as const).map((tier) => (
                      <option key={tier} value={tier}>{t(`morpheus.risk.${tier}`)}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="max-h-[510px] space-y-1 overflow-y-auto pr-1" data-testid="agent-profile-capabilities">
                {actionIds.map((capabilityId) => {
                  const descriptor = getMorpheusActionDescriptor(capabilityId);
                  const allowedByTier = RISK_ORDER[descriptor.riskTier]
                    <= RISK_ORDER[draft.permissionBoundary.maxRiskTier];
                  const checked = draft.permissionBoundary.capabilityIds.includes(capabilityId);
                  return (
                    <label
                      key={capabilityId}
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-transparent bg-[hsl(var(--morpheus-surface-3))] px-2.5 py-2 hover:border-border/80 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40"
                    >
                      <input
                        type="checkbox"
                        data-testid={`agent-profile-capability-${capabilityId}`}
                        checked={checked}
                        disabled={!allowedByTier}
                        onChange={() => toggleCapability(capabilityId)}
                        className="h-3.5 w-3.5 accent-[hsl(var(--morpheus-accent))]"
                      />
                      <span className="min-w-0 flex-1 truncate text-tiny">{t(descriptor.labelKey)}</span>
                      <span className="font-mono text-[9px] uppercase text-muted-foreground">{descriptor.riskTier}</span>
                    </label>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border/70 bg-[hsl(var(--morpheus-surface-2))] px-5 py-3">
          <button
            type="button"
            onClick={() => setDraft(copyDraft(initial))}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-tiny text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t('morpheus.agentProfiles.editor.revert')}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-md border border-border/80 px-4 py-2 text-tiny text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-40"
            >
              {t('morpheus.common.cancel')}
            </button>
            <button
              type="button"
              data-testid="agent-profile-save"
              disabled={!canSave || saving}
              onClick={() => {
                setSaving(true);
                void onSave(draft).then((saved) => {
                  if (saved) onClose();
                }).finally(() => setSaving(false));
              }}
              className="inline-flex min-w-28 items-center justify-center gap-1.5 rounded-md border border-[hsl(var(--morpheus-accent-dim))] bg-[hsl(var(--morpheus-accent))]/10 px-4 py-2 text-tiny text-[hsl(var(--morpheus-accent))] hover:bg-[hsl(var(--morpheus-accent))]/15 disabled:opacity-35"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {t('morpheus.common.save')}
            </button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
