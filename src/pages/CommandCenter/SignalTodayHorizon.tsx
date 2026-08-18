import { useTranslation } from 'react-i18next';
import { ArrowRight, BellRing, CheckCircle2, Clock3, Goal, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useMorpheusIntelligenceStore } from '@/stores/morpheus-intelligence';

export function SignalTodayHorizon() {
  const { t } = useTranslation('dashboard');
  const snapshot = useMorpheusIntelligenceStore((state) => state.proactive);
  const goals = useMorpheusIntelligenceStore((state) => state.goals.goals);
  const act = useMorpheusIntelligenceStore((state) => state.actOnAttention);
  const items = snapshot.items.filter((item) => item.status === 'open').slice(0, 4);
  const activeGoals = goals.filter((goal) => goal.status === 'active').slice(0, 2);

  return (
    <aside data-testid="command-center-today" className="signal-horizon flex min-h-0 flex-col border-r border-white/[0.07] px-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground">{t('morpheus.signalOs.today')}</p>
        <span className="font-mono text-[9px] text-muted-foreground">{items.length}</span>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="border-t border-white/[0.07] pt-4">
            <CheckCircle2 className="h-4 w-4 text-[hsl(var(--morpheus-accent))]" />
            <p className="mt-3 text-sm text-foreground/85">{t('morpheus.signalOs.todayClear')}</p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{t('morpheus.signalOs.todayClearBody')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.06] border-t border-white/[0.07]">
            {items.map((item) => (
              <li key={item.attentionId} className="py-3">
                <div className="flex items-start gap-2.5">
                  {item.sourceType === 'reminder' ? <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--morpheus-accent))]" /> : <BellRing className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[11px] font-medium text-foreground/90">{item.title}</p>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{item.detail}</p>
                    {item.suggestedObjective ? <button type="button" data-testid={`today-act-${item.attentionId}`} onClick={() => void act(item.attentionId)} className="mt-2 inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.12em] text-[hsl(var(--morpheus-accent))]">{t('morpheus.signalOs.handle')}<ArrowRight className="h-3 w-3" /></button> : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {activeGoals.length ? (
          <section className="mt-5">
            <p className="flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground"><Goal className="h-3 w-3" />{t('morpheus.signalOs.goals')}</p>
            <ul className="mt-2 divide-y divide-white/[0.06] border-t border-white/[0.07]">
              {activeGoals.map((goal, index) => {
                const completed = goal.milestones.filter((milestone) => milestone.status === 'completed').length;
                const progress = goal.milestones.length > 0 ? Math.round((completed / goal.milestones.length) * 100) : 0;
                return (
                <li key={goal.goalId} data-testid={index === 0 ? 'command-center-goal-focus' : undefined} className="py-2.5">
                  <p className="line-clamp-2 text-[11px] text-foreground/80">{goal.name}</p>
                  <p className="mt-1 text-[9px] text-muted-foreground">{completed}/{goal.milestones.length} · {goal.nextAction}</p>
                  <div className="mt-2 h-px bg-white/[0.08]">
                    <span data-testid={index === 0 ? 'command-center-goal-progress' : undefined} className="block h-px bg-[hsl(var(--morpheus-accent))]" style={{ width: `${progress}%` }} />
                  </div>
                </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>

      <Link to="/missions" className="mt-3 flex items-center justify-between border-t border-white/[0.07] pt-3 text-[9px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"><span className="flex items-center gap-2"><Sparkles className="h-3 w-3" />{t('morpheus.signalOs.allMissions')}</span><ArrowRight className="h-3 w-3" /></Link>
    </aside>
  );
}
