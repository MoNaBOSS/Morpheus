import { AlertTriangle, Bell, BellOff, ChevronRight, Clock3, Sparkles, Target, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { EmptyState, StatusDot } from '@/components/morpheus/ui';
import { useMorpheusIntelligenceStore } from '@/stores/morpheus-intelligence';
import type { MorpheusAttentionItem } from '@shared/morpheus/proactive-types';

function AttentionIcon({ item }: { item: MorpheusAttentionItem }) {
  if (item.severity === 'urgent') return <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--morpheus-danger))]" />;
  if (item.sourceType === 'goal') return <Target className="h-3.5 w-3.5 text-[hsl(var(--morpheus-warning))]" />;
  if (item.sourceType === 'reminder') return <Clock3 className="h-3.5 w-3.5 text-[hsl(var(--morpheus-accent))]" />;
  return <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />;
}

export function TodayPanel() {
  const { t } = useTranslation('dashboard');
  const snapshot = useMorpheusIntelligenceStore((state) => state.proactive);
  const dismiss = useMorpheusIntelligenceStore((state) => state.dismissAttention);
  const snooze = useMorpheusIntelligenceStore((state) => state.snoozeAttention);
  const act = useMorpheusIntelligenceStore((state) => state.actOnAttention);
  const updateSettings = useMorpheusIntelligenceStore((state) => state.updateProactiveSettings);
  const items = snapshot.items.filter((item) => item.status === 'open').slice(0, 5);
  const itemTitle = (item: MorpheusAttentionItem): string => item.presentationKey === 'reminder'
    ? item.title
    : t(`morpheus.today.itemTitles.${item.presentationKey}`);

  return (
    <section data-testid="command-center-today" className="flex max-h-[300px] min-h-[150px] shrink-0 flex-col border-b border-border/60 bg-[hsl(var(--morpheus-surface-2))]/35">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/40 px-3">
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">{t('morpheus.today.title')}</span>
          <span className="rounded-full bg-white/[0.05] px-1.5 py-0.5 font-mono text-[9px] text-foreground/70">{items.length}</span>
        </div>
        <button
          type="button"
          data-testid="today-notifications-toggle"
          aria-label={snapshot.settings.notificationsEnabled ? t('morpheus.today.disableNotifications') : t('morpheus.today.enableNotifications')}
          onClick={() => void updateSettings({ notificationsEnabled: !snapshot.settings.notificationsEnabled })}
          className="rounded p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground"
        >
          {snapshot.settings.notificationsEnabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? <EmptyState message={t('morpheus.today.clear')} /> : items.map((item) => (
          <article key={item.attentionId} data-testid={`today-item-${item.attentionId}`} className="group border-b border-border/35 px-3 py-2.5 last:border-b-0 hover:bg-white/[0.018]">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5"><AttentionIcon item={item} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-2xs font-medium text-foreground/90">{itemTitle(item)}</p>
                  <StatusDot tone={item.severity === 'urgent' ? 'error' : item.severity === 'attention' ? 'warn' : 'idle'} />
                </div>
                <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{item.detail}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-muted-foreground/70">{t(`morpheus.today.sources.${item.sourceType}`)}{item.dueAt ? ` · ${new Date(item.dueAt).toLocaleDateString()}` : ''}</span>
                  <div className="flex items-center gap-1 opacity-80 transition-opacity group-hover:opacity-100">
                    <button type="button" onClick={() => void snooze(item.attentionId, new Date(Date.now() + 60 * 60_000).toISOString())} className="rounded px-1.5 py-0.5 text-[9px] text-muted-foreground hover:bg-white/5 hover:text-foreground">{t('morpheus.today.snooze')}</button>
                    <button type="button" aria-label={t('morpheus.today.dismiss')} onClick={() => void dismiss(item.attentionId)} className="rounded p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground"><X className="h-3 w-3" /></button>
                    {item.suggestedObjective ? <button type="button" data-testid={`today-act-${item.attentionId}`} onClick={() => void act(item.attentionId)} className="flex items-center gap-1 rounded border border-[hsl(var(--morpheus-accent-dim))]/40 px-1.5 py-0.5 text-[9px] text-[hsl(var(--morpheus-accent))] hover:bg-[hsl(var(--morpheus-accent))]/5">{t('morpheus.today.act')}<ChevronRight className="h-2.5 w-2.5" /></button> : null}
                  </div>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
      <Link to="/goals" className="flex h-8 shrink-0 items-center justify-between border-t border-border/40 px-3 text-[9px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground">
        {t('morpheus.today.openGoals')}<ChevronRight className="h-3 w-3" />
      </Link>
    </section>
  );
}
