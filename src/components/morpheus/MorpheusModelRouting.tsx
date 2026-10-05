import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, RefreshCw, Route } from 'lucide-react';
import { hostApi } from '@/lib/host-api';
import { Input } from '@/components/ui/input';
import { useProviderStore } from '@/stores/providers';
import type { ProviderAccount } from '@/lib/providers';
import {
  DEFAULT_MORPHEUS_PLANNER_ROUTING,
  isMorpheusPlannerRoutingPolicy,
  normalizeMorpheusPlannerRoutingPolicy,
  type MorpheusPlannerAccountRoutes,
  type MorpheusPlannerRoutingPolicy,
} from '@shared/morpheus/planner-routing';

type RoutingSnapshot = { policy: MorpheusPlannerRoutingPolicy; account: ProviderAccount | null };
type Feedback = 'saved' | 'loadError' | 'saveError' | 'invalidModel' | 'changed' | null;

function accountIdentity(account: ProviderAccount | null): string {
  return JSON.stringify(account && [account.id, account.vendorId, account.authMode, account.enabled,
    account.baseUrl, account.apiProtocol, account.model, account.fallbackModels,
    account.metadata?.customModels, account.updatedAt]);
}

function modelChoices(account: ProviderAccount | null): string[] {
  return [...new Set([account?.model, ...(account?.fallbackModels ?? []), ...(account?.metadata?.customModels ?? [])]
    .filter((value): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200
      && !/\s/.test(value) && !Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)))];
}

async function readSnapshot(): Promise<RoutingSnapshot> {
  const [settings, accounts, defaultInfo] = await Promise.all([
    hostApi.settings.getAll(), hostApi.providers.accounts(), hostApi.providers.getDefaultAccount(),
  ]);
  return { policy: normalizeMorpheusPlannerRoutingPolicy(settings.morpheusPlannerRouting),
    account: accounts.find((account) => account.id === defaultInfo.accountId && account.enabled) ?? null };
}

/** Task planning preferences only; provider accounts and conversation choices keep their owners. */
export function MorpheusModelRouting() {
  const { t } = useTranslation('dashboard');
  const providerRevision = useProviderStore((state) => JSON.stringify([state.defaultAccountId,
    state.accounts.map((account) => [account.id, account.updatedAt, account.enabled, account.model])]));
  const [snapshot, setSnapshot] = useState<RoutingSnapshot | null>(null);
  const [mode, setMode] = useState<MorpheusPlannerRoutingPolicy['mode']>(DEFAULT_MORPHEUS_PLANNER_ROUTING.mode);
  const [roles, setRoles] = useState<MorpheusPlannerAccountRoutes>({});
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const generation = useRef(0);
  const operation = useRef(false);
  const mounted = useRef(true);
  const snapshotRef = useRef<RoutingSnapshot | null>(null);
  const account = snapshot?.account ?? null;
  const choices = modelChoices(account);
  const loadedRoles = snapshot?.policy.routes[account?.id ?? ''] ?? {};
  const dirty = Boolean(snapshot && (mode !== snapshot.policy.mode || JSON.stringify(roles) !== JSON.stringify(loadedRoles)));

  const applySnapshot = useCallback((next: RoutingSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
    setMode(next.policy.mode);
    setRoles(next.account ? next.policy.routes[next.account.id] ?? {} : {});
  }, []);

  const refresh = useCallback(async () => {
    if (operation.current) return;
    const id = ++generation.current;
    setBusy(true);
    setFeedback(null);
    try {
      const next = await readSnapshot();
      if (!mounted.current || id !== generation.current) return;
      const previous = snapshotRef.current;
      const changed = previous && (accountIdentity(previous.account) !== accountIdentity(next.account)
        || previous.policy.mode !== next.policy.mode
        || JSON.stringify(previous.policy.routes[previous.account?.id ?? ''] ?? {}) !== JSON.stringify(next.policy.routes[next.account?.id ?? ''] ?? {}));
      if (!previous || changed) applySnapshot(next);
      else { snapshotRef.current = next; setSnapshot(next); }
      if (changed) setFeedback('changed');
    } catch {
      if (mounted.current && id === generation.current) setFeedback('loadError');
    } finally {
      if (mounted.current && id === generation.current) setBusy(false);
    }
  }, [applySnapshot]);

  useEffect(() => { void refresh(); }, [providerRevision, refresh]);
  useEffect(() => {
    mounted.current = true;
    const focus = () => { void refresh(); };
    const invalidate = () => { mounted.current = false; generation.current++; };
    window.addEventListener('focus', focus);
    return () => { invalidate(); window.removeEventListener('focus', focus); };
  }, [refresh]);

  async function save(): Promise<void> {
    if (!snapshot || operation.current || busy || !dirty) return;
    operation.current = true;
    const id = ++generation.current;
    const loaded = snapshot;
    const draftMode = mode;
    const draftRoles: MorpheusPlannerAccountRoutes = {};
    for (const role of ['efficientModelId', 'strongModelId'] as const) {
      const model = roles[role]?.trim();
      if (model) draftRoles[role] = model;
    }
    setBusy(true);
    setSaving(true);
    setFeedback(null);
    try {
      const current = await readSnapshot();
      if (!mounted.current || id !== generation.current) return;
      const loadedAccountId = loaded.account?.id;
      if (accountIdentity(current.account) !== accountIdentity(loaded.account)
        || current.policy.mode !== loaded.policy.mode
        || JSON.stringify(current.policy.routes[loadedAccountId ?? ''] ?? {}) !== JSON.stringify(loaded.policy.routes[loadedAccountId ?? ''] ?? {})) {
        applySnapshot(current);
        setFeedback('changed');
        return;
      }
      const routes = { ...current.policy.routes };
      if (loadedAccountId) {
        if (Object.keys(draftRoles).length) routes[loadedAccountId] = draftRoles;
        else delete routes[loadedAccountId];
      }
      const next = { mode: draftMode, routes };
      if (!isMorpheusPlannerRoutingPolicy(next)) { setFeedback('invalidModel'); return; }
      await hostApi.settings.set('morpheusPlannerRouting', next);
      if (!mounted.current || id !== generation.current) return;
      applySnapshot({ ...current, policy: next });
      setFeedback('saved');
      // Provider changes can arrive while the explicit save is in flight. The
      // write stays scoped to its loaded account; refresh its displayed owner.
      const latest = await readSnapshot().catch(() => null);
      if (!mounted.current || id !== generation.current || !latest) return;
      const changed = accountIdentity(latest.account) !== accountIdentity(current.account)
        || latest.policy.mode !== next.mode
        || JSON.stringify(latest.policy.routes[loadedAccountId ?? ''] ?? {}) !== JSON.stringify(next.routes[loadedAccountId ?? ''] ?? {});
      applySnapshot(latest);
      if (changed) setFeedback('changed');
    } catch {
      if (mounted.current && id === generation.current) setFeedback('saveError');
    } finally {
      operation.current = false;
      if (mounted.current && id === generation.current) { setBusy(false); setSaving(false); }
    }
  }

  const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50';
  return <section data-testid="morpheus-model-routing" aria-labelledby="morpheus-model-routing-title" className="rounded-xl border border-border bg-surface-input p-4">
    <div className="flex items-start gap-3">
      <Route size={18} className="mt-0.5 shrink-0 text-[hsl(var(--morpheus-accent))]" aria-hidden />
      <div className="min-w-0 flex-1"><h2 id="morpheus-model-routing-title" className="text-sm font-medium">{t('morpheus.modelRouting.title')}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t('morpheus.modelRouting.description')}</p></div>
    </div>
    <form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div role="group" aria-label={t('morpheus.modelRouting.title')} className="grid grid-cols-2 gap-2">
        {(['adaptive', 'fixed'] as const).map((value) => <button type="button" key={value} data-testid={`morpheus-routing-${value}`} disabled={busy || !snapshot} aria-pressed={mode === value}
          onClick={() => { setMode(value); setFeedback(null); }} className={`${buttonClass} ${mode === value ? 'bg-black/5 dark:bg-white/10 border-[hsl(var(--morpheus-accent-dim))]/60' : ''}`}>
          {t(`morpheus.modelRouting.${value}`)}
        </button>)}
      </div>
      <p data-testid="morpheus-routing-account" className="text-xs leading-relaxed text-muted-foreground break-words">{busy && !snapshot ? t('morpheus.modelRouting.loading') : account
        ? t('morpheus.modelRouting.account', { account: account.label, model: account.model || t('morpheus.modelRouting.unsetModel') })
        : t('morpheus.modelRouting.noAccount')}</p>
      <details className="group rounded-lg border border-border/70 px-3 py-2" data-testid="morpheus-routing-options">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium [&::-webkit-details-marker]:hidden">
          {t('morpheus.modelRouting.options')}<ChevronDown size={15} className="shrink-0 transition-transform motion-reduce:transition-none group-open:rotate-180" aria-hidden />
        </summary>
        <div className="mt-3 space-y-3 border-t border-border/70 pt-3">
          <p className="text-xs leading-relaxed text-muted-foreground">{t('morpheus.modelRouting.optionsBody')}</p>
          {(['efficientModelId', 'strongModelId'] as const).map((role) => <div key={role} className="space-y-1.5">
            <label htmlFor={`morpheus-routing-${role}`} className="block text-xs text-muted-foreground">{t(`morpheus.modelRouting.${role}`)}</label>
            <Input id={`morpheus-routing-${role}`} data-testid={`morpheus-routing-${role}`} value={roles[role] ?? ''} disabled={busy || !account || mode !== 'adaptive'}
              list="morpheus-routing-model-choices" placeholder={t('morpheus.modelRouting.savedModel')} maxLength={200} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              onChange={(event) => { const value = event.target.value; setRoles((previous) => { const next = { ...previous }; if (value) next[role] = value; else delete next[role]; return next; }); setFeedback(null); }}
              className="min-h-10 min-w-0 rounded-lg bg-surface-input" />
          </div>)}
          <datalist id="morpheus-routing-model-choices">{choices.map((model) => <option key={model} value={model}/>)}</datalist>
          <p className="text-xs leading-relaxed text-muted-foreground">{t('morpheus.modelRouting.scope')}</p>
        </div>
      </details>
      {feedback ? <p data-testid="morpheus-routing-feedback" role="status" className={`text-xs leading-relaxed ${feedback.endsWith('Error') || feedback === 'invalidModel' ? 'text-[hsl(var(--morpheus-warn))]' : 'text-muted-foreground'}`}>{t(`morpheus.modelRouting.${feedback}`)}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" data-testid="morpheus-routing-save" disabled={busy || !dirty || !snapshot || feedback === 'loadError'} className={`${buttonClass} border-[hsl(var(--morpheus-accent-dim))]/60 bg-[hsl(var(--morpheus-accent))]/10`}>{t(saving ? 'morpheus.modelRouting.saving' : 'morpheus.modelRouting.save')}</button>
        <button type="button" data-testid="morpheus-routing-refresh" disabled={busy} onClick={() => void refresh()} className={buttonClass}><RefreshCw size={14} aria-hidden />{t('morpheus.modelRouting.refresh')}</button>
      </div>
    </form>
  </section>;
}
