import { ArrowUpRight, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { useMorpheusIntelligenceStore } from '@/stores/morpheus-intelligence';
import { morpheusGoalProgress } from '@shared/morpheus/goal-types';

export function GoalFocus() {
  const { t } = useTranslation('dashboard');
  const goals = useMorpheusIntelligenceStore((state) => state.goals.goals);
  const goal = goals
    .filter((candidate) => candidate.status === 'active')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ?? null;
  const progress = goal ? morpheusGoalProgress(goal) : 0;

  return (
    <section data-testid="command-center-goal-focus" className="shrink-0 border-b border-border/50 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
          <Target className="h-3.5 w-3.5" />{t('morpheus.goals.longHorizon')}
        </p>
        {goal ? <span className="font-mono text-[9px] text-foreground/70">{progress}%</span> : null}
      </div>
      {goal ? (
        <div className="mt-2">
          <p className="truncate text-2xs font-medium text-foreground/90" title={goal.name}>{goal.name}</p>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div data-testid="command-center-goal-progress" className="h-full rounded-full bg-[hsl(var(--morpheus-accent))]" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
            <span className="text-foreground/70">{t('morpheus.goals.nextAction')}:</span> {goal.nextAction}
          </p>
          {goal.targetDate ? <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.1em] text-muted-foreground">{t('morpheus.goals.targetDate')} · {new Date(`${goal.targetDate}T00:00:00`).toLocaleDateString()}</p> : null}
        </div>
      ) : <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{t('morpheus.goals.empty')}</p>}
      <Link to="/goals" className="mt-2 inline-flex items-center gap-1 text-[9px] text-[hsl(var(--morpheus-accent))] hover:underline">
        {t('morpheus.goals.title')}<ArrowUpRight className="h-3 w-3" />
      </Link>
    </section>
  );
}
